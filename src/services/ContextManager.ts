import { Message, ChatMessage } from '../types'
import { ICT_SYSTEM_PROMPT } from '../utils/constants'

/**
 * ContextManager
 * 維護 Rolling Context 緩衝區，對外提供 buildMessages()
 */
export class ContextManager {
  private buffer: Message[] = []
  private readonly maxSize: number

  constructor(maxSize = 5) {
    this.maxSize = maxSize
  }

  add(message: Message): void {
    this.buffer.push(message)
    if (this.buffer.length > this.maxSize) {
      this.buffer = this.buffer.slice(this.buffer.length - this.maxSize)
    }
  }

  /**
   * 組裝符合 GROQ Chat Completions API 格式的 messages 陣列
   * 格式：system → [user/assistant 交替，最多 5 對] → user(current)
   */
  buildMessages(currentText: string, systemPrompt = ICT_SYSTEM_PROMPT): ChatMessage[] {
    const history: ChatMessage[] = this.buffer.flatMap((m) => [
      { role: 'user' as const, content: m.originalText },
      { role: 'assistant' as const, content: m.translatedText },
    ])

    return [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: `Translate: "${currentText}"` },
    ]
  }

  getLastN(n: number): Message[] {
    return this.buffer.slice(-n)
  }

  clear(): void {
    this.buffer = []
  }

  get size(): number {
    return this.buffer.length
  }
}
