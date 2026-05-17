import { describe, it, expect } from 'vitest'
import { ExportService } from '../../src/services/ExportService'
import { ExportSession } from '../../src/types'

function makeSession(overrides?: Partial<ExportSession>): ExportSession {
  return {
    sessionId: 'test-session',
    startTime: 0,
    endTime: 60_000,
    messages: [
      { timestamp: 1000, originalText: 'Hello world', translatedText: '你好世界', speakerLabel: undefined },
      { timestamp: 3000, originalText: 'NVMe speed', translatedText: 'NVMe 速度', speakerLabel: undefined },
    ],
    ...overrides,
  }
}

describe('ExportService', () => {
  // UT-EX-001：Markdown 表格標頭格式
  it('無 speaker 標記時，exportAsMarkdown 使用原本四欄表格', () => {
    let downloaded = ''
    // 攔截 _download
    const original = ExportService._download.bind(ExportService)
    ExportService._download = (content: string) => { downloaded = content }

    ExportService.exportAsMarkdown(makeSession())

    expect(downloaded).toContain('| # | 時間 | 原文 | 翻譯 |')
    expect(downloaded).toContain('|---|------|---------|------|')
    expect(downloaded).not.toContain('| # | 時間 | 講者 | 原文 | 翻譯 |')
    expect(downloaded).toContain('# 逐字稿')

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
    const original = ExportService._download.bind(ExportService)
    ExportService._download = (content: string) => { downloaded = content }

    ExportService.exportAsMarkdown(makeSession({ messages: [] }))

    expect(downloaded).toContain('| # | 時間 | 原文 | 翻譯 |')
    // 不應包含任何資料列
    const lines = downloaded.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| #') && !l.startsWith('|---'))
    expect(lines).toHaveLength(0)
    ExportService._download = original
  })

  // UT-EX-004：Record Package 會輸出兩個檔案（紀錄稿 + 逐字稿）
  it('exportRecordPackage 會下載兩個 markdown 檔案', () => {
    const downloads: Array<{ content: string; filename: string }> = []
    const original = ExportService._download.bind(ExportService)
    ExportService._download = (content: string, filename: string) => { downloads.push({ content, filename }) }

    ExportService.exportRecordPackage(makeSession(), '## 紀錄內容\n- 測試', '標準紀錄')

    expect(downloads).toHaveLength(2)
    expect(downloads[0].filename.startsWith('transcript-')).toBe(true)
    expect(downloads[1].filename.startsWith('record-')).toBe(true)
    expect(downloads[1].content).toContain('## 紀錄內容')

    ExportService._download = original
  })

  it('有 speaker 標記時，exportAsMarkdown 使用五欄表格', () => {
    let downloaded = ''
    const original = ExportService._download.bind(ExportService)
    ExportService._download = (content: string) => { downloaded = content }

    ExportService.exportAsMarkdown(
      makeSession({
        messages: [{ timestamp: 1000, originalText: 'A', translatedText: '甲', speakerLabel: 'Speaker A' }],
      }),
    )

    expect(downloaded).toContain('| # | 時間 | 講者 | 原文 | 翻譯 |')
    expect(downloaded).toContain('Speaker A')

    ExportService._download = original
  })
})
