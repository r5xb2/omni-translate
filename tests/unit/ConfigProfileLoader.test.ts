import { describe, expect, it } from 'vitest'
import {
  loadBuiltinProfileById,
  loadBuiltinProfiles,
  loadDefaultProfile,
  parseImportedProfile,
} from '../../src/services/ConfigProfileLoader'

describe('ConfigProfileLoader', () => {
  it('可以載入 defaults profile', () => {
    const profile = loadDefaultProfile()
    expect(profile.id).toBe('defaults')
    expect(profile.configPatch.modelSettings?.sttModel).toBeTruthy()
    expect(profile.configPatch.systemPrompt?.length).toBeGreaterThan(0)
  })

  it('可以列出內建 profiles 並可透過 id 取得', () => {
    const all = loadBuiltinProfiles()
    expect(all.length).toBeGreaterThan(0)

    const first = all[0]
    const byId = loadBuiltinProfileById(first.id)
    expect(byId?.id).toBe(first.id)
  })

  it('可以解析匯入 profile 文字', () => {
    const raw = `id: imported-demo\nname: Imported Demo\nprovider: groq\nmodelSettings:\n  sttModel: whisper-large-v3-turbo\n  llmModel: openai/gpt-oss-20b\nspeaker:\n  enabled: true\nprompts:\n  systemText: demo system\n  userText: demo user\n`
    const profile = parseImportedProfile(raw, 'demo.yaml')

    expect(profile.id).toBe('imported-demo')
    expect(profile.name).toBe('Imported Demo')
    expect(profile.configPatch.speakerDiarizationEnabled).toBe(true)
    expect(profile.configPatch.systemPrompt).toBe('demo system')
    expect(profile.configPatch.userPrompt).toBe('demo user')
  })
})
