import { AppConfig } from '../types'

export interface LocalAppConfigSnapshot {
  version: number
  provider: AppConfig['provider']
  apiKeys: {
    groq: string
    openai: string
  }
  configPatch: Partial<Omit<AppConfig, 'apiKeyEncoded' | 'openaiKeyEncoded'>>
}

export const LocalConfigService = {
  async load(): Promise<LocalAppConfigSnapshot | null> {
    const res = await fetch('/local-config')
    if (!res.ok) {
      throw new Error(`讀取本機設定失敗：HTTP ${res.status}`)
    }
    const data = await res.json() as { config?: LocalAppConfigSnapshot | null }
    return data.config ?? null
  },

  async save(config: LocalAppConfigSnapshot): Promise<void> {
    const res = await fetch('/local-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    })
    if (!res.ok) {
      throw new Error(`儲存本機設定失敗：HTTP ${res.status}`)
    }
  },
}
