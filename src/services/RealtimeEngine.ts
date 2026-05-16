import { OPENAI_REALTIME_BASE } from '../utils/constants'

// ─── 公開介面 ──────────────────────────────────────────────────

export interface RealtimeEngineOptions {
  apiKey: string
  model: string                // 'gpt-realtime-whisper' | 'gpt-4o-transcribe' | 'gpt-4o-mini-transcribe'
  language?: string            // 預設 'en'
  silenceDurationMs?: number   // 伺服器 VAD 靜音閾值，預設 500
  onTranscript: (text: string, startedAt: number, endedAt: number) => void
  onError: (error: Error) => void
  onStateChange: (state: 'connecting' | 'ready' | 'closed') => void
}

// ─── Realtime API 事件型別（僅列出本模組使用的子集）──────────

interface RealtimeEvent {
  type: string
  transcript?: string
  error?: {
    message?: string
    param?: string
    code?: string
    type?: string
  }
}

// ─── 目標取樣率（OpenAI Realtime API 規格）────────────────────
const TARGET_SAMPLE_RATE = 24_000
// ScriptProcessorNode 緩衝大小（2^11 = 2048 samples）
const BUFFER_SIZE = 2048

/**
 * RealtimeEngine
 * 封裝 OpenAI Realtime API（WebSocket）的即時語音辨識引擎。
 *
 * 架構：
 *   麥克風 → AudioContext → ScriptProcessorNode → PCM16 → WS → OpenAI
 *   OpenAI WS 事件 → onTranscript 回呼 → useAudio.processRealtimeTranscript
 *
 * 不使用 Silero VAD；改由伺服器端 VAD 偵測語音活動。
 * 翻譯管道由 useAudio Hook 負責，本模組只負責取得 transcript。
 */
export class RealtimeEngine {
  private ws: WebSocket | null = null
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private scriptProcessor: ScriptProcessorNode | null = null
  private options: RealtimeEngineOptions | null = null
  private speechStartedAt: number = 0
  private speechEndedAt: number = 0
  private isStreaming: boolean = false
  private lastSessionUpdatePayload: string | null = null

  // ─── 公開介面 ────────────────────────────────────────────────

  /**
   * 初始化：建立 WebSocket 連線 + 設定 Session
   * @throws 若 API Key 為空或 WebSocket 連線失敗
   */
  async init(options: RealtimeEngineOptions): Promise<void> {
    if (!options.apiKey) throw new Error('OpenAI API Key 不可為空')
    this.options = options
    await this.connectWebSocket()
  }

  /** 開始串流麥克風音訊至 WebSocket */
  start(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.options?.onError(new Error('WebSocket 尚未就緒'))
      return
    }
    this.setupAudioCapture().catch((err) => this.options?.onError(err))
  }

  /** 停止音訊串流（保持 WebSocket 連線） */
  stop(): void {
    this.isStreaming = false
    this.scriptProcessor?.disconnect()
    this.scriptProcessor = null
    this.mediaStream?.getTracks().forEach((t) => t.stop())
    this.mediaStream = null
    this.audioContext?.close()
    this.audioContext = null
  }

  /** 完整清理：停止串流 + 關閉 WebSocket */
  destroy(): void {
    this.stop()
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close()
    }
    this.ws = null
    this.options?.onStateChange('closed')
  }

  // ─── 私有方法 ────────────────────────────────────────────────

  private async connectWebSocket(): Promise<void> {
    const { model } = this.options!
    const url = OPENAI_REALTIME_BASE

    this.options?.onStateChange('connecting')

    // 透過 Vite dev server 的 /realtime-token middleware 取得 ephemeral token
    // （server-side 呼叫 OpenAI，無 CORS 問題，也不需要另啟 Fastify server）
    const ephemeralKey = await this.fetchEphemeralToken(model)

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url, [
        'realtime',
        `openai-insecure-api-key.${ephemeralKey}`,
      ])

      this.ws.onopen = () => {
        this.sendSessionConfig()
        this.options?.onStateChange('ready')
        resolve()
      }

      this.ws.onerror = (event) => {
        console.error('[RealtimeEngine] WebSocket onerror:', event)
        const err = new Error('RealtimeEngine: WebSocket 連線失敗')
        this.options?.onError(err)
        reject(err)
      }

      this.ws.onclose = (event?: CloseEvent) => {
        console.warn(
          `[RealtimeEngine] WebSocket closed — code=${event?.code ?? 'unknown'}, reason="${event?.reason ?? ''}", wasClean=${event?.wasClean ?? false}`,
        )
        this.options?.onStateChange('closed')
      }

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data as string)
      }
    })
  }

  /**
   * 向 Vite dev server 的 /realtime-token 端點取得 OpenAI ephemeral token
   * Vite middleware 在 server-side 呼叫 OpenAI，避免 CORS 問題
   */
  private async fetchEphemeralToken(model: string): Promise<string> {
    const res = await fetch('/realtime-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: this.options!.apiKey, model }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } | string }
      // OpenAI 錯誤格式：{ error: { message: "..." } }，或後端自定義 { error: "..." }
      const errMsg =
        typeof body.error === 'object'
          ? (body.error?.message ?? JSON.stringify(body.error))
          : (body.error ?? `HTTP ${res.status}`)
      throw new Error(`取得 Realtime token 失敗：${errMsg}`)
    }
    const data = await res.json() as { value?: string; client_secret?: { value?: string } }
    // 新版 /v1/realtime/client_secrets 回傳 { value, expires_at, session }
    // 舊版 /v1/realtime/transcription_sessions 回傳 { client_secret: { value } }
    const token = data.value ?? data.client_secret?.value
    if (!token) throw new Error('Server 回傳的 Realtime token 格式不正確')
    return token
  }

  /** 送出轉寫 session 設定（transcription_session.update） */
  private sendSessionConfig(): void {
    if (!this.ws || !this.options) return
    const { silenceDurationMs = 500, language = 'en', model } = this.options

    // gpt-realtime-whisper 不支援 VAD，must be null（OpenAI 文件明確規定）
    // gpt-4o-transcribe / gpt-4o-mini-transcribe 支援 server_vad
    const turnDetection = model === 'gpt-realtime-whisper'
      ? null
      : {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: silenceDurationMs,
        }

    const sessionUpdate = {
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: {
              type: 'audio/pcm',
              rate: TARGET_SAMPLE_RATE,
            },
            transcription: {
              model,
              language,
            },
            turn_detection: turnDetection,
          },
        },
      },
    }
    const payload = JSON.stringify(sessionUpdate)
    this.lastSessionUpdatePayload = payload
    console.debug('[RealtimeEngine] session.update payload:', payload)
    this.ws.send(payload)
  }

  /** 取得麥克風 Stream 並設定 ScriptProcessorNode 進行音訊採集 */
  private async setupAudioCapture(): Promise<void> {
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    this.audioContext = new AudioContext()
    const srcSampleRate = this.audioContext.sampleRate

    const source = this.audioContext.createMediaStreamSource(this.mediaStream)
    this.scriptProcessor = this.audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1)

    this.scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
      if (!this.isStreaming) return
      const float32 = event.inputBuffer.getChannelData(0)
      const resampled = this.resampleTo24kHz(float32, srcSampleRate)
      this.sendPcm16Chunk(resampled)
    }

    source.connect(this.scriptProcessor)
    this.scriptProcessor.connect(this.audioContext.destination)
    this.isStreaming = true
  }

  /**
   * 線性插值降頻：將任意取樣率的 Float32Array 降至 24kHz
   * 純 JS 實作，無外部依賴
   */
  resampleTo24kHz(input: Float32Array, srcRate: number): Float32Array {
    if (srcRate === TARGET_SAMPLE_RATE) return input
    const ratio = srcRate / TARGET_SAMPLE_RATE
    const outputLength = Math.round(input.length / ratio)
    const output = new Float32Array(outputLength)
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio
      const lo = Math.floor(srcIndex)
      const hi = Math.min(lo + 1, input.length - 1)
      const frac = srcIndex - lo
      output[i] = input[lo] * (1 - frac) + input[hi] * frac
    }
    return output
  }

  /**
   * Float32 → PCM16 → Base64，透過 WS 送出 input_audio_buffer.append
   */
  private sendPcm16Chunk(float32: Float32Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    const pcm16 = new Int16Array(float32.length)
    for (let i = 0; i < float32.length; i++) {
      const clamped = Math.max(-1, Math.min(1, float32[i]))
      pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
    }

    // ArrayBuffer → Base64
    const bytes = new Uint8Array(pcm16.buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    const base64 = btoa(binary)

    this.ws.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: base64,
    }))
  }

  /** 處理 WebSocket 收到的事件 */
  private handleMessage(raw: string): void {
    let event: RealtimeEvent
    try {
      event = JSON.parse(raw) as RealtimeEvent
    } catch {
      return
    }

    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        this.speechStartedAt = Date.now()
        break

      case 'input_audio_buffer.speech_stopped':
        this.speechEndedAt = Date.now()
        break

      case 'conversation.item.input_audio_transcription.completed': {
        const text = (event.transcript ?? '').trim()
        if (text) {
          this.options?.onTranscript(text, this.speechStartedAt, this.speechEndedAt)
        }
        break
      }

      case 'error':
        console.error('[RealtimeEngine] error event:', event)
        if (this.lastSessionUpdatePayload) {
          console.error('[RealtimeEngine] last session.update payload:', this.lastSessionUpdatePayload)
        }
        this.options?.onError(new Error([
          event.error?.message ?? 'Realtime API 發生未知錯誤',
          event.error?.param ? `param=${event.error.param}` : '',
          event.error?.code ? `code=${event.error.code}` : '',
        ].filter(Boolean).join(' | ')))
        break

      default:
        break
    }
  }
}
