// ─── API 提供商 ────────────────────────────────────────────────
export type ApiProvider = 'groq' | 'openai'

// ─── STT 模式 ─────────────────────────────────────────────────
export type SttMode = 'standard' | 'openai-realtime'
export type InteractionMode = 'conversation' | 'lecture'
export type DisplayMode = 'original' | 'translated' | 'bilingual'
export type RecordTemplate = string

// ─── 翻譯訊息實體 ─────────────────────────────────────────────
export interface Message {
  id: string
  /** VAD 捕捉到語音開始的時間（段落開始） */
  timestamp: number
  /** VAD 捕捉到語音結束的時間（段落結束），用於計算鈕默間隔 */
  capturedEndAt: number
  /** 輕量說話者標記（Speaker A/B/C） */
  speakerLabel?: string
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
  /** Prompt 模組（user 層） */
  userPrompt: string
  rollingContextSize: number // N=5
  modelSettings: {
    sttModel: string
    llmModel: string
  }  /** 是否啟用 LLM 翻譯步驟；關閉時僅執行 STT 轉文字 */
  enableTranslation: boolean
  /** STT 專有名詞/提示詞（可輸入產品名、人名、縮寫） */
  sttPrompt: string
  /** STT 語言提示：auto/en/zh 等 */
  sttLanguageHint: string
  /** 啟用中文標點修復策略 */
  zhPunctuationRepairEnabled: boolean
  /** 觸發中文標點修復的最小中文字數 */
  zhPunctuationMinChars: number
  /** 會議可讀模式：對輸出做合併與過濾（不影響原始辨識） */
  meetingReadableMode: boolean
  /** 會議可讀模式：短句合併間隔（ms） */
  readabilityMergeGapMs: number
  /** 會議可讀模式：最小顯示字數（過短片段可過濾） */
  readabilityMinChars: number
  /** STT 模式：standard = Whisper REST，openai-realtime = WS 串流即時辨識 */
  sttMode: SttMode
  /** Realtime 模式使用的辨識模型 */
  realtimeModel: string
  /** 啟用輕量講者辨識（Speaker A/B/C） */
  speakerDiarizationEnabled: boolean
  /** 使用情境：會議/對談 或 單向內容（課堂/演講） */
  interactionMode: InteractionMode
  /** 顯示模式：原文 / 翻譯 / 雙語 */
  displayMode: DisplayMode
  /** 完整紀錄包預設模板 */
  defaultRecordTemplate: RecordTemplate
  /** 目前套用的 profile id（builtin/imported） */
  activeProfileId?: string
}

// ─── 導出用的會議 Session ──────────────────────────────────────
export interface ExportSession {
  sessionId: string
  startTime: number
  endTime: number
  messages: Pick<Message, 'timestamp' | 'originalText' | 'translatedText' | 'speakerLabel'>[]
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
  | 'groq_server_error'  | 'realtime_error'  | null
