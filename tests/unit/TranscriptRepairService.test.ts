import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TranscriptRepairService } from '../../src/services/TranscriptRepairService'
import { GroqService } from '../../src/services/GroqService'
import { ExportSession } from '../../src/types'

const session: ExportSession = {
  sessionId: 's1',
  startTime: 0,
  endTime: 5000,
  messages: [
    { timestamp: 1000, originalText: 'Hello', translatedText: '你好', speakerLabel: undefined },
    { timestamp: 2000, originalText: 'Thank you', translatedText: '謝謝', speakerLabel: undefined },
  ],
}

describe('TranscriptRepairService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('會呼叫 LLM 並輸出修復後逐字稿字串', async () => {
    const spy = vi.spyOn(GroqService, 'translate').mockResolvedValue('[00:00:01] 原文：哈囉 ｜ 翻譯：你好')

    const repaired = await TranscriptRepairService.repair({
      session,
      apiKey: 'gsk_test',
      apiBase: 'https://api.groq.com/openai/v1',
      llmModel: 'llama-3.3-70b-versatile',
    })

    expect(repaired).toContain('[00:00:01]')
    expect(spy).toHaveBeenCalledTimes(1)
    const payload = spy.mock.calls[0][0]
    expect(payload[1].content).toContain('[00:00:01] 原文：Hello')
  })
})
