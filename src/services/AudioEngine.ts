import { MicVAD } from '@ricky0123/vad-web'

interface AudioEngineOptions {
  onSpeechEnd: (blob: Blob, speechStartedAt: number, speechEndedAt: number) => void
  silenceMs?: number
  maxDurationMs?: number
}

/**
 * AudioEngine v1.1
 * - 使用 @ricky0123/vad-web（Silero VAD，ONNX Runtime）
 * - 實作 30 秒強制切分（PRD Business Rule FR-004）
 */
export class AudioEngine {
  private vad: MicVAD | null = null
  private forceSliceTimer: ReturnType<typeof setTimeout> | null = null
  private onSpeechEnd: (blob: Blob, speechStartedAt: number, speechEndedAt: number) => void = () => {}
  private maxDurationMs: number = 30_000
  private speechStartedAt: number = 0

  async init(options: AudioEngineOptions): Promise<void> {
    this.onSpeechEnd = options.onSpeechEnd
    this.maxDurationMs = options.maxDurationMs ?? 30_000

    this.vad = await MicVAD.new({
      // 明確指向 node_modules 靜態資源路徑（Vite 預先打包後路徑修正）
      baseAssetPath: '/node_modules/@ricky0123/vad-web/dist/',
      onnxWASMBasePath: '/node_modules/onnxruntime-web/dist/',

      // ─── VAD 靈敏度（針對連續語音最佳化）─────────────────────
      // Silero 官方建議：positve 與 negative 差距約 0.15
      positiveSpeechThreshold: 0.5,   // 更敏感（原 0.8 太嚴格）
      negativeSpeechThreshold: 0.35,  // 官方建議 = positive - 0.15
      redemptionMs: options.silenceMs ?? 500, // 直接使用設定值

      // 捕捉說話前 300ms 的音訊前置緩衝
      preSpeechPadMs: 300,
      // 最短有效語音長度，過濾噪音
      minSpeechMs: 300,
      // ★ 關鍵：暫停時提交當前語音段落（讓強制切分 timer 生效）
      submitUserSpeechOnPause: true,

      onSpeechStart: () => {
        this.speechStartedAt = Date.now()
        this.startForceSliceTimer()
      },

      onSpeechEnd: (audio: Float32Array) => {
        this.clearForceSliceTimer()
        const blob = this.float32ToWavBlob(audio)
        const speechEndedAt = Date.now()
        this.onSpeechEnd(blob, this.speechStartedAt, speechEndedAt)
      },
    })
  }

  start(): void {
    this.vad?.start()
  }

  pause(): void {
    this.clearForceSliceTimer()
    this.vad?.pause()
  }

  resume(): void {
    this.vad?.start()
  }

  destroy(): void {
    this.clearForceSliceTimer()
    this.vad?.destroy()
    this.vad = null
  }

  private startForceSliceTimer(): void {
    this.clearForceSliceTimer()
    this.forceSliceTimer = setTimeout(() => {
      // submitUserSpeechOnPause: true 確保 pause() 會觸發 onSpeechEnd
      // 強制切分目前段落後立即重啟錄音
      void this.vad?.pause().then(() => this.vad?.start())
    }, this.maxDurationMs)
  }

  private clearForceSliceTimer(): void {
    if (this.forceSliceTimer !== null) {
      clearTimeout(this.forceSliceTimer)
      this.forceSliceTimer = null
    }
  }

  /**
   * Silero VAD 回傳 Float32Array（16kHz 單聲道）
   * 轉換為 WAV Blob 供 Whisper API 使用
   */
  private float32ToWavBlob(samples: Float32Array): Blob {
    const sampleRate = 16000
    const numChannels = 1
    const bitsPerSample = 16
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
    const blockAlign = (numChannels * bitsPerSample) / 8
    const dataSize = samples.length * 2
    const buffer = new ArrayBuffer(44 + dataSize)
    const view = new DataView(buffer)

    // WAV 標頭
    const write = (offset: number, str: string) =>
      str.split('').forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
    write(0, 'RIFF')
    view.setUint32(4, 36 + dataSize, true)
    write(8, 'WAVE')
    write(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, byteRate, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, bitsPerSample, true)
    write(36, 'data')
    view.setUint32(40, dataSize, true)

    // PCM 資料
    let offset = 44
    for (const sample of samples) {
      view.setInt16(offset, Math.max(-1, Math.min(1, sample)) * 0x7fff, true)
      offset += 2
    }

    return new Blob([buffer], { type: 'audio/wav' })
  }
}
