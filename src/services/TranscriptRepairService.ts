import { ExportSession } from '../types'
import { GroqService } from './GroqService'
import transcriptRepairPromptRaw from '../../prompts/system/transcript-repair.md?raw'

interface RepairTranscriptInput {
  session: ExportSession
  apiKey: string
  apiBase: string
  llmModel: string
}

const TRANSCRIPT_REPAIR_SYSTEM_PROMPT = transcriptRepairPromptRaw.trim()

function formatTimestamp(ms: number, sessionStart: number): string {
  const totalSec = Math.max(0, Math.floor((ms - sessionStart) / 1000))
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0')
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0')
  const ss = String(totalSec % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function buildRawTranscript(session: ExportSession): string {
  const includeSpeaker = session.messages.some((m) => (m.speakerLabel ?? '').trim().length > 0)
  return session.messages
    .map((m) => {
      const time = formatTimestamp(m.timestamp, session.startTime)
      const translated = (m.translatedText || '').trim() || '(無)'
      if (includeSpeaker) {
        const speaker = m.speakerLabel ?? 'Speaker ?'
        return `[${time}] ${speaker} ｜ 原文：${m.originalText} ｜ 翻譯：${translated}`
      }
      return `[${time}] 原文：${m.originalText} ｜ 翻譯：${translated}`
    })
    .join('\n')
}

export const TranscriptRepairService = {
  async repair(input: RepairTranscriptInput): Promise<string> {
    const rawTranscript = buildRawTranscript(input.session)
    const repaired = await GroqService.translate(
      [
        {
          role: 'system',
          content: TRANSCRIPT_REPAIR_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: `請修復以下逐字稿：\n\n${rawTranscript}`,
        },
      ],
      input.apiKey,
      input.llmModel,
      input.apiBase,
    )

    return repaired.trim()
  },
}
