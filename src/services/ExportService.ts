import { ExportSession } from '../types'
import { escapeMarkdownCell, formatRelativeTime, formatFilename } from '../utils/formatters'

export const ExportService = {
  exportAsMarkdown(session: ExportSession): void {
    const startDate = new Date(session.startTime).toLocaleString('zh-TW')
    const durationMs = session.endTime - session.startTime
    const durationMin = Math.ceil(durationMs / 60_000)

    const rows = session.messages
      .map((m, i) => {
        const time = formatRelativeTime(m.timestamp, session.startTime)
        const orig = escapeMarkdownCell(m.originalText)
        const trans = escapeMarkdownCell(m.translatedText)
        return `| ${i + 1} | ${time} | ${orig} | ${trans} |`
      })
      .join('\n')

    const content = [
      `# 技術會議記錄`,
      ``,
      `- **日期**：${startDate}`,
      `- **會議時長**：約 ${durationMin} 分鐘`,
      `- **翻譯筆數**：${session.messages.length}`,
      ``,
      `| # | 時間 | English | 中文 |`,
      `|---|------|---------|------|`,
      rows,
    ].join('\n')

    this._download(content, `meeting-${formatFilename()}.md`, 'text/markdown')
  },

  exportAsTxt(session: ExportSession): void {
    const startDate = new Date(session.startTime).toLocaleString('zh-TW')
    const lines = [
      `技術會議記錄`,
      `日期：${startDate}`,
      `─`.repeat(60),
      '',
      ...session.messages.map((m) => {
        const time = formatRelativeTime(m.timestamp, session.startTime)
        return `[${time}] ${m.originalText}\n        → ${m.translatedText}`
      }),
    ]
    this._download(lines.join('\n'), `meeting-${formatFilename()}.txt`, 'text/plain')
  },

  _download(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },
}
