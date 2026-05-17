export interface RuntimeMetricsSnapshot {
  transcriptCount: number
  translationCount: number
  translationErrorCount: number
  stopStateMessageCount: number
  pendingMaxDepth: number
  transcriptLatencyMsAvg: number
  transcriptLatencyMsP95: number
}

const state = {
  transcriptCount: 0,
  translationCount: 0,
  translationErrorCount: 0,
  stopStateMessageCount: 0,
  pendingDepth: 0,
  pendingMaxDepth: 0,
  transcriptLatencies: [] as number[],
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

export const RuntimeMetricsService = {
  recordTranscriptLatency(ms: number): void {
    state.transcriptCount += 1
    state.transcriptLatencies.push(Math.max(0, Math.round(ms)))
  },

  recordTranslationSuccess(): void {
    state.translationCount += 1
  },

  recordTranslationError(): void {
    state.translationErrorCount += 1
  },

  recordMessageWhileStopping(): void {
    state.stopStateMessageCount += 1
  },

  setPendingDepth(depth: number): void {
    state.pendingDepth = Math.max(0, depth)
    if (state.pendingDepth > state.pendingMaxDepth) {
      state.pendingMaxDepth = state.pendingDepth
    }
  },

  getSnapshot(): RuntimeMetricsSnapshot {
    const avg = state.transcriptLatencies.length
      ? Math.round(state.transcriptLatencies.reduce((sum, v) => sum + v, 0) / state.transcriptLatencies.length)
      : 0

    return {
      transcriptCount: state.transcriptCount,
      translationCount: state.translationCount,
      translationErrorCount: state.translationErrorCount,
      stopStateMessageCount: state.stopStateMessageCount,
      pendingMaxDepth: state.pendingMaxDepth,
      transcriptLatencyMsAvg: avg,
      transcriptLatencyMsP95: percentile(state.transcriptLatencies, 95),
    }
  },

  reset(): void {
    state.transcriptCount = 0
    state.translationCount = 0
    state.translationErrorCount = 0
    state.stopStateMessageCount = 0
    state.pendingDepth = 0
    state.pendingMaxDepth = 0
    state.transcriptLatencies = []
  },
}
