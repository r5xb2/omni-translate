import { ExportSession } from '../types'
import { escapeMarkdownCell, formatRelativeTime, formatFilename } from '../utils/formatters'

function buildTranscriptRows(session: ExportSession): string {
  const includeSpeaker = session.messages.some((m) => (m.speakerLabel ?? '').trim().length > 0)
  return session.messages
    .map((m, i) => {
      const time = formatRelativeTime(m.timestamp, session.startTime)
      const orig = escapeMarkdownCell(m.originalText)
      const trans = escapeMarkdownCell(m.translatedText)
      if (includeSpeaker) {
        const speaker = escapeMarkdownCell(m.speakerLabel ?? 'Speaker ?')
        return `| ${i + 1} | ${time} | ${speaker} | ${orig} | ${trans} |`
      }
      return `| ${i + 1} | ${time} | ${orig} | ${trans} |`
    })
    .join('\n')
}

function buildTranscriptMarkdown(session: ExportSession): string {
  const startDate = new Date(session.startTime).toLocaleString('zh-TW')
  const durationMs = session.endTime - session.startTime
  const durationMin = Math.ceil(durationMs / 60_000)
  const rows = buildTranscriptRows(session)
  const includeSpeaker = session.messages.some((m) => (m.speakerLabel ?? '').trim().length > 0)
  const tableHeader = includeSpeaker
    ? `| # | 時間 | 講者 | 原文 | 翻譯 |`
    : `| # | 時間 | 原文 | 翻譯 |`
  const tableDivider = includeSpeaker
    ? `|---|------|------|---------|------|`
    : `|---|------|---------|------|`

  return [
    `# 逐字稿`,
    ``,
    `- **日期**：${startDate}`,
    `- **時長**：約 ${durationMin} 分鐘`,
    `- **段落數**：${session.messages.length}`,
    ``,
    tableHeader,
    tableDivider,
    rows,
  ].join('\n')
}

function buildTranscriptMarkdownFromRepairedText(session: ExportSession, repairedTranscript: string): string {
  const startDate = new Date(session.startTime).toLocaleString('zh-TW')
  const durationMs = session.endTime - session.startTime
  const durationMin = Math.ceil(durationMs / 60_000)

  return [
    `# 逐字稿`,
    ``,
    `- **日期**：${startDate}`,
    `- **時長**：約 ${durationMin} 分鐘`,
    `- **段落數**：${session.messages.length}`,
    `- **版本**：修復後`,
    ``,
    repairedTranscript.trim(),
  ].join('\n')
}

export const ExportService = {
  exportAsMarkdown(session: ExportSession, repairedTranscript?: string): void {
    const content = repairedTranscript?.trim()
      ? buildTranscriptMarkdownFromRepairedText(session, repairedTranscript)
      : buildTranscriptMarkdown(session)
    this._download(content, `transcript-${formatFilename()}.md`, 'text/markdown')
  },

  exportAsTxt(session: ExportSession, repairedTranscript?: string): void {
    const includeSpeaker = session.messages.some((m) => (m.speakerLabel ?? '').trim().length > 0)
    if (repairedTranscript?.trim()) {
      this._download(repairedTranscript.trim(), `transcript-${formatFilename()}.txt`, 'text/plain')
      return
    }
    const startDate = new Date(session.startTime).toLocaleString('zh-TW')
    const lines = [
      `逐字稿`,
      `日期：${startDate}`,
      `─`.repeat(60),
      '',
      ...session.messages.map((m) => {
        const time = formatRelativeTime(m.timestamp, session.startTime)
        if (includeSpeaker) {
          const speaker = m.speakerLabel ?? 'Speaker ?'
          return `[${time}] ${speaker} ${m.originalText}\n        → ${m.translatedText}`
        }
        return `[${time}] ${m.originalText}\n        → ${m.translatedText}`
      }),
    ]
    this._download(lines.join('\n'), `transcript-${formatFilename()}.txt`, 'text/plain')
  },

  exportRecordPackage(
    session: ExportSession,
    templatedRecordContent: string,
    templateName: string,
    repairedTranscript?: string,
  ): void {
    const stamp = formatFilename()
    const transcriptContent = repairedTranscript?.trim()
      ? buildTranscriptMarkdownFromRepairedText(session, repairedTranscript)
      : buildTranscriptMarkdown(session)
    const recordContent = [
      `# 模板化紀錄稿`,
      '',
      `- **模板**：${templateName}`,
      '',
      templatedRecordContent.trim(),
    ].join('\n')

    this._download(transcriptContent, `transcript-${stamp}.md`, 'text/markdown')
    this._download(recordContent, `record-${stamp}.md`, 'text/markdown')
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
