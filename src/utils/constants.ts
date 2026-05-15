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
  { label: 'Llama 3.3 70B（預設，均衡）', value: 'llama-3.3-70b-versatile' },
  { label: 'Llama 3.1 8B（最快）', value: 'llama-3.1-8b-instant' },
  { label: 'Gemma 2 9B', value: 'gemma2-9b-it' },
  { label: 'Mixtral 8x7B', value: 'mixtral-8x7b-32768' },
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
