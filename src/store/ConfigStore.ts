import { create } from 'zustand'
import { AppConfig } from '../types'
import { CryptoService } from '../services/CryptoService'
import {
  STORAGE_KEY,
  DEFAULT_STT_MODEL,
  DEFAULT_LLM_MODEL,
  DEFAULT_VAD_SILENCE_MS,
  DEFAULT_VAD_MAX_DURATION_MS,
  DEFAULT_ROLLING_CONTEXT_SIZE,
  DEFAULT_ENABLE_TRANSLATION,
  ICT_SYSTEM_PROMPT,
} from '../utils/constants'

const DEFAULT_CONFIG: AppConfig = {
  provider: 'groq',
  apiKeyEncoded: '',
  openaiKeyEncoded: '',
  vadSilenceMs: DEFAULT_VAD_SILENCE_MS,
  vadMaxDurationMs: DEFAULT_VAD_MAX_DURATION_MS,
  systemPrompt: ICT_SYSTEM_PROMPT,
  rollingContextSize: DEFAULT_ROLLING_CONTEXT_SIZE,
  modelSettings: {
    sttModel: DEFAULT_STT_MODEL,
    llmModel: DEFAULT_LLM_MODEL,
  },
  enableTranslation: DEFAULT_ENABLE_TRANSLATION,
}

function loadFromStorage(): AppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CONFIG
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_CONFIG
  }
}

function saveToStorage(config: AppConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

// ─── Store 介面 ────────────────────────────────────────────────
interface ConfigStoreState {
  config: AppConfig
  getApiKey: () => string
  setApiKey: (plainKey: string) => void
  getOpenAiKey: () => string
  setOpenAiKey: (plainKey: string) => void
  /** 根據目前 provider 回傳對應的 key + apiBase */
  getProviderConfig: () => { apiKey: string; apiBase: string }
  updateConfig: (partial: Partial<Omit<AppConfig, 'apiKeyEncoded' | 'openaiKeyEncoded'>>) => void
  clearConfig: () => void
}

export const useConfigStore = create<ConfigStoreState>((set, get) => ({
  config: loadFromStorage(),

  getApiKey: () => CryptoService.decode(get().config.apiKeyEncoded),

  setApiKey: (plainKey: string) => {
    const encoded = CryptoService.encode(plainKey)
    set((s) => {
      const updated = { ...s.config, apiKeyEncoded: encoded }
      saveToStorage(updated)
      return { config: updated }
    })
  },

  getOpenAiKey: () => CryptoService.decode(get().config.openaiKeyEncoded),

  setOpenAiKey: (plainKey: string) => {
    const encoded = CryptoService.encode(plainKey)
    set((s) => {
      const updated = { ...s.config, openaiKeyEncoded: encoded }
      saveToStorage(updated)
      return { config: updated }
    })
  },

  getProviderConfig: () => {
    const { provider } = get().config
    if (provider === 'openai') {
      return {
        apiKey: CryptoService.decode(get().config.openaiKeyEncoded),
        apiBase: 'https://api.openai.com/v1',
      }
    }
    return {
      apiKey: CryptoService.decode(get().config.apiKeyEncoded),
      apiBase: 'https://api.groq.com/openai/v1',
    }
  },

  updateConfig: (partial) => {
    set((s) => {
      const updated = { ...s.config, ...partial }
      saveToStorage(updated)
      return { config: updated }
    })
  },

  clearConfig: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ config: DEFAULT_CONFIG })
  },
}))

