import { ExportSession } from '../types'
import { GroqService } from './GroqService'

interface GenerateRecordInput {
  session: ExportSession
  templateName: string
  templateInstruction: string
  apiKey: string
  apiBase: string
  llmModel: string
  repairedTranscript?: string
}

function buildTranscriptForPrompt(session: ExportSession): string {
  const includeSpeaker = session.messages.some((m) => (m.speakerLabel ?? '').trim().length > 0)
  return session.messages
    .map((m, idx) => {
      const secs = Math.max(0, Math.round((m.timestamp - session.startTime) / 1000))
      if (includeSpeaker) {
        const speaker = m.speakerLabel ?? 'Speaker ?'
        return `${idx + 1}. [${secs}s] ${speaker}\n原文：${m.originalText}\n翻譯：${m.translatedText || '(無)'}`
      }
      return `${idx + 1}. [${secs}s]\n原文：${m.originalText}\n翻譯：${m.translatedText || '(無)'}`
    })
    .join('\n\n')
}

export const RecordGenerationService = {
  async generate(input: GenerateRecordInput): Promise<string> {
    const transcript = input.repairedTranscript?.trim() || buildTranscriptForPrompt(input.session)
    const content = await GroqService.translate(
      [
        {
          role: 'system',
          content: 'You are a professional meeting recorder. Output in Traditional Chinese only.',
        },
        {
          role: 'user',
          content: `模板名稱：${input.templateName}\n\n模板指令：\n${input.templateInstruction}`,
        },
        {
          role: 'user',
          content: `請依模板整理以下逐字稿內容，不要輸出逐字稿附錄：\n\n${transcript}`,
        },
      ],
      input.apiKey,
      input.llmModel,
      input.apiBase,
    )
    return content.trim()
  },
}
