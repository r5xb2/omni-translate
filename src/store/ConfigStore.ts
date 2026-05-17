import { create } from 'zustand'
import { AppConfig } from '../types'
import { CryptoService } from '../services/CryptoService'
import { LocalConfigService } from '../services/LocalConfigService'
import {
  STORAGE_KEY,
  GROQ_API_BASE,
  OPENAI_API_BASE,
} from '../utils/constants'
import {
  createBaseDefaultConfig,
  loadBuiltinProfileById,
  loadBuiltinProfiles,
  loadDefaultProfile,
  parseImportedProfile,
} from '../services/ConfigProfileLoader'

export interface ConfigProfileOption {
  id: string
  name: string
}

function mergeConfig(
  base: Omit<AppConfig, 'apiKeyEncoded' | 'openaiKeyEncoded'>,
  patch: Partial<Omit<AppConfig, 'apiKeyEncoded' | 'openaiKeyEncoded'>>,
): Omit<AppConfig, 'apiKeyEncoded' | 'openaiKeyEncoded'> {
  return {
    ...base,
    ...patch,
    modelSettings: {
      ...base.modelSettings,
      ...(patch.modelSettings ?? {}),
    },
  }
}

function stripKeyFields(config: AppConfig): Omit<AppConfig, 'apiKeyEncoded' | 'openaiKeyEncoded'> {
  const { apiKeyEncoded: _groqKey, openaiKeyEncoded: _openAiKey, ...rest } = config
  return rest
}

function buildDefaultConfig(): AppConfig {
  const base = createBaseDefaultConfig()
  const defaultProfile = loadDefaultProfile()
  const merged = mergeConfig(base, defaultProfile.configPatch)
  return {
    ...merged,
    activeProfileId: defaultProfile.id,
    apiKeyEncoded: '',
    openaiKeyEncoded: '',
  }
}

const DEFAULT_CONFIG: AppConfig = buildDefaultConfig()

function loadFromStorage(): AppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CONFIG
    const parsed = JSON.parse(raw) as Partial<AppConfig>
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      modelSettings: {
        ...DEFAULT_CONFIG.modelSettings,
        ...(parsed.modelSettings ?? {}),
      },
    }
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
  profileOptions: ConfigProfileOption[]
  localConfigStatus: string
  getApiKey: () => string
  setApiKey: (plainKey: string) => void
  getOpenAiKey: () => string
  setOpenAiKey: (plainKey: string) => void
  /** 根據目前 provider 回傳對應的 key + apiBase */
  getProviderConfig: () => { apiKey: string; apiBase: string }
  updateConfig: (partial: Partial<Omit<AppConfig, 'apiKeyEncoded' | 'openaiKeyEncoded'>>) => void
  applyBuiltinProfile: (profileId: string) => { ok: boolean; message: string }
  importProfileText: (raw: string, fileName?: string) => { ok: boolean; message: string }
  hydrateFromLocalConfig: () => Promise<{ ok: boolean; message: string }>
  persistToLocalConfig: () => Promise<{ ok: boolean; message: string }>
  resetToDefaultProfile: () => void
  clearConfig: () => void
}

const builtinProfiles = [loadDefaultProfile(), ...loadBuiltinProfiles()]

export const useConfigStore = create<ConfigStoreState>((set, get) => ({
  config: loadFromStorage(),
  profileOptions: builtinProfiles.map((p) => ({ id: p.id, name: p.name })),
  localConfigStatus: '',

  getApiKey: () => CryptoService.decode(get().config.apiKeyEncoded),

  setApiKey: (plainKey: string) => {
    const encoded = CryptoService.encode(plainKey)
    set((s) => {
      const updated = { ...s.config, apiKeyEncoded: encoded }
      saveToStorage(updated)
      return { config: updated }
    })
    void get().persistToLocalConfig()
  },

  getOpenAiKey: () => CryptoService.decode(get().config.openaiKeyEncoded),

  setOpenAiKey: (plainKey: string) => {
    const encoded = CryptoService.encode(plainKey)
    set((s) => {
      const updated = { ...s.config, openaiKeyEncoded: encoded }
      saveToStorage(updated)
      return { config: updated }
    })
    void get().persistToLocalConfig()
  },

  getProviderConfig: () => {
    const { provider } = get().config
    if (provider === 'openai') {
      return {
        apiKey: CryptoService.decode(get().config.openaiKeyEncoded),
        apiBase: OPENAI_API_BASE,
      }
    }
    return {
      apiKey: CryptoService.decode(get().config.apiKeyEncoded),
      apiBase: GROQ_API_BASE,
    }
  },

  updateConfig: (partial) => {
    set((s) => {
      const updated = {
        ...s.config,
        ...partial,
        modelSettings: {
          ...s.config.modelSettings,
          ...(partial.modelSettings ?? {}),
        },
      }
      saveToStorage(updated)
      return { config: updated }
    })
  },

  applyBuiltinProfile: (profileId) => {
    try {
      const profile = loadBuiltinProfileById(profileId)
      if (!profile) {
        return { ok: false, message: `找不到 profile: ${profileId}` }
      }

      set((s) => {
        const currentWithoutKeys = stripKeyFields(s.config)
        const merged = mergeConfig(currentWithoutKeys, profile.configPatch)
        const updated: AppConfig = {
          ...merged,
          activeProfileId: profile.id,
          apiKeyEncoded: s.config.apiKeyEncoded,
          openaiKeyEncoded: s.config.openaiKeyEncoded,
        }
        saveToStorage(updated)
        return { config: updated }
      })

      void get().persistToLocalConfig()
      return { ok: true, message: `已套用 profile：${profile.name}` }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      return { ok: false, message: `套用 profile 失敗：${detail}` }
    }
  },

  importProfileText: (raw, fileName) => {
    try {
      const profile = parseImportedProfile(raw, fileName)
      set((s) => {
        const currentWithoutKeys = stripKeyFields(s.config)
        const merged = mergeConfig(currentWithoutKeys, profile.configPatch)
        const updated: AppConfig = {
          ...merged,
          activeProfileId: profile.id,
          apiKeyEncoded: profile.apiKeys?.groq
            ? CryptoService.encode(profile.apiKeys.groq)
            : s.config.apiKeyEncoded,
          openaiKeyEncoded: profile.apiKeys?.openai
            ? CryptoService.encode(profile.apiKeys.openai)
            : s.config.openaiKeyEncoded,
        }
        saveToStorage(updated)
        return {
          config: updated,
          profileOptions: s.profileOptions.some((p) => p.id === profile.id)
            ? s.profileOptions
            : [...s.profileOptions, { id: profile.id, name: profile.name }],
        }
      })

      void get().persistToLocalConfig()
      return { ok: true, message: `已匯入 profile：${profile.name}` }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      return { ok: false, message: `匯入 profile 失敗：${detail}` }
    }
  },

  hydrateFromLocalConfig: async () => {
    try {
      const localConfig = await LocalConfigService.load()
      if (!localConfig) {
        set({ localConfigStatus: '本機設定檔不存在，使用目前設定。' })
        return { ok: true, message: '本機設定檔不存在，已略過。' }
      }
      const patch = localConfig.configPatch ?? {}

      set((s) => {
        const mergedConfig: AppConfig = {
          ...s.config,
          ...patch,
          provider: localConfig.provider ?? s.config.provider,
          modelSettings: {
            ...s.config.modelSettings,
            ...(patch.modelSettings ?? {}),
          },
          apiKeyEncoded: localConfig.apiKeys?.groq ? CryptoService.encode(localConfig.apiKeys.groq) : s.config.apiKeyEncoded,
          openaiKeyEncoded: localConfig.apiKeys?.openai ? CryptoService.encode(localConfig.apiKeys.openai) : s.config.openaiKeyEncoded,
        }
        saveToStorage(mergedConfig)
        return { config: mergedConfig, localConfigStatus: '已從本機設定檔載入。' }
      })

      return { ok: true, message: '已從本機設定檔載入。' }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      set({ localConfigStatus: `本機設定載入失敗：${detail}` })
      return { ok: false, message: `本機設定載入失敗：${detail}` }
    }
  },

  persistToLocalConfig: async () => {
    try {
      const current = get().config
      await LocalConfigService.save({
        version: 1,
        provider: current.provider,
        apiKeys: {
          groq: CryptoService.decode(current.apiKeyEncoded),
          openai: CryptoService.decode(current.openaiKeyEncoded),
        },
        configPatch: {
          ...stripKeyFields(current),
        },
      })
      set({ localConfigStatus: '已同步到本機設定檔。' })
      return { ok: true, message: '已同步到本機設定檔。' }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      set({ localConfigStatus: `本機設定同步失敗：${detail}` })
      return { ok: false, message: `本機設定同步失敗：${detail}` }
    }
  },

  resetToDefaultProfile: () => {
    const resetConfig = buildDefaultConfig()
    saveToStorage(resetConfig)
    set({ config: resetConfig })
    void get().persistToLocalConfig()
  },

  clearConfig: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ config: DEFAULT_CONFIG })
  },
}))

