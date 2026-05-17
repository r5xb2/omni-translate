import { useCallback, useRef } from 'react'
import { AudioEngine } from '../services/AudioEngine'
import { RealtimeWebRTCEngine } from '../services/RealtimeWebRTCEngine'
import { GroqService, RateLimitError, InvalidKeyError } from '../services/GroqService'
import { ContextManager } from '../services/ContextManager'
import { RuntimeMetricsService } from '../services/RuntimeMetricsService'
import { SpeakerDiarizationService } from '../services/SpeakerDiarizationService'
import { useAppStore } from '../store/AppStore'
import { useConfigStore } from '../store/ConfigStore'
import { ChatMessage, Message } from '../types'
import { applyTerminologyCorrections } from '../utils/textCorrections'
import OpenCC from 'opencc-js'

const EN_TRANSLATION_SYSTEM_PROMPT = `You are a precise technical meeting translator.
Translate the input into natural English.
Rules:
- Keep technical acronyms and standards in English (NVMe, PCIe, SSD, BIOS, UEFI, DDR).
- Output only the translated English sentence(s). No explanation.`

const ZH_TW_TRANSLATION_SYSTEM_PROMPT = `You are a precise technical meeting translator.
Translate the input into Traditional Chinese used in Taiwan (zh-TW).
Rules:
- Keep technical acronyms and standards in English (NVMe, PCIe, SSD, BIOS, UEFI, DDR).
- Do not output Simplified Chinese.
- Output only translated Traditional Chinese sentence(s). No explanation.`

const ZH_CHAR_RE = /[\u3400-\u9FFF]/g
const EN_CHAR_RE = /[A-Za-z]/g
const ZH_PUNCT_RE = /[，。！？；：]/
const ASCII_PUNCT_RE = /[,.!?;:]/
const REFUSAL_PATTERNS = [
  /\bi\s+(?:cannot|can't|won't|am unable)\b/i,
  /\bi\s+can\s+not\b/i,
  /\bsorry\b/i,
  /抱歉|無法|不能|拒絕/,
]

type SourceLanguage = 'en' | 'zh' | 'mixed'
type TargetLanguage = 'en' | 'zh'

interface BilingualResult {
  english: string
  chinese: string
}

const cnToTwpConverter = OpenCC.Converter({ from: 'cn', to: 'twp' })

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function compactCompare(text: string): string {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[\s.,!?;:'"()\-_/\\，。！？；：「」、『』（）]/g, '')
}

function countZhChars(text: string): number {
  return (text.match(ZH_CHAR_RE) ?? []).length
}

function countEnChars(text: string): number {
  return (text.match(EN_CHAR_RE) ?? []).length
}

function isSameText(a: string, b: string): boolean {
  return compactCompare(a) !== '' && compactCompare(a) === compactCompare(b)
}

function detectSourceLanguage(text: string): SourceLanguage {
  const zhCount = countZhChars(text)
  const enCount = countEnChars(text)

  if (zhCount === 0 && enCount > 0) return 'en'
  if (enCount === 0 && zhCount > 0) return 'zh'
  if (zhCount === 0 && enCount === 0) return 'en'

  const ratio = zhCount / (zhCount + enCount)
  if (ratio >= 0.65) return 'zh'
  if (ratio <= 0.35) return 'en'
  return 'mixed'
}

function isRefusalText(text: string): boolean {
  const compact = normalizeText(text)
  if (!compact) return true
  return REFUSAL_PATTERNS.some((pattern) => pattern.test(compact))
}

function normalizeToZhTwLocal(text: string): string {
  const compact = normalizeText(text)
  if (!compact) return compact
  try {
    return normalizeText(cnToTwpConverter(compact))
  } catch {
    return compact
  }
}

function normalizeZhPunctuationMarks(text: string): string {
  return normalizeText(text)
    .replace(/,/g, '，')
    .replace(/\./g, '。')
    .replace(/\?/g, '？')
    .replace(/!/g, '！')
    .replace(/;/g, '；')
    .replace(/:/g, '：')
    .replace(/\s*([，。！？；：])/g, '$1')
}

function shouldRepairZhPunctuation(text: string, minZhChars: number): boolean {
  const compact = normalizeText(text)
  if (!compact) return false
  if (ZH_PUNCT_RE.test(compact)) return false
  if (!ASCII_PUNCT_RE.test(compact) && countZhChars(compact) < Math.max(10, minZhChars)) return false
  return countZhChars(compact) >= minZhChars
}

function isValidChineseOutput(text: string, sourceText: string): boolean {
  const compact = normalizeText(text)
  if (!compact || isRefusalText(compact)) return false

  const zhCount = countZhChars(compact)
  if (zhCount < 1) return false

  const sourceLooksEnglish = countZhChars(sourceText) === 0 && countEnChars(sourceText) > 0
  if (sourceLooksEnglish && isSameText(compact, sourceText)) return false

  return true
}

function isValidEnglishOutput(text: string, sourceText: string): boolean {
  const compact = normalizeText(text)
  if (!compact || isRefusalText(compact)) return false

  const zhCount = countZhChars(compact)
  const enCount = countEnChars(compact)
  if (enCount < 4) return false

  const totalAlpha = zhCount + enCount
  if (totalAlpha >= 20 && enCount / totalAlpha < 0.4) return false

  const sourceLooksChinese = countZhChars(sourceText) > 0 && countEnChars(sourceText) === 0
  if (sourceLooksChinese && isSameText(compact, sourceText)) return false

  return true
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err instanceof Error && err.name === 'AbortError') return true
  return false
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/**
 * useAudio Hook
 * 整合 AudioEngine → GroqService → AppStore 的完整翻譯流程
 *
 * 架構：
 * - processSingleBlob：處理單一音訊片段（STT → LLM）
 * - handleSpeechEnd：佇列入口，將 Blob 排隊後非同步消耗
 *   → 確保 GROQ 作業期間麥克風持續接收，不丟失任何語音段落
 */
export function useAudio() {
  const engineRef = useRef<AudioEngine | null>(null)
  const realtimeEngineRef = useRef<RealtimeWebRTCEngine | null>(null)
  const contextRef = useRef<ContextManager>(new ContextManager(5))
  const speakerRef = useRef<SpeakerDiarizationService>(new SpeakerDiarizationService())
  const realtimeSessionIdRef = useRef(0)
  const realtimeAcceptingRef = useRef(false)
  const realtimeDrainUntilRef = useRef(0)
  const realtimeInFlightControllersRef = useRef<Set<AbortController>>(new Set())
  const realtimeSeenItemIdsRef = useRef<Set<string>>(new Set())

  // ─── 音訊作業佇列（防止並行呼叫 GROQ 造成亂序或 Rate Limit）──
  // capturedAt：VAD onSpeechStart 時間（段落開始）
  // capturedEndAt：VAD onSpeechEnd 時間（段落結束）
  // 兩者差値 = 語音段落實際持續時長
  const blobQueueRef = useRef<{
    blob: Blob
    capturedAt: number
    capturedEndAt: number
    audioSamples?: Float32Array
  }[]>([])
  const processingRef = useRef(false)

  const { addMessage, removeMessage, updateMessage, setRecordingState, setAppError, startSession, getExportSession, addPending, removePending } =
    useAppStore()
  const { config, getProviderConfig } = useConfigStore()

  const assignSpeakerLabel = useCallback(
    (capturedAt: number, capturedEndAt: number, audioSamples?: Float32Array): string | undefined => {
      if (!config.speakerDiarizationEnabled) return undefined
      if (config.interactionMode === 'lecture') return undefined
      const result = speakerRef.current.assign({
        startedAt: capturedAt,
        endedAt: capturedEndAt,
        audioSamples,
      })
      return result.label
    },
    [config.interactionMode, config.speakerDiarizationEnabled],
  )

  const isRealtimeSessionActive = useCallback((sessionId: number) => {
    if (sessionId !== realtimeSessionIdRef.current) return false
    if (realtimeAcceptingRef.current) return true
    return Date.now() <= realtimeDrainUntilRef.current
  }, [])

  const cancelRealtimeInFlight = useCallback(() => {
    realtimeInFlightControllersRef.current.forEach((controller) => controller.abort())
    realtimeInFlightControllersRef.current.clear()
  }, [])

  const waitForProcessingDrain = useCallback(async (timeoutMs: number) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const { pendingCount } = useAppStore.getState()
      const idle =
        pendingCount === 0
        && blobQueueRef.current.length === 0
        && !processingRef.current
        && realtimeInFlightControllersRef.current.size === 0
      if (idle) return true
      await sleep(60)
    }
    return false
  }, [])

  const buildTargetMessages = useCallback((
    transcript: string,
    target: TargetLanguage,
    glossaryPrompt: string,
    strict = false,
  ): ChatMessage[] => {
    const history = contextRef.current
      .getLastN(config.rollingContextSize)
      .map((m, idx) => `${idx + 1}. English: ${m.originalText}\n   Chinese: ${m.translatedText}`)
      .join('\n')

    const historySection = history || '(none)'
    const systemPrompt = target === 'zh' ? ZH_TW_TRANSLATION_SYSTEM_PROMPT : EN_TRANSLATION_SYSTEM_PROMPT
    const targetLabel = target === 'zh' ? 'Traditional Chinese (Taiwan)' : 'English'
    const strictLine = strict
      ? `\nStrict output check: output must be ${targetLabel} only. Do not copy source language.`
      : ''

    return [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content:
          `Terminology preference:\n${glossaryPrompt}`,
      },
      {
        role: 'user',
        content: `Recent bilingual context:\n${historySection}`,
      },
      {
        role: 'user',
        content:
          `Translate this utterance to ${targetLabel}:\n${transcript}${strictLine}`,
      },
    ]
  }, [config.rollingContextSize])

  const translateToTarget = useCallback(async (
    transcript: string,
    target: TargetLanguage,
    apiKey: string,
    llmModel: string,
    apiBase: string,
    strict = false,
    signal?: AbortSignal,
  ): Promise<string> => {
    const raw = await GroqService.translate(
      buildTargetMessages(
        transcript,
        target,
        `${config.systemPrompt}\n${config.userPrompt}`,
        strict,
      ),
      apiKey,
      llmModel,
      apiBase,
      signal,
    )
    return normalizeText(raw)
  }, [buildTargetMessages, config.systemPrompt, config.userPrompt])

  const buildEmergencyZhMessages = useCallback((transcript: string): ChatMessage[] => {
    return [
      {
        role: 'system',
        content:
          'Translate the input into Traditional Chinese used in Taiwan (zh-TW). Output Chinese only. If the source is fragmented, still provide the best Chinese rendering without explanation.',
      },
      {
        role: 'user',
        content: transcript,
      },
    ]
  }, [])

  const buildZhPunctuationMessages = useCallback((text: string): ChatMessage[] => {
    return [
      {
        role: 'system',
        content:
          'Add proper Traditional Chinese (Taiwan) punctuation to the text while preserving wording and technical terms. Output only the punctuated Traditional Chinese text.',
      },
      {
        role: 'user',
        content: text,
      },
    ]
  }, [])

  const punctuateZhText = useCallback(async (
    text: string,
    apiKey: string,
    llmModel: string,
    apiBase: string,
    signal?: AbortSignal,
  ): Promise<string> => {
    const normalized = normalizeZhPunctuationMarks(normalizeToZhTwLocal(text))
    if (!config.zhPunctuationRepairEnabled) return normalized
    if (!shouldRepairZhPunctuation(normalized, config.zhPunctuationMinChars)) return normalized

    const punctuatedRaw = await GroqService.translate(
      buildZhPunctuationMessages(normalized),
      apiKey,
      llmModel,
      apiBase,
      signal,
    )

    const punctuated = normalizeZhPunctuationMarks(normalizeToZhTwLocal(punctuatedRaw))
    if (countZhChars(punctuated) >= countZhChars(normalized)) return punctuated
    return normalized
  }, [buildZhPunctuationMessages, config.zhPunctuationMinChars, config.zhPunctuationRepairEnabled])

  const ensureChineseOutput = useCallback(async (
    sourceText: string,
    candidateText: string,
    apiKey: string,
    llmModel: string,
    apiBase: string,
    signal?: AbortSignal,
  ): Promise<string> => {
    const attempts: string[] = []

    const first = await punctuateZhText(candidateText, apiKey, llmModel, apiBase, signal)
    attempts.push(first)
    if (isValidChineseOutput(first, sourceText)) return first

    const retry = await punctuateZhText(
      await translateToTarget(sourceText, 'zh', apiKey, llmModel, apiBase, false, signal),
      apiKey,
      llmModel,
      apiBase,
      signal,
    )
    attempts.push(retry)
    if (isValidChineseOutput(retry, sourceText)) return retry

    const strictRetry = await punctuateZhText(
      await translateToTarget(sourceText, 'zh', apiKey, llmModel, apiBase, true, signal),
      apiKey,
      llmModel,
      apiBase,
      signal,
    )
    attempts.push(strictRetry)
    if (isValidChineseOutput(strictRetry, sourceText)) return strictRetry

    const emergency = await punctuateZhText(
      await GroqService.translate(
        buildEmergencyZhMessages(sourceText),
        apiKey,
        llmModel,
        apiBase,
        signal,
      ),
      apiKey,
      llmModel,
      apiBase,
      signal,
    )
    attempts.push(emergency)
    if (isValidChineseOutput(emergency, sourceText)) return emergency

    const bestChineseCandidate = attempts
      .filter((t) => normalizeText(t).length > 0)
      .sort((a, b) => countZhChars(b) - countZhChars(a))[0]

    if (bestChineseCandidate && countZhChars(bestChineseCandidate) > 0) {
      return bestChineseCandidate
    }

    if (countZhChars(sourceText) > 0) {
      return punctuateZhText(sourceText, apiKey, llmModel, apiBase, signal)
    }

    return '（待翻譯）'
  }, [buildEmergencyZhMessages, punctuateZhText, translateToTarget])

  const ensureEnglishOutput = useCallback(async (
    sourceText: string,
    candidateText: string,
    apiKey: string,
    llmModel: string,
    apiBase: string,
    signal?: AbortSignal,
  ): Promise<string> => {
    let english = normalizeText(candidateText)
    if (isValidEnglishOutput(english, sourceText)) return english

    english = await translateToTarget(sourceText, 'en', apiKey, llmModel, apiBase, false, signal)
    if (isValidEnglishOutput(english, sourceText)) return english

    english = await translateToTarget(sourceText, 'en', apiKey, llmModel, apiBase, true, signal)
    if (isValidEnglishOutput(english, sourceText)) return english

    return countEnChars(sourceText) > 0
      ? normalizeText(sourceText)
      : 'Translation quality insufficient, please retry.'
  }, [translateToTarget])

  const translateBilingual = useCallback(async (
    transcript: string,
    apiKey: string,
    llmModel: string,
    apiBase: string,
    signal?: AbortSignal,
  ): Promise<BilingualResult> => {
    const sourceLang = detectSourceLanguage(transcript)

    if (sourceLang === 'en') {
      const chineseRaw = await translateToTarget(transcript, 'zh', apiKey, llmModel, apiBase, false, signal)
      const chinese = await ensureChineseOutput(transcript, chineseRaw, apiKey, llmModel, apiBase, signal)
      return {
        english: normalizeText(transcript),
        chinese,
      }
    }

    if (sourceLang === 'zh') {
      const englishRaw = await translateToTarget(transcript, 'en', apiKey, llmModel, apiBase, false, signal)
      const english = await ensureEnglishOutput(transcript, englishRaw, apiKey, llmModel, apiBase, signal)
      return {
        english,
        chinese: await punctuateZhText(transcript, apiKey, llmModel, apiBase, signal),
      }
    }

    const [englishRaw, chineseRaw] = await Promise.all([
      translateToTarget(transcript, 'en', apiKey, llmModel, apiBase, false, signal),
      translateToTarget(transcript, 'zh', apiKey, llmModel, apiBase, false, signal),
    ])
    const [english, chinese] = await Promise.all([
      ensureEnglishOutput(transcript, englishRaw, apiKey, llmModel, apiBase, signal),
      ensureChineseOutput(transcript, chineseRaw, apiKey, llmModel, apiBase, signal),
    ])

    return {
      english,
      chinese,
    }
  }, [
    ensureChineseOutput,
    ensureEnglishOutput,
    punctuateZhText,
    translateToTarget,
  ])

  const polishOriginalTranscript = useCallback(async (
    transcript: string,
    apiKey: string,
    llmModel: string,
    apiBase: string,
    signal?: AbortSignal,
  ): Promise<string> => {
    const normalized = applyTerminologyCorrections(transcript)
    if (!config.zhPunctuationRepairEnabled) return normalized
    try {
      return await punctuateZhText(normalized, apiKey, llmModel, apiBase, signal)
    } catch (err) {
      if (isAbortError(err)) throw err
      return normalized
    }
  }, [config.zhPunctuationRepairEnabled, punctuateZhText])

  // ─── 處理單一 Blob（實際 STT + LLM 邏輯）─────────────────────
  const processSingleBlob = useCallback(
    async (blob: Blob, capturedAt: number, capturedEndAt: number, audioSamples?: Float32Array) => {
      const { apiKey, apiBase } = getProviderConfig()
      const { sttModel, llmModel } = config.modelSettings
      const { sttPrompt, sttLanguageHint } = config

      // 使用 capturedAt/capturedEndAt 反映實際語音發生的時間範圍
      const msgId = addMessage({
        originalText: '',
        translatedText: '',
        status: 'transcribing',
      }, capturedAt, capturedEndAt)

      try {
        const transcript = await GroqService.transcribe(
          blob,
          apiKey,
          sttModel,
          apiBase,
          sttPrompt,
          sttLanguageHint,
        )
        if (!transcript) {
          // Whisper 回傳空字串：真靜音或語音過短無法辨識，記錄但不算遺失
          updateMessage(msgId, { status: 'error', originalText: '(靜音或無法辨識)' })
          return
        }

        RuntimeMetricsService.recordTranscriptLatency(Date.now() - capturedEndAt)
        const normalizedTranscript = applyTerminologyCorrections(transcript)
        const speakerLabel = assignSpeakerLabel(capturedAt, capturedEndAt, audioSamples)

        // 翻譯開關：關閉時顯示原文；若啟用標點修復仍會呼叫 LLM 做標點優化
        if (!config.enableTranslation) {
          const polishedOriginal = await polishOriginalTranscript(
            normalizedTranscript,
            apiKey,
            llmModel,
            apiBase,
          )
          updateMessage(msgId, {
            originalText: polishedOriginal,
            translatedText: '',
            status: 'completed',
            speakerLabel,
          })
          contextRef.current.add(
            useAppStore.getState().messages.find((m) => m.id === msgId) as Message
          )
          setAppError(null)
          return
        }

        updateMessage(msgId, { originalText: normalizedTranscript, status: 'translating', speakerLabel })

        const bilingual = await translateBilingual(normalizedTranscript, apiKey, llmModel, apiBase)

        const completedMsg: Partial<Message> = {
          originalText: applyTerminologyCorrections(bilingual.english),
          translatedText: applyTerminologyCorrections(bilingual.chinese),
          status: 'completed',
          speakerLabel,
        }
        updateMessage(msgId, completedMsg)

        const currentMsg = useAppStore.getState().messages.find((m) => m.id === msgId)
        if (currentMsg) {
          contextRef.current.add({ ...currentMsg, ...completedMsg } as Message)
        }

        setAppError(null)
        RuntimeMetricsService.recordTranslationSuccess()
      } catch (err) {
        if (err instanceof RateLimitError) {
          setAppError('rate_limit')
          updateMessage(msgId, { status: 'error', translatedText: '（Rate Limit，已自動重試）' })
          RuntimeMetricsService.recordTranslationError()
        } else if (err instanceof InvalidKeyError) {
          setAppError('invalid_key')
          updateMessage(msgId, { status: 'error', translatedText: '（API Key 無效）' })
          engineRef.current?.destroy()
          engineRef.current = null
          setRecordingState('stopping')
          RuntimeMetricsService.recordTranslationError()
        } else if (err instanceof TypeError && err.message.includes('fetch')) {
          setAppError('network_offline')
          updateMessage(msgId, { status: 'error', translatedText: '（網路中斷）' })
          RuntimeMetricsService.recordTranslationError()
        } else {
          setAppError('groq_server_error')
          updateMessage(msgId, { status: 'error', translatedText: '（服務異常）' })
          RuntimeMetricsService.recordTranslationError()
        }
      } finally {
        // 無論成功或失敗，必須移除一個 pending（確保計數器歸零）
        removePending()
      }
    },
    [addMessage, assignSpeakerLabel, config, getProviderConfig, polishOriginalTranscript, removeMessage, removePending, setAppError, setRecordingState, translateBilingual, updateMessage],
  )

  // ─── Realtime 模式：直接從轉寫文字進入翻譯管道（跳過 STT）────
  const processRealtimeTranscript = useCallback(
    async (
      sessionId: number,
      text: string,
      capturedAt: number,
      capturedEndAt: number,
      itemId?: string,
    ) => {
      if (!isRealtimeSessionActive(sessionId)) return
      if (itemId && realtimeSeenItemIdsRef.current.has(itemId)) return
      if (itemId) realtimeSeenItemIdsRef.current.add(itemId)

      const normalizedText = applyTerminologyCorrections(text)
      const speakerLabel = assignSpeakerLabel(capturedAt, capturedEndAt)
      RuntimeMetricsService.recordTranscriptLatency(Date.now() - capturedEndAt)

      addPending()
      const controller = new AbortController()
      realtimeInFlightControllersRef.current.add(controller)

      // Realtime 模式的翻譯仍使用 GROQ provider（依設定）
      const { apiKey, apiBase } = getProviderConfig()
      const { llmModel } = config.modelSettings

      let msgId: string | null = null

      if (!isRealtimeSessionActive(sessionId)) {
        controller.abort()
        realtimeInFlightControllersRef.current.delete(controller)
        removePending()
        return
      }

      msgId = addMessage(
        { originalText: normalizedText, translatedText: '', status: 'translating', speakerLabel },
        capturedAt,
        capturedEndAt,
      )

      try {
        if (!isRealtimeSessionActive(sessionId)) {
          removeMessage(msgId)
          return
        }

        if (!config.enableTranslation) {
          const polishedOriginal = await polishOriginalTranscript(
            normalizedText,
            apiKey,
            llmModel,
            apiBase,
            controller.signal,
          )
          if (!isRealtimeSessionActive(sessionId)) {
            removeMessage(msgId)
            return
          }
          updateMessage(msgId, { originalText: polishedOriginal, status: 'completed', speakerLabel })
          contextRef.current.add(
            useAppStore.getState().messages.find((m) => m.id === msgId) as Message,
          )
          setAppError(null)
          return
        }

        const bilingual = await translateBilingual(normalizedText, apiKey, llmModel, apiBase, controller.signal)

        if (!isRealtimeSessionActive(sessionId)) {
          removeMessage(msgId)
          return
        }

        const completedMsg: Partial<Message> = {
          originalText: applyTerminologyCorrections(bilingual.english),
          translatedText: applyTerminologyCorrections(bilingual.chinese),
          status: 'completed',
          speakerLabel,
        }
        updateMessage(msgId, completedMsg)

        const currentMsg = useAppStore.getState().messages.find((m) => m.id === msgId)
        if (currentMsg) {
          contextRef.current.add({ ...currentMsg, ...completedMsg } as Message)
        }
        setAppError(null)
        RuntimeMetricsService.recordTranslationSuccess()
      } catch (err) {
        if (isAbortError(err) || !isRealtimeSessionActive(sessionId)) {
          if (msgId) removeMessage(msgId)
          return
        }
        if (err instanceof RateLimitError) {
          setAppError('rate_limit')
          if (msgId) updateMessage(msgId, { status: 'error', translatedText: '（Rate Limit，已自動重試）' })
          RuntimeMetricsService.recordTranslationError()
        } else if (err instanceof InvalidKeyError) {
          setAppError('invalid_key')
          if (msgId) updateMessage(msgId, { status: 'error', translatedText: '（API Key 無效）' })
          realtimeEngineRef.current?.destroy()
          realtimeEngineRef.current = null
          realtimeAcceptingRef.current = false
          setRecordingState('stopping')
          RuntimeMetricsService.recordTranslationError()
        } else if (err instanceof TypeError && err.message.includes('fetch')) {
          setAppError('network_offline')
          if (msgId) updateMessage(msgId, { status: 'error', translatedText: '（網路中斷）' })
          RuntimeMetricsService.recordTranslationError()
        } else {
          setAppError('groq_server_error')
          if (msgId) updateMessage(msgId, { status: 'error', translatedText: '（服務異常）' })
          RuntimeMetricsService.recordTranslationError()
        }
      } finally {
        realtimeInFlightControllersRef.current.delete(controller)
        removePending()
      }
    },
    [
      addMessage,
      assignSpeakerLabel,
      config,
      getProviderConfig,
      isRealtimeSessionActive,
      removeMessage,
      removePending,
      setAppError,
      setRecordingState,
      polishOriginalTranscript,
      translateBilingual,
      updateMessage,
    ],
  )

  // ─── 佇列入口：立即返回，讓 AudioEngine 繼續監聽麥克風 ────────
  const handleSpeechEnd = useCallback(
    (blob: Blob, speechStartedAt: number, speechEndedAt: number, audioSamples?: Float32Array) => {
      // speechStartedAt / speechEndedAt 來自 AudioEngine，分別對應 onSpeechStart / onSpeechEnd 時刻
      // silenceGap = 下段 speechStartedAt - 上段 speechEndedAt（純靜音時長，不含語音本身）
      blobQueueRef.current.push({
        blob,
        capturedAt: speechStartedAt,
        capturedEndAt: speechEndedAt,
        audioSamples,
      })
      // addPending 必須在 push 之後立即執行，確保計數器不少算
      addPending()
      if (processingRef.current) return // 已有消耗者，直接返回

      processingRef.current = true
      void (async () => {
        while (blobQueueRef.current.length > 0) {
          const { blob: next, capturedAt, capturedEndAt: endAt, audioSamples } = blobQueueRef.current.shift()!
          await processSingleBlob(next, capturedAt, endAt, audioSamples)
        }
        processingRef.current = false
      })()
    },
    [processSingleBlob],
  )

  const getModeAdjustedVad = useCallback(() => {
    if (config.interactionMode === 'lecture') {
      return {
        silenceMs: Math.max(config.vadSilenceMs, 900),
        maxDurationMs: Math.max(config.vadMaxDurationMs, 30000),
      }
    }
    return {
      silenceMs: config.vadSilenceMs,
      maxDurationMs: config.vadMaxDurationMs,
    }
  }, [config.interactionMode, config.vadMaxDurationMs, config.vadSilenceMs])

  const startStandardEngine = useCallback(async () => {
    const modeVad = getModeAdjustedVad()
    const engine = new AudioEngine()
    await engine.init({
      onSpeechEnd: handleSpeechEnd,
      silenceMs: modeVad.silenceMs,
      maxDurationMs: modeVad.maxDurationMs,
    })
    engine.start()
    engineRef.current = engine
  }, [getModeAdjustedVad, handleSpeechEnd])

  // ─── 控制介面 ──────────────────────────────────────────────
  const start = useCallback(async () => {
    try {
      blobQueueRef.current = [] as {
        blob: Blob
        capturedAt: number
        capturedEndAt: number
        audioSamples?: Float32Array
      }[]
      processingRef.current = false
      contextRef.current.clear()
      speakerRef.current.reset()
      realtimeSeenItemIdsRef.current.clear()
      realtimeAcceptingRef.current = false
      realtimeDrainUntilRef.current = 0
      cancelRealtimeInFlight()
      startSession()
      setAppError(null)

      if (config.sttMode === 'openai-realtime') {
        // ─── Realtime 模式 ─────────────────────────────────────
        const openaiKey = useConfigStore.getState().getOpenAiKey()
        if (!openaiKey) {
          await startStandardEngine()
          setAppError('realtime_error', '未設定 OpenAI API Key，已自動切回標準模式')
        } else {
          try {
            const sessionId = realtimeSessionIdRef.current + 1
            realtimeSessionIdRef.current = sessionId
            realtimeAcceptingRef.current = true
            realtimeDrainUntilRef.current = 0

            const engine = new RealtimeWebRTCEngine()
            await engine.init({
              apiKey: openaiKey,
              model: config.realtimeModel,
              silenceDurationMs: getModeAdjustedVad().silenceMs,
              language: config.sttLanguageHint === 'auto' ? undefined : config.sttLanguageHint,
              onTranscript: (text, startedAt, endedAt, itemId) => {
                void processRealtimeTranscript(sessionId, text, startedAt, endedAt, itemId)
              },
              onError: (err) => {
                setAppError('realtime_error', err.message)
                console.error('[RealtimeWebRTCEngine]', err)
              },
              onStateChange: (state) => {
                if (state === 'closed') {
                  realtimeAcceptingRef.current = false
                  realtimeDrainUntilRef.current = 0
                  setRecordingState('stopping')
                }
              },
            })
            engine.start()
            realtimeEngineRef.current = engine
          } catch (err) {
            const detail = err instanceof Error ? err.message : String(err)
            console.error('[RealtimeWebRTCEngine] fallback to standard mode:', detail)
            realtimeAcceptingRef.current = false
            realtimeDrainUntilRef.current = 0
            await startStandardEngine()
            setAppError('realtime_error', `${detail}；已自動切回標準模式`)
          }
        }
      } else {
        // ─── Standard 模式（Whisper REST）───────────────────────
        await startStandardEngine()
      }

      setRecordingState('recording')
    } catch (err) {
      const isPermission =
        err instanceof DOMException && err.name === 'NotAllowedError'
      const detail = err instanceof Error ? err.message : String(err)
      if (isPermission) {
        setAppError('mic_denied')
      } else if (config.sttMode === 'openai-realtime') {
        setAppError('realtime_error', detail)
      } else {
        setAppError('groq_server_error')
      }
    }
  }, [cancelRealtimeInFlight, config, getModeAdjustedVad, processRealtimeTranscript, setAppError, setRecordingState, startSession, startStandardEngine])

  const pause = useCallback(() => {
    engineRef.current?.pause()
    if (realtimeEngineRef.current) {
      realtimeAcceptingRef.current = false
      realtimeDrainUntilRef.current = Date.now() + 1500
      realtimeEngineRef.current.pause()
    }
    setRecordingState('paused')
  }, [setRecordingState])

  const resume = useCallback(() => {
    engineRef.current?.resume()
    realtimeEngineRef.current?.resume()
    if (realtimeEngineRef.current) {
      realtimeAcceptingRef.current = true
      realtimeDrainUntilRef.current = 0
    }
    setRecordingState('recording')
  }, [setRecordingState])

  const stop = useCallback(async () => {
    const standardEngine = engineRef.current
    const realtimeEngine = realtimeEngineRef.current

    if (standardEngine) {
      standardEngine.pause()
    }
    if (realtimeEngine) {
      realtimeAcceptingRef.current = false
      realtimeDrainUntilRef.current = Date.now() + 1500
      realtimeEngine.pause()
    }

    await waitForProcessingDrain(10_000)

    realtimeDrainUntilRef.current = 0
    realtimeAcceptingRef.current = false
    realtimeSessionIdRef.current += 1
    realtimeSeenItemIdsRef.current.clear()
    cancelRealtimeInFlight()
    standardEngine?.destroy()
    realtimeEngine?.destroy()
    engineRef.current = null
    realtimeEngineRef.current = null
    setRecordingState('stopping')
  }, [cancelRealtimeInFlight, setRecordingState, waitForProcessingDrain])

  return { start, pause, resume, stop, getExportSession }
}
