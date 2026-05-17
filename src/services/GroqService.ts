import { ChatMessage } from '../types'
import { GROQ_API_BASE } from '../utils/constants'

/** 標記 429 Rate Limit 錯誤，供上層判斷重試 */
export class RateLimitError extends Error {
  constructor() {
    super('Rate Limit')
    this.name = 'RateLimitError'
  }
}

export class InvalidKeyError extends Error {
  constructor() {
    super('Invalid API Key')
    this.name = 'InvalidKeyError'
  }
}

export class GroqServerError extends Error {
  constructor(status: number) {
    super(`Server Error: ${status}`)
    this.name = 'GroqServerError'
  }
}

// ─── Exponential Backoff 重試（RateLimit + 暫態網路/Server Error）
// InvalidKeyError 不重試（永久性錯誤）
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      // InvalidKeyError 永久性失敗，不重試
      if (err instanceof InvalidKeyError) throw err
      // 最後一次嘗試後不再等待，直接丟出
      if (attempt >= maxRetries - 1) break
      // RateLimitError / GroqServerError / 網路 TypeError 均屬暫態，指數退避重試
      const isTransient =
        err instanceof RateLimitError ||
        err instanceof GroqServerError ||
        (err instanceof TypeError && String(err.message).includes('fetch'))
      if (!isTransient) throw err
      const delay = baseDelayMs * 2 ** attempt
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastError
}

// ─── ApiService（同時支援 GROQ 和 OpenAI OpenAI-compatible 端點）─
export const GroqService = {
  /**
   * STT：音訊 Blob → 文字
   * @param apiBase 預設 GROQ，傳入 OpenAI base 即可切換
   */
  async transcribe(
    blob: Blob,
    apiKey: string,
    sttModel: string,
    apiBase = GROQ_API_BASE,
    sttPrompt = '',
    language = '',
  ): Promise<string> {
    return withRetry(async () => {
      const formData = new FormData()
      formData.append('file', blob, 'audio.wav')
      formData.append('model', sttModel)
      if (sttPrompt.trim()) {
        formData.append('prompt', sttPrompt.trim())
      }
      if (language.trim() && language !== 'auto') {
        formData.append('language', language.trim())
      }
      formData.append('response_format', 'json')

      const res = await fetch(`${apiBase}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      })

      if (res.status === 429) throw new RateLimitError()
      if (res.status === 401) throw new InvalidKeyError()
      if (res.status >= 500) throw new GroqServerError(res.status)
      if (!res.ok) throw new Error(`STT HTTP ${res.status}`)

      const data = await res.json() as { text: string }
      return data.text.trim()
    })
  },

  /**
   * 翻譯：Chat messages → 譯文
   * @param apiBase 預設 GROQ，傳入 OpenAI base 即可切換
   */
  async translate(
    messages: ChatMessage[],
    apiKey: string,
    llmModel: string,
    apiBase = GROQ_API_BASE,
    signal?: AbortSignal,
  ): Promise<string> {
    return withRetry(async () => {
      const res = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal,
        body: JSON.stringify({
          model: llmModel,
          messages,
          temperature: 0.1,
          max_tokens: 512,
        }),
      })

      if (res.status === 429) throw new RateLimitError()
      if (res.status === 401) throw new InvalidKeyError()
      if (res.status >= 500) throw new GroqServerError(res.status)
      if (!res.ok) throw new Error(`LLM HTTP ${res.status}`)

      const data = await res.json() as {
        choices: { message: { content: string } }[]
      }
      return data.choices[0].message.content.trim()
    })
  },

  /**
   * 連線測試：呼叫 /models 端點驗證 API Key 與網路連通性
   */
  async testConnection(
    apiKey: string,
    apiBase = GROQ_API_BASE,
  ): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch(`${apiBase}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (res.status === 200) return { ok: true, message: '✅ 連線成功，API Key 有效' }
      if (res.status === 401) return { ok: false, message: '❌ API Key 無效，請確認後重新輸入' }
      if (res.status === 429) return { ok: false, message: '⚠️ 請求頻率過高，請稍後再試' }
      return { ok: false, message: `❌ 伺服器回應 ${res.status}` }
    } catch {
      return { ok: false, message: '❌ 網路連線失敗，請確認網路或防火牆設定' }
    }
  },
}
