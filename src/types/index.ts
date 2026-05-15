// ─── API 提供商 ────────────────────────────────────────────────
export type ApiProvider = 'groq' | 'openai'

// ─── 翻譯訊息實體 ─────────────────────────────────────────────
export interface Message {
  id: string
  /** VAD 捕捉到語音開始的時間（段落開始） */
  timestamp: number
  /** VAD 捕捉到語音結束的時間（段落結束），用於計算鈕默間隔 */
  capturedEndAt: number
  originalText: string
  translatedText: string
  status: 'transcribing' | 'translating' | 'completed' | 'error'
}

// ─── 系統配置（LocalStorage 持久化） ──────────────────────────
export interface AppConfig {
  /** API 提供商：groq 或 openai */
  provider: ApiProvider
  /** Base64 編碼的 GROQ API Key（MVP 無 PIN 加密）*/
  apiKeyEncoded: string
  /** Base64 編碼的 OpenAI API Key */
  openaiKeyEncoded: string
  vadSilenceMs: number       // 靜音觸發毫秒（預設 500）
  vadMaxDurationMs: number   // 強制切分毫秒（預設 20000）
  systemPrompt: string
  rollingContextSize: number // N=5
  modelSettings: {
    sttModel: string
    llmModel: string
  }  /** 是否啟用 LLM 翻譯步驟；關閉時僅執行 STT 轉文字 */
  enableTranslation: boolean}

// ─── 導出用的會議 Session ──────────────────────────────────────
export interface ExportSession {
  sessionId: string
  startTime: number
  endTime: number
  messages: Pick<Message, 'timestamp' | 'originalText' | 'translatedText'>[]
}

// ─── 錄音狀態機 ───────────────────────────────────────────────
export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopping'

// ─── GROQ Chat Message ─────────────────────────────────────────
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// ─── 錯誤類型 ─────────────────────────────────────────────────
export type AppErrorType =
  | 'rate_limit'
  | 'invalid_key'
  | 'network_offline'
  | 'mic_denied'
  | 'groq_server_error'
  | null
