import { describe, it, expect, beforeEach } from 'vitest'
import { SpeakerDiarizationService } from '../../src/services/SpeakerDiarizationService'

function makeSine(freqHz: number, ms: number, sampleRate = 16_000): Float32Array {
  const length = Math.max(1, Math.floor((sampleRate * ms) / 1000))
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    out[i] = Math.sin((2 * Math.PI * freqHz * i) / sampleRate) * 0.35
  }
  return out
}

describe('SpeakerDiarizationService', () => {
  let svc: SpeakerDiarizationService

  beforeEach(() => {
    svc = new SpeakerDiarizationService()
  })

  it('第一段語音會建立 Speaker A', () => {
    const res = svc.assign({
      startedAt: 0,
      endedAt: 1500,
      audioSamples: makeSine(220, 1200),
    })
    expect(res.label).toBe('Speaker A')
    expect(res.method).toBe('acoustic')
  })

  it('相近音色片段會維持同一位講者', () => {
    svc.assign({
      startedAt: 0,
      endedAt: 1200,
      audioSamples: makeSine(220, 1100),
    })
    const res = svc.assign({
      startedAt: 1300,
      endedAt: 2500,
      audioSamples: makeSine(240, 1100),
    })
    expect(res.label).toBe('Speaker A')
  })

  it('差異較大音色需連續觀測後才建立新講者標籤', () => {
    svc.assign({
      startedAt: 0,
      endedAt: 1200,
      audioSamples: makeSine(180, 1100),
    })
    const first = svc.assign({
      startedAt: 2800,
      endedAt: 3900,
      audioSamples: makeSine(1900, 1100),
    })
    const second = svc.assign({
      startedAt: 4200,
      endedAt: 5300,
      audioSamples: makeSine(2100, 1100),
    })
    expect(first.label).toBe('Speaker A')
    expect(second.label).toBe('Speaker B')
  })

  it('無音訊特徵時採停頓推斷，長停頓可切換下一位講者', () => {
    const first = svc.assign({ startedAt: 0, endedAt: 1000 })
    const second = svc.assign({ startedAt: 5000, endedAt: 5800 })
    expect(first.label).toBe('Speaker A')
    expect(second.label).toBe('Speaker B')
    expect(second.method).toBe('silence_fallback')
  })
})
