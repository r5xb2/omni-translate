import { describe, it, expect } from 'vitest'
import { ExportService } from '../../src/services/ExportService'
import { ExportSession } from '../../src/types'

function makeSession(overrides?: Partial<ExportSession>): ExportSession {
  return {
    sessionId: 'test-session',
    startTime: 0,
    endTime: 60_000,
    messages: [
      { timestamp: 1000, originalText: 'Hello world', translatedText: '你好世界' },
      { timestamp: 3000, originalText: 'NVMe speed', translatedText: 'NVMe 速度' },
    ],
    ...overrides,
  }
}

describe('ExportService', () => {
  // UT-EX-001：Markdown 表格標頭格式
  it('exportAsMarkdown 包含正確的 Markdown 表格標頭', () => {
    let downloaded = ''
    // 攔截 _download
    const original = ExportService._download.bind(ExportService)
    ExportService._download = (content: string) => { downloaded = content }

    ExportService.exportAsMarkdown(makeSession())

    expect(downloaded).toContain('| # | 時間 | English | 中文 |')
    expect(downloaded).toContain('|---|------|---------|------|')

    ExportService._download = original
  })

  // UT-EX-002：pipe 字元 escape
  it('originalText 含 | 時正確 escape', () => {
    let downloaded = ''
    ExportService._download = (content: string) => { downloaded = content }

    ExportService.exportAsMarkdown(
      makeSession({ messages: [{ timestamp: 500, originalText: 'A | B', translatedText: 'A | B 中文' }] })
    )

    expect(downloaded).toContain('A \\| B')
    ExportService._download = () => {}
  })

  // UT-EX-003：空 Session 導出合法
  it('空 messages 時輸出只有標頭', () => {
    let downloaded = ''
    ExportService._download = (content: string) => { downloaded = content }

    ExportService.exportAsMarkdown(makeSession({ messages: [] }))

    expect(downloaded).toContain('| # | 時間 | English | 中文 |')
    // 不應包含任何資料列
    const lines = downloaded.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| #') && !l.startsWith('|---'))
    expect(lines).toHaveLength(0)
  })
})
