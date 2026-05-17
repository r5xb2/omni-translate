import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RecordGenerationService } from '../../src/services/RecordGenerationService'
import { GroqService } from '../../src/services/GroqService'
import { ExportSession } from '../../src/types'

function makeSession(): ExportSession {
  return {
    sessionId: 's1',
    startTime: 0,
    endTime: 10_000,
    messages: [
      { timestamp: 1000, originalText: '第一句', translatedText: 'first line' },
      { timestamp: 3000, originalText: '第二句', translatedText: 'second line' },
    ],
  }
}

describe('RecordGenerationService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('有提供修復後逐字稿時，模板生成會使用修復內容', async () => {
    const spy = vi.spyOn(GroqService, 'translate').mockResolvedValue('ok')

    await RecordGenerationService.generate({
      session: makeSession(),
      templateName: '標準紀錄',
      templateInstruction: '整理為會議紀錄',
      repairedTranscript: '[00:00:01] 原文：修復句',
      apiKey: 'gsk_test',
      apiBase: 'https://api.groq.com/openai/v1',
      llmModel: 'llama-3.3-70b-versatile',
    })

    const messages = spy.mock.calls[0][0]
    expect(messages[2].content).toContain('[00:00:01] 原文：修復句')
    expect(messages[2].content).not.toContain('1. [1s]')
  })

  it('未提供修復逐字稿時，使用 session 建立逐字稿內容', async () => {
    const spy = vi.spyOn(GroqService, 'translate').mockResolvedValue('ok')

    await RecordGenerationService.generate({
      session: makeSession(),
      templateName: '標準紀錄',
      templateInstruction: '整理為會議紀錄',
      apiKey: 'gsk_test',
      apiBase: 'https://api.groq.com/openai/v1',
      llmModel: 'llama-3.3-70b-versatile',
    })

    const messages = spy.mock.calls[0][0]
    expect(messages[2].content).toContain('1. [1s]')
    expect(messages[2].content).toContain('原文：第一句')
  })
})

