// ─── API 端點 ─────────────────────────────────────────────────
export const GROQ_API_BASE = 'https://api.groq.com/openai/v1'
export const OPENAI_API_BASE = 'https://api.openai.com/v1'

// ─── 預設模型 ──────────────────────────────────────────────────
export const DEFAULT_STT_MODEL = 'whisper-large-v3-turbo'
export const DEFAULT_LLM_MODEL = 'llama-3.3-70b-versatile'

// ─── 模型清單 ──────────────────────────────────────────────────
export const GROQ_STT_MODELS = [
  { label: 'Whisper Large V3 Turbo（快速，推薦）', value: 'whisper-large-v3-turbo' },
  { label: 'Whisper Large V3（高精度）', value: 'whisper-large-v3' },
  { label: 'Distil Whisper（英文最快）', value: 'distil-whisper-large-v3-en' },
]
export const GROQ_LLM_MODELS = [
  { label: 'Llama 3.3 70B（預設，均衡）',    value: 'llama-3.3-70b-versatile' },
  { label: 'GPT-OSS 120B（高品質，500T/s）', value: 'openai/gpt-oss-120b' },
  { label: 'GPT-OSS 20B（極速，1000T/s）',   value: 'openai/gpt-oss-20b' },
  { label: 'Llama 3.1 8B（最快輕量）',        value: 'llama-3.1-8b-instant' },
  { label: 'Gemma 2 9B',                      value: 'gemma2-9b-it' },
]
export const OPENAI_STT_MODELS = [
  { label: 'Whisper-1', value: 'whisper-1' },
]
export const OPENAI_LLM_MODELS = [
  { label: 'GPT-4o Mini（快速）', value: 'gpt-4o-mini' },
  { label: 'GPT-4o（高品質）', value: 'gpt-4o' },
  { label: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
]

// ─── VAD 預設值 ────────────────────────────────────────────────
// redemptionMs: 500ms 靜音即切分（原 1500ms 太長，連續演講無法切段）
export const DEFAULT_VAD_SILENCE_MS = 500
export const DEFAULT_VAD_MAX_DURATION_MS = 20_000

// ─── Rolling Context ───────────────────────────────────────────
export const DEFAULT_ROLLING_CONTEXT_SIZE = 5

// ─── 功能開關預設值 ────────────────────────────────────────────
export const DEFAULT_ENABLE_TRANSLATION = true
export const DEFAULT_STT_PROMPT = ''
export const DEFAULT_STT_LANGUAGE_HINT = 'auto'
export const DEFAULT_MEETING_READABLE_MODE = false
export const DEFAULT_READABILITY_MERGE_GAP_MS = 1200
export const DEFAULT_READABILITY_MIN_CHARS = 1
export const DEFAULT_STT_MODE = 'standard' as const
export const DEFAULT_REALTIME_MODEL = 'gpt-realtime-whisper'
export const DEFAULT_SPEAKER_DIARIZATION_ENABLED = false
export const DEFAULT_ZH_PUNCTUATION_REPAIR_ENABLED = true
export const DEFAULT_ZH_PUNCTUATION_MIN_CHARS = 6
export const DEFAULT_INTERACTION_MODE = 'conversation' as const
export const DEFAULT_DISPLAY_MODE = 'bilingual' as const
export const DEFAULT_RECORD_TEMPLATE = 'standard' as const

// ─── OpenAI Realtime 模型清單 ──────────────────────────────────
export const OPENAI_REALTIME_MODELS = [
  { label: 'GPT-Realtime-Whisper（串流即時轉寫，推薦）', value: 'gpt-realtime-whisper' },
  { label: 'GPT-4o Transcribe（高精度）',               value: 'gpt-4o-transcribe' },
  { label: 'GPT-4o Mini Transcribe（較快）',            value: 'gpt-4o-mini-transcribe' },
]

// ─── OpenAI Realtime WebSocket 端點 ───────────────────────────
export const OPENAI_REALTIME_BASE = 'wss://api.openai.com/v1/realtime'

// ─── LocalStorage Key ──────────────────────────────────────────
export const STORAGE_KEY = 'omni-translate-config'

// ─── ICT 技術領域 System Prompt ────────────────────────────────
export const ICT_SYSTEM_PROMPT = `You are a professional ICT technical interpreter for high-stakes meetings between Taiwanese engineers and foreign vendors.

Rules:
1. Translate English to Traditional Chinese (Taiwan standard).
   - 記憶體 (not 內存), 快閃記憶體 (not 閃存), 處理器 (not 處理机)
   - 作業系統, 韌體, 驅動程式, 介面
2. Keep technical terms in English unless a widely-accepted Traditional Chinese term exists:
   - Keep: NVMe, PCIe, NAND, SSD, HDD, CPU, GPU, DRAM, BIOS, UEFI, DDR
3. If uncertain about a proper noun, preserve the original English term in parentheses.
   Example: 介面控制器（Interface Controller）
4. Output ONLY the translated sentence. No explanation, no prefix, no quotes.`

export const ICT_USER_PROMPT = `Terminology preference:
- Keep product names and standards in original form when uncertain.
- Prefer concise meeting-style sentences.`

// ─── Prompt 模板選項 ───────────────────────────────────────────
export const PROMPT_TEMPLATES = [
  { label: 'ICT 技術會議（預設）', value: ICT_SYSTEM_PROMPT },
  {
    label: '半導體製程',
    value: `You are a professional semiconductor process engineer interpreter. Translate English to Traditional Chinese (Taiwan standard). Keep all fab terms, tool names, and chemical formulas in English. Output ONLY the translation.`,
  },
  {
    label: '通用商務',
    value: `You are a professional business interpreter. Translate English to Traditional Chinese (Taiwan standard). Output ONLY the translation.`,
  },
]

export const INTERACTION_MODE_OPTIONS = [
  { value: 'conversation', label: '會議 / 對談記錄' },
  { value: 'lecture', label: '單向內容記錄（課堂/演講）' },
] as const

export const DISPLAY_MODE_OPTIONS = [
  { value: 'original', label: '原文' },
  { value: 'translated', label: '翻譯' },
  { value: 'bilingual', label: '雙語' },
] as const

export const RECORD_TEMPLATE_OPTIONS = [
  { value: 'standard', label: '標準紀錄' },
  { value: 'action_items', label: '決策 / 待辦版' },
  { value: 'client', label: '客戶溝通版' },
  { value: 'learning', label: '學習摘要版' },
] as const
