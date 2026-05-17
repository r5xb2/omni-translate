import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { AppConfig, ApiProvider, DisplayMode, InteractionMode, RecordTemplate, SttMode } from '../types'
import {
  DEFAULT_ENABLE_TRANSLATION,
  DEFAULT_LLM_MODEL,
  DEFAULT_MEETING_READABLE_MODE,
  DEFAULT_READABILITY_MERGE_GAP_MS,
  DEFAULT_READABILITY_MIN_CHARS,
  DEFAULT_DISPLAY_MODE,
  DEFAULT_REALTIME_MODEL,
  DEFAULT_SPEAKER_DIARIZATION_ENABLED,
  DEFAULT_RECORD_TEMPLATE,
  DEFAULT_ROLLING_CONTEXT_SIZE,
  DEFAULT_INTERACTION_MODE,
  DEFAULT_STT_LANGUAGE_HINT,
  DEFAULT_STT_MODE,
  DEFAULT_STT_MODEL,
  DEFAULT_STT_PROMPT,
  DEFAULT_VAD_MAX_DURATION_MS,
  DEFAULT_VAD_SILENCE_MS,
  DEFAULT_ZH_PUNCTUATION_MIN_CHARS,
  DEFAULT_ZH_PUNCTUATION_REPAIR_ENABLED,
  ICT_SYSTEM_PROMPT,
  ICT_USER_PROMPT,
} from '../utils/constants'

import defaultProfileRaw from '../../config/defaults.yaml?raw'

const builtinProfileRaw = import.meta.glob('../../config/profiles/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const builtinPromptRaw = import.meta.glob('../../prompts/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const profileSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  provider: z.enum(['groq', 'openai']).optional(),
  sttMode: z.enum(['standard', 'openai-realtime']).optional(),
  modelSettings: z.object({
    sttModel: z.string().min(1).optional(),
    llmModel: z.string().min(1).optional(),
  }).optional(),
  realtimeModel: z.string().min(1).optional(),
  vad: z.object({
    silenceMs: z.number().int().min(100).max(5000).optional(),
    maxDurationMs: z.number().int().min(5000).max(60000).optional(),
  }).optional(),
  translation: z.object({
    enabled: z.boolean().optional(),
  }).optional(),
  sttPrompt: z.string().optional(),
  sttLanguageHint: z.string().optional(),
  speaker: z.object({
    enabled: z.boolean().optional(),
  }).optional(),
  zhPunctuation: z.object({
    enabled: z.boolean().optional(),
    minChars: z.number().int().min(1).max(20).optional(),
  }).optional(),
  meetingReadable: z.object({
    enabled: z.boolean().optional(),
    mergeGapMs: z.number().int().min(100).max(5000).optional(),
    minChars: z.number().int().min(1).max(20).optional(),
  }).optional(),
  prompts: z.object({
    systemFile: z.string().min(1).optional(),
    userFile: z.string().min(1).optional(),
    systemText: z.string().min(1).optional(),
    userText: z.string().min(1).optional(),
  }).optional(),
  interaction: z.object({
    mode: z.enum(['conversation', 'lecture']).optional(),
    displayMode: z.enum(['original', 'translated', 'bilingual']).optional(),
    defaultRecordTemplate: z.string().min(1).optional(),
  }).optional(),
  apiKeys: z.object({
    groq: z.string().min(1).optional(),
    openai: z.string().min(1).optional(),
  }).optional(),
})

type ProfileDoc = z.infer<typeof profileSchema>

export interface LoadedConfigProfile {
  id: string
  name: string
  source: 'defaults' | 'builtin' | 'imported'
  configPatch: Partial<Omit<AppConfig, 'apiKeyEncoded' | 'openaiKeyEncoded'>>
  apiKeys?: {
    groq?: string
    openai?: string
  }
}

const BASE_DEFAULT_CONFIG: Omit<AppConfig, 'apiKeyEncoded' | 'openaiKeyEncoded'> = {
  provider: 'groq',
  vadSilenceMs: DEFAULT_VAD_SILENCE_MS,
  vadMaxDurationMs: DEFAULT_VAD_MAX_DURATION_MS,
  systemPrompt: ICT_SYSTEM_PROMPT,
  userPrompt: ICT_USER_PROMPT,
  rollingContextSize: DEFAULT_ROLLING_CONTEXT_SIZE,
  modelSettings: {
    sttModel: DEFAULT_STT_MODEL,
    llmModel: DEFAULT_LLM_MODEL,
  },
  enableTranslation: DEFAULT_ENABLE_TRANSLATION,
  sttPrompt: DEFAULT_STT_PROMPT,
  sttLanguageHint: DEFAULT_STT_LANGUAGE_HINT,
  zhPunctuationRepairEnabled: DEFAULT_ZH_PUNCTUATION_REPAIR_ENABLED,
  zhPunctuationMinChars: DEFAULT_ZH_PUNCTUATION_MIN_CHARS,
  meetingReadableMode: DEFAULT_MEETING_READABLE_MODE,
  readabilityMergeGapMs: DEFAULT_READABILITY_MERGE_GAP_MS,
  readabilityMinChars: DEFAULT_READABILITY_MIN_CHARS,
  sttMode: DEFAULT_STT_MODE,
  realtimeModel: DEFAULT_REALTIME_MODEL,
  speakerDiarizationEnabled: DEFAULT_SPEAKER_DIARIZATION_ENABLED,
  interactionMode: DEFAULT_INTERACTION_MODE,
  displayMode: DEFAULT_DISPLAY_MODE,
  defaultRecordTemplate: DEFAULT_RECORD_TEMPLATE,
}

function normalizePath(pathLike: string): string {
  return pathLike.replace(/\\/g, '/').replace(/^\//, '').replace(/^\.\//, '')
}

function resolvePromptText(pathLike: string | undefined, fallback: string): string {
  if (!pathLike) return fallback
  const normalized = normalizePath(pathLike)

  const hit = Object.entries(builtinPromptRaw).find(([key]) => {
    const normalizedKey = normalizePath(key)
    return normalizedKey.endsWith(normalized)
  })

  return hit?.[1]?.trim() || fallback
}

function toConfigPatch(doc: ProfileDoc): Partial<Omit<AppConfig, 'apiKeyEncoded' | 'openaiKeyEncoded'>> {
  const provider = doc.provider as ApiProvider | undefined
  const sttMode = doc.sttMode as SttMode | undefined
  const interactionMode = doc.interaction?.mode as InteractionMode | undefined
  const displayMode = doc.interaction?.displayMode as DisplayMode | undefined
  const defaultRecordTemplate = doc.interaction?.defaultRecordTemplate as RecordTemplate | undefined

  return {
    activeProfileId: doc.id,
    provider,
    sttMode,
    interactionMode: interactionMode ?? BASE_DEFAULT_CONFIG.interactionMode,
    displayMode: displayMode ?? BASE_DEFAULT_CONFIG.displayMode,
    defaultRecordTemplate: defaultRecordTemplate ?? BASE_DEFAULT_CONFIG.defaultRecordTemplate,
    modelSettings: {
      sttModel: doc.modelSettings?.sttModel ?? BASE_DEFAULT_CONFIG.modelSettings.sttModel,
      llmModel: doc.modelSettings?.llmModel ?? BASE_DEFAULT_CONFIG.modelSettings.llmModel,
    },
    realtimeModel: doc.realtimeModel ?? BASE_DEFAULT_CONFIG.realtimeModel,
    vadSilenceMs: doc.vad?.silenceMs ?? BASE_DEFAULT_CONFIG.vadSilenceMs,
    vadMaxDurationMs: doc.vad?.maxDurationMs ?? BASE_DEFAULT_CONFIG.vadMaxDurationMs,
    enableTranslation: doc.translation?.enabled ?? BASE_DEFAULT_CONFIG.enableTranslation,
    sttPrompt: doc.sttPrompt ?? BASE_DEFAULT_CONFIG.sttPrompt,
    sttLanguageHint: doc.sttLanguageHint ?? BASE_DEFAULT_CONFIG.sttLanguageHint,
    speakerDiarizationEnabled: doc.speaker?.enabled ?? BASE_DEFAULT_CONFIG.speakerDiarizationEnabled,
    zhPunctuationRepairEnabled: doc.zhPunctuation?.enabled ?? BASE_DEFAULT_CONFIG.zhPunctuationRepairEnabled,
    zhPunctuationMinChars: doc.zhPunctuation?.minChars ?? BASE_DEFAULT_CONFIG.zhPunctuationMinChars,
    meetingReadableMode: doc.meetingReadable?.enabled ?? BASE_DEFAULT_CONFIG.meetingReadableMode,
    readabilityMergeGapMs: doc.meetingReadable?.mergeGapMs ?? BASE_DEFAULT_CONFIG.readabilityMergeGapMs,
    readabilityMinChars: doc.meetingReadable?.minChars ?? BASE_DEFAULT_CONFIG.readabilityMinChars,
    systemPrompt:
      doc.prompts?.systemText?.trim() ||
      resolvePromptText(doc.prompts?.systemFile, BASE_DEFAULT_CONFIG.systemPrompt),
    userPrompt:
      doc.prompts?.userText?.trim() ||
      resolvePromptText(doc.prompts?.userFile, BASE_DEFAULT_CONFIG.userPrompt),
  }
}

function parseProfileRaw(raw: string, source: LoadedConfigProfile['source'], fallbackId: string, fallbackName: string): LoadedConfigProfile {
  const parsed = profileSchema.parse(parseYaml(raw) ?? {})
  return {
    id: parsed.id ?? fallbackId,
    name: parsed.name ?? fallbackName,
    source,
    configPatch: toConfigPatch(parsed),
    apiKeys: parsed.apiKeys,
  }
}

function deriveProfileIdFromPath(modulePath: string): string {
  const normalized = normalizePath(modulePath)
  const fileName = normalized.split('/').pop() ?? normalized
  return fileName.replace(/\.ya?ml$/i, '')
}

function deriveProfileNameFromPath(modulePath: string): string {
  const id = deriveProfileIdFromPath(modulePath)
  return id
}

export function createBaseDefaultConfig(): Omit<AppConfig, 'apiKeyEncoded' | 'openaiKeyEncoded'> {
  return { ...BASE_DEFAULT_CONFIG }
}

export function loadDefaultProfile(): LoadedConfigProfile {
  return parseProfileRaw(defaultProfileRaw, 'defaults', 'defaults', '內建預設')
}

export function loadBuiltinProfiles(): LoadedConfigProfile[] {
  return Object.entries(builtinProfileRaw)
    .map(([modulePath, raw]) => {
      const fallbackId = deriveProfileIdFromPath(modulePath)
      const fallbackName = deriveProfileNameFromPath(modulePath)
      return parseProfileRaw(raw, 'builtin', fallbackId, fallbackName)
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant-TW'))
}

export function loadBuiltinProfileById(profileId: string): LoadedConfigProfile | null {
  const all = [loadDefaultProfile(), ...loadBuiltinProfiles()]
  return all.find((p) => p.id === profileId) ?? null
}

export function parseImportedProfile(raw: string, fileName = 'imported'): LoadedConfigProfile {
  const fallbackId = fileName.replace(/\.[^.]+$/, '') || 'imported'
  return parseProfileRaw(raw, 'imported', fallbackId, fallbackId)
}
