import { beforeEach, describe, expect, it } from 'vitest'
import { RuntimeMetricsService } from '../../src/services/RuntimeMetricsService'

describe('RuntimeMetricsService', () => {
  beforeEach(() => {
    RuntimeMetricsService.reset()
  })

  it('可累計 transcript/translation 與 pending 峰值', () => {
    RuntimeMetricsService.recordTranscriptLatency(100)
    RuntimeMetricsService.recordTranscriptLatency(300)
    RuntimeMetricsService.recordTranslationSuccess()
    RuntimeMetricsService.recordTranslationError()
    RuntimeMetricsService.setPendingDepth(2)
    RuntimeMetricsService.setPendingDepth(5)
    RuntimeMetricsService.setPendingDepth(1)

    const snapshot = RuntimeMetricsService.getSnapshot()
    expect(snapshot.transcriptCount).toBe(2)
    expect(snapshot.translationCount).toBe(1)
    expect(snapshot.translationErrorCount).toBe(1)
    expect(snapshot.pendingMaxDepth).toBe(5)
    expect(snapshot.transcriptLatencyMsAvg).toBe(200)
    expect(snapshot.transcriptLatencyMsP95).toBe(300)
  })
})
