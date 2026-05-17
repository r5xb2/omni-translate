const MAX_SPEAKERS = 3
const SIGNAL_SAMPLE_RATE = 16_000
const STICKY_MATCH_THRESHOLD = 0.86
const NEW_SPEAKER_MAX_SIMILARITY = 0.82
const NEW_SEGMENT_SIMILARITY_MAX = 0.8
const LAST_SPEAKER_PREFERRED_MARGIN = 0.08
const SWITCH_GAP_MS = 3_500
const MIN_ACOUSTIC_SEGMENT_MS = 1200
const MIN_SAMPLES_FOR_ACOUSTIC = 1200
const FRAME_SIZE = 400 // 25ms @ 16kHz
const FRAME_HOP = 160 // 10ms @ 16kHz
const MAX_FEATURE_FRAMES = 24

interface SpeakerProfile {
  label: string
  centroid: number[]
  samples: number
  lastSeenAt: number
}

interface PendingSwitchCandidate {
  profileIndex: number
  seenCount: number
}

export interface SpeakerAssignInput {
  startedAt: number
  endedAt: number
  audioSamples?: Float32Array
}

export interface SpeakerAssignResult {
  label: string
  method: 'acoustic' | 'silence_fallback'
  similarity: number
}

function speakerLabelByIndex(index: number): string {
  return `Speaker ${String.fromCharCode(65 + index)}`
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length)
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function normalizeVector(raw: number[]): number[] {
  const norm = Math.sqrt(raw.reduce((sum, v) => sum + v * v, 0))
  if (norm <= 0) return raw.map(() => 0)
  return raw.map((v) => v / norm)
}

function buildFrameStarts(totalSamples: number): number[] {
  if (totalSamples < FRAME_SIZE) return []
  const frameCount = Math.floor((totalSamples - FRAME_SIZE) / FRAME_HOP) + 1
  if (frameCount <= MAX_FEATURE_FRAMES) {
    return Array.from({ length: frameCount }, (_, i) => i * FRAME_HOP)
  }

  const step = Math.max(1, Math.floor(frameCount / MAX_FEATURE_FRAMES))
  const starts: number[] = []
  for (let i = 0; i < frameCount && starts.length < MAX_FEATURE_FRAMES; i += step) {
    starts.push(i * FRAME_HOP)
  }
  return starts
}

function goertzelPower(samples: Float32Array, targetHz: number, sampleRate: number): number {
  const omega = (2 * Math.PI * targetHz) / sampleRate
  const coeff = 2 * Math.cos(omega)
  let s0 = 0
  let s1 = 0
  let s2 = 0
  for (let i = 0; i < samples.length; i++) {
    s0 = samples[i] + coeff * s1 - s2
    s2 = s1
    s1 = s0
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2
}

function extractVoiceFeature(samples: Float32Array): number[] | null {
  if (samples.length < MIN_SAMPLES_FOR_ACOUSTIC) return null

  const frameStarts = buildFrameStarts(samples.length)
  if (frameStarts.length === 0) return null

  let sumAbs = 0
  let sumSq = 0
  let sumZcrRatio = 0
  const bandHz = [180, 320, 500, 800, 1200, 1700, 2400, 3200]
  const bandAcc = new Array<number>(bandHz.length).fill(0)

  for (const start of frameStarts) {
    const frame = samples.subarray(start, start + FRAME_SIZE)
    let frameAbs = 0
    let frameSq = 0
    let frameZcr = 0
    for (let i = 0; i < frame.length; i++) {
      const v = frame[i]
      frameAbs += Math.abs(v)
      frameSq += v * v
      if (i > 0) {
        const prev = frame[i - 1]
        if ((prev >= 0 && v < 0) || (prev < 0 && v >= 0)) frameZcr += 1
      }
    }

    const frameMeanAbs = frameAbs / frame.length
    const frameRms = Math.sqrt(frameSq / frame.length)
    const frameZcrRatio = frameZcr / Math.max(1, frame.length - 1)
    sumAbs += frameMeanAbs
    sumSq += frameRms
    sumZcrRatio += frameZcrRatio

    const powers = bandHz.map((hz) => goertzelPower(frame, hz, SIGNAL_SAMPLE_RATE))
    const powerSum = powers.reduce((s, v) => s + v, 0) || 1
    for (let i = 0; i < powers.length; i++) {
      bandAcc[i] += powers[i] / powerSum
    }
  }

  const frameCount = frameStarts.length
  const meanAbs = sumAbs / frameCount
  const rms = sumSq / frameCount
  const zcrRatio = sumZcrRatio / frameCount
  const normalizedBands = bandAcc.map((v) => v / frameCount)
  const feature = normalizeVector([meanAbs, rms, zcrRatio, ...normalizedBands])
  return feature
}

function blendCentroid(existing: number[], incoming: number[], samples: number): number[] {
  const weightOld = Math.max(1, samples)
  const weightNew = 1
  const blended = existing.map((v, idx) => (v * weightOld + incoming[idx] * weightNew) / (weightOld + weightNew))
  return normalizeVector(blended)
}

export class SpeakerDiarizationService {
  private profiles: SpeakerProfile[] = []
  private lastSpeakerLabel = 'Speaker A'
  private lastSegmentEndAt = 0
  private pendingSwitchCandidate: PendingSwitchCandidate | null = null
  private lastFeature: number[] | null = null

  reset(): void {
    this.profiles = []
    this.lastSpeakerLabel = 'Speaker A'
    this.lastSegmentEndAt = 0
    this.pendingSwitchCandidate = null
    this.lastFeature = null
  }

  assign(input: SpeakerAssignInput): SpeakerAssignResult {
    const feature = input.audioSamples ? extractVoiceFeature(input.audioSamples) : null
    if (feature) {
      const assigned = this.assignByAcousticFeature(feature, input.startedAt, input.endedAt)
      this.lastSegmentEndAt = input.endedAt
      this.lastSpeakerLabel = assigned.label
      this.lastFeature = feature
      return assigned
    }

    const fallback = this.assignBySilenceGap(input.startedAt, input.endedAt)
    this.lastSegmentEndAt = input.endedAt
    this.lastSpeakerLabel = fallback.label
    this.lastFeature = null
    return fallback
  }

  private assignByAcousticFeature(feature: number[], startedAt: number, endedAt: number): SpeakerAssignResult {
    if (this.profiles.length === 0) {
      const label = speakerLabelByIndex(0)
      this.profiles.push({ label, centroid: feature, samples: 1, lastSeenAt: endedAt })
      return { label, method: 'acoustic', similarity: 1 }
    }

    let bestIdx = 0
    let bestSim = -1
    for (let i = 0; i < this.profiles.length; i++) {
      const sim = cosineSimilarity(feature, this.profiles[i].centroid)
      if (sim > bestSim) {
        bestSim = sim
        bestIdx = i
      }
    }

    const lastIdx = this.profiles.findIndex((p) => p.label === this.lastSpeakerLabel)
    const lastSim = lastIdx >= 0 ? cosineSimilarity(feature, this.profiles[lastIdx].centroid) : -1
    const previousFeatureSim = this.lastFeature ? cosineSimilarity(feature, this.lastFeature) : 1
    const silenceGapMs = Math.max(0, startedAt - this.lastSegmentEndAt)

    if (lastIdx >= 0 && lastSim >= bestSim - LAST_SPEAKER_PREFERRED_MARGIN && lastSim >= STICKY_MATCH_THRESHOLD - 0.05) {
      const sticky = this.profiles[lastIdx]
      sticky.centroid = blendCentroid(sticky.centroid, feature, sticky.samples)
      sticky.samples += 1
      sticky.lastSeenAt = endedAt
      this.pendingSwitchCandidate = null
      return { label: sticky.label, method: 'acoustic', similarity: lastSim }
    }

    if (bestSim >= STICKY_MATCH_THRESHOLD) {
      const profile = this.profiles[bestIdx]
      profile.centroid = blendCentroid(profile.centroid, feature, profile.samples)
      profile.samples += 1
      profile.lastSeenAt = endedAt
      this.pendingSwitchCandidate = null
      return { label: profile.label, method: 'acoustic', similarity: bestSim }
    }

    const isPendingSameCandidate =
      this.pendingSwitchCandidate?.profileIndex === bestIdx && this.pendingSwitchCandidate.seenCount >= 1

    const canCreateNewSpeaker =
      this.profiles.length < MAX_SPEAKERS
      && (bestSim <= NEW_SPEAKER_MAX_SIMILARITY || previousFeatureSim <= NEW_SEGMENT_SIMILARITY_MAX)
      && (silenceGapMs >= MIN_ACOUSTIC_SEGMENT_MS || isPendingSameCandidate)

    if (canCreateNewSpeaker) {
      if (!this.pendingSwitchCandidate || this.pendingSwitchCandidate.profileIndex !== bestIdx) {
        this.pendingSwitchCandidate = { profileIndex: bestIdx, seenCount: 1 }
      } else {
        this.pendingSwitchCandidate.seenCount += 1
      }

      if (this.pendingSwitchCandidate.seenCount < 2) {
        const fallbackIdx = lastIdx >= 0 ? lastIdx : bestIdx
        const fallback = this.profiles[fallbackIdx]
        // 候選切換期不更新原講者聲紋，避免新講者片段汙染既有 centroid。
        fallback.lastSeenAt = endedAt
        return { label: fallback.label, method: 'acoustic', similarity: lastSim }
      }

      const label = speakerLabelByIndex(this.profiles.length)
      this.profiles.push({ label, centroid: feature, samples: 1, lastSeenAt: endedAt })
      this.pendingSwitchCandidate = null
      return { label, method: 'acoustic', similarity: bestSim }
    }

    const fallbackIdx = lastIdx >= 0 ? lastIdx : bestIdx
    const profile = this.profiles[fallbackIdx]
    profile.centroid = blendCentroid(profile.centroid, feature, profile.samples)
    profile.samples += 1
    profile.lastSeenAt = endedAt
    this.pendingSwitchCandidate = null
    return { label: profile.label, method: 'acoustic', similarity: lastSim }
  }

  private assignBySilenceGap(startedAt: number, endedAt: number): SpeakerAssignResult {
    if (this.profiles.length === 0) {
      const label = speakerLabelByIndex(0)
      this.profiles.push({ label, centroid: [], samples: 1, lastSeenAt: endedAt })
      return { label, method: 'silence_fallback', similarity: 0 }
    }

    const silenceGap = Math.max(0, startedAt - this.lastSegmentEndAt)
    if (silenceGap >= SWITCH_GAP_MS && this.profiles.length < MAX_SPEAKERS) {
      const label = speakerLabelByIndex(this.profiles.length)
      this.profiles.push({ label, centroid: [], samples: 1, lastSeenAt: endedAt })
      return { label, method: 'silence_fallback', similarity: 0 }
    }

    const current = this.profiles.find((p) => p.label === this.lastSpeakerLabel) ?? this.profiles[0]
    current.samples += 1
    current.lastSeenAt = endedAt
    return { label: current.label, method: 'silence_fallback', similarity: 0 }
  }
}
