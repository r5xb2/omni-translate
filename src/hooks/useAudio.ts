import { useCallback, useRef } from 'react'
import { AudioEngine } from '../services/AudioEngine'
import { GroqService, RateLimitError, InvalidKeyError } from '../services/GroqService'
import { ContextManager } from '../services/ContextManager'
import { useAppStore } from '../store/AppStore'
import { useConfigStore } from '../store/ConfigStore'
import { Message } from '../types'

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
  const contextRef = useRef<ContextManager>(new ContextManager(5))

  // ─── 音訊作業佇列（防止並行呼叫 GROQ 造成亂序或 Rate Limit）──
  // capturedAt：VAD onSpeechStart 時間（段落開始）
  // capturedEndAt：VAD onSpeechEnd 時間（段落結束）
  // 兩者差値 = 語音段落實際持續時長
  const blobQueueRef = useRef<{ blob: Blob; capturedAt: number; capturedEndAt: number }[]>([])
  const processingRef = useRef(false)

  const { addMessage, updateMessage, setRecordingState, setAppError, startSession, getExportSession, addPending, removePending } =
    useAppStore()
  const { config, getProviderConfig } = useConfigStore()

  // ─── 處理單一 Blob（實際 STT + LLM 邏輯）─────────────────────
  const processSingleBlob = useCallback(
    async (blob: Blob, capturedAt: number, capturedEndAt: number) => {
      const { apiKey, apiBase } = getProviderConfig()
      const { sttModel, llmModel } = config.modelSettings

      // 使用 capturedAt/capturedEndAt 反映實際語音發生的時間範圍
      const msgId = addMessage({
        originalText: '',
        translatedText: '',
        status: 'transcribing',
      }, capturedAt, capturedEndAt)

      try {
        const transcript = await GroqService.transcribe(blob, apiKey, sttModel, apiBase)
        if (!transcript) {
          // Whisper 回傳空字串：真靜音或語音過短無法辨識，記錄但不算遺失
          updateMessage(msgId, { status: 'error', originalText: '(靜音或無法辨識)' })
          return
        }

        // 翻譯開關：關閉時僅顯示原文，跳過 LLM 呢叫
        if (!config.enableTranslation) {
          updateMessage(msgId, { originalText: transcript, translatedText: '', status: 'completed' })
          contextRef.current.add(
            useAppStore.getState().messages.find((m) => m.id === msgId) as Message
          )
          setAppError(null)
          return
        }

        updateMessage(msgId, { originalText: transcript, status: 'translating' })

        const messages = contextRef.current.buildMessages(transcript, config.systemPrompt)
        const translation = await GroqService.translate(messages, apiKey, llmModel, apiBase)

        const completedMsg: Partial<Message> = {
          originalText: transcript,
          translatedText: translation,
          status: 'completed',
        }
        updateMessage(msgId, completedMsg)

        const currentMsg = useAppStore.getState().messages.find((m) => m.id === msgId)
        if (currentMsg) {
          contextRef.current.add({ ...currentMsg, ...completedMsg } as Message)
        }

        setAppError(null)
      } catch (err) {
        if (err instanceof RateLimitError) {
          setAppError('rate_limit')
          updateMessage(msgId, { status: 'error', translatedText: '（Rate Limit，已自動重試）' })
        } else if (err instanceof InvalidKeyError) {
          setAppError('invalid_key')
          updateMessage(msgId, { status: 'error', translatedText: '（API Key 無效）' })
          engineRef.current?.destroy()
          engineRef.current = null
          setRecordingState('stopping')
        } else if (err instanceof TypeError && err.message.includes('fetch')) {
          setAppError('network_offline')
          updateMessage(msgId, { status: 'error', translatedText: '（網路中斷）' })
        } else {
          setAppError('groq_server_error')
          updateMessage(msgId, { status: 'error', translatedText: '（服務異常）' })
        }
      } finally {
        // 無論成功或失敗，必須移除一個 pending（確保計數器歸零）
        removePending()
      }
    },
    [addMessage, config, getProviderConfig, removePending, setAppError, setRecordingState, updateMessage],
  )

  // ─── 佇列入口：立即返回，讓 AudioEngine 繼續監聽麥克風 ────────
  const handleSpeechEnd = useCallback(
    (blob: Blob, speechStartedAt: number, speechEndedAt: number) => {
      // speechStartedAt / speechEndedAt 來自 AudioEngine，分別對應 onSpeechStart / onSpeechEnd 時刻
      // silenceGap = 下段 speechStartedAt - 上段 speechEndedAt（純靜音時長，不含語音本身）
      blobQueueRef.current.push({ blob, capturedAt: speechStartedAt, capturedEndAt: speechEndedAt })
      // addPending 必須在 push 之後立即執行，確保計數器不少算
      addPending()
      if (processingRef.current) return // 已有消耗者，直接返回

      processingRef.current = true
      void (async () => {
        while (blobQueueRef.current.length > 0) {
          const { blob: next, capturedAt, capturedEndAt: endAt } = blobQueueRef.current.shift()!
          await processSingleBlob(next, capturedAt, endAt)
        }
        processingRef.current = false
      })()
    },
    [processSingleBlob],
  )

  // ─── 控制介面 ──────────────────────────────────────────────
  const start = useCallback(async () => {
    try {
      const engine = new AudioEngine()
      await engine.init({
        onSpeechEnd: handleSpeechEnd,
        silenceMs: config.vadSilenceMs,
        maxDurationMs: config.vadMaxDurationMs,
      })
      engine.start()
      engineRef.current = engine
      blobQueueRef.current = [] as { blob: Blob; capturedAt: number; capturedEndAt: number }[]
      processingRef.current = false
      contextRef.current.clear()
      startSession()
      setRecordingState('recording')
      setAppError(null)
    } catch (err) {
      const isPermission =
        err instanceof DOMException && err.name === 'NotAllowedError'
      setAppError(isPermission ? 'mic_denied' : 'groq_server_error')
    }
  }, [config, handleSpeechEnd, setAppError, setRecordingState, startSession])

  const pause = useCallback(() => {
    engineRef.current?.pause()
    setRecordingState('paused')
  }, [setRecordingState])

  const resume = useCallback(() => {
    engineRef.current?.resume()
    setRecordingState('recording')
  }, [setRecordingState])

  const stop = useCallback(() => {
    engineRef.current?.destroy()
    engineRef.current = null
    setRecordingState('stopping')
  }, [setRecordingState])

  return { start, pause, resume, stop, getExportSession }
}
