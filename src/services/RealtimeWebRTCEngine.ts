import { OPENAI_API_BASE } from '../utils/constants'
import type { RealtimeEngineOptions } from './RealtimeEngine'

interface RealtimeEvent {
  type: string
  transcript?: string
  item_id?: string
  error?: {
    message?: string
    param?: string
    code?: string
    type?: string
  }
}

export class RealtimeWebRTCEngine {
  private peerConnection: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null
  private mediaStream: MediaStream | null = null
  private options: RealtimeEngineOptions | null = null
  private speechStartedAt = 0
  private speechEndedAt = 0
  private isStreaming = false
  private isDestroyed = false
  private didEmitReady = false
  private lastSessionUpdatePayload: string | null = null
  private requiresManualCommit = false
  private commitIntervalId: number | null = null
  private turnTimesByItemId = new Map<string, { startedAt: number; endedAt: number }>()
  private pendingTurnQueue: Array<{ startedAt: number; endedAt: number }> = []

  async init(options: RealtimeEngineOptions): Promise<void> {
    if (!options.apiKey) throw new Error('OpenAI API Key is required')
    this.options = options
    await this.connect()
  }

  start(): void {
    this.isStreaming = true
    this.setTracksEnabled(true)
    this.startManualCommitLoop()
  }

  pause(): void {
    const wasStreaming = this.isStreaming
    this.isStreaming = false
    this.setTracksEnabled(false)
    if (wasStreaming && this.requiresManualCommit) {
      this.sendCommitEvent()
      this.sendClearEvent()
    }
    this.stopManualCommitLoop()
  }

  resume(): void {
    this.start()
  }

  stop(): void {
    this.pause()
  }

  destroy(): void {
    if (this.isDestroyed) return
    this.isDestroyed = true

    this.pause()
    this.stopManualCommitLoop()

    if (this.dataChannel && this.dataChannel.readyState !== 'closed') {
      this.dataChannel.close()
    }
    this.dataChannel = null

    if (this.peerConnection) {
      this.peerConnection.close()
    }
    this.peerConnection = null

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop())
    }
    this.mediaStream = null
    this.turnTimesByItemId.clear()
    this.pendingTurnQueue = []

    this.options?.onStateChange('closed')
  }

  private async connect(): Promise<void> {
    const { model } = this.options!

    this.options?.onStateChange('connecting')

    const ephemeralKey = await this.fetchEphemeralToken(model)

    this.peerConnection = new RTCPeerConnection()
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        this.options?.onStateChange('closed')
      }
    }

    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    this.mediaStream.getAudioTracks().forEach((track) => {
      track.enabled = false
      this.peerConnection?.addTrack(track, this.mediaStream as MediaStream)
    })

    this.dataChannel = this.peerConnection.createDataChannel('oai-events')
    this.dataChannel.onmessage = (event: MessageEvent) => {
      const data = typeof event.data === 'string' ? event.data : String(event.data)
      this.handleMessage(data)
    }
    this.dataChannel.onerror = () => {
      this.options?.onError(new Error('RealtimeWebRTCEngine data channel error'))
    }
    this.dataChannel.onclose = () => {
      if (!this.isDestroyed) {
        this.options?.onStateChange('closed')
      }
    }

    const offer = await this.peerConnection.createOffer()
    await this.peerConnection.setLocalDescription(offer)

    if (!offer.sdp) {
      throw new Error('Failed to create WebRTC offer SDP')
    }

    const sdpResponse = await fetch(`${OPENAI_API_BASE}/realtime/calls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp,
    })

    const answerSdp = await sdpResponse.text()
    if (!sdpResponse.ok) {
      throw new Error(`OpenAI realtime/calls failed: ${answerSdp || `HTTP ${sdpResponse.status}`}`)
    }

    await this.peerConnection.setRemoteDescription({
      type: 'answer',
      sdp: answerSdp,
    })

    await new Promise<void>((resolve, reject) => {
      const channel = this.dataChannel
      if (!channel) {
        reject(new Error('RealtimeWebRTCEngine data channel not created'))
        return
      }

      const timeout = window.setTimeout(() => {
        reject(new Error('RealtimeWebRTCEngine data channel open timeout'))
      }, 10_000)

      const onOpen = () => {
        window.clearTimeout(timeout)
        this.emitReadyOnce()
        resolve()
      }

      if (channel.readyState === 'open') {
        onOpen()
        return
      }

      channel.onopen = () => {
        onOpen()
      }
    })
  }

  private emitReadyOnce(): void {
    if (this.didEmitReady) return
    this.didEmitReady = true
    this.sendSessionConfig()
    this.options?.onStateChange('ready')
  }

  private setTracksEnabled(enabled: boolean): void {
    if (!this.mediaStream) return
    this.mediaStream.getAudioTracks().forEach((track) => {
      track.enabled = enabled
    })
  }

  private async fetchEphemeralToken(model: string): Promise<string> {
    const res = await fetch('/realtime-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: this.options!.apiKey, model }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } | string }
      const errMsg =
        typeof body.error === 'object'
          ? (body.error?.message ?? JSON.stringify(body.error))
          : (body.error ?? `HTTP ${res.status}`)
      throw new Error(`Failed to get realtime token: ${errMsg}`)
    }

    const data = await res.json() as { value?: string; client_secret?: { value?: string } }
    const token = data.value ?? data.client_secret?.value
    if (!token) throw new Error('Realtime token response format is invalid')
    return token
  }

  private sendSessionConfig(): void {
    if (!this.dataChannel || !this.options) return
    if (this.dataChannel.readyState !== 'open') return

    const { silenceDurationMs = 500, language = 'en', model } = this.options
    const turnDetection = model === 'gpt-realtime-whisper'
      ? null
      : {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: silenceDurationMs,
        }
    this.requiresManualCommit = turnDetection === null

    const sessionUpdate = {
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: {
          input: {
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
    console.debug('[RealtimeWebRTCEngine] session.update payload:', payload)
    this.dataChannel.send(payload)

    if (this.isStreaming) {
      this.startManualCommitLoop()
    }
  }

  private startManualCommitLoop(): void {
    if (!this.requiresManualCommit) return
    if (this.commitIntervalId !== null) return

    const intervalMs = Math.max(800, this.options?.silenceDurationMs ?? 1_200)
    this.commitIntervalId = window.setInterval(() => {
      if (!this.isStreaming) return
      this.sendCommitEvent()
    }, intervalMs)
  }

  private stopManualCommitLoop(): void {
    if (this.commitIntervalId === null) return
    window.clearInterval(this.commitIntervalId)
    this.commitIntervalId = null
  }

  private sendCommitEvent(): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') return
    this.dataChannel.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
  }

  private sendClearEvent(): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') return
    this.dataChannel.send(JSON.stringify({ type: 'input_audio_buffer.clear' }))
  }

  private handleMessage(raw: string): void {
    let event: RealtimeEvent
    try {
      event = JSON.parse(raw) as RealtimeEvent
    } catch {
      return
    }

    switch (event.type) {
      case 'input_audio_buffer.speech_started': {
        const startedAt = Date.now()
        this.speechStartedAt = startedAt
        if (event.item_id) {
          this.turnTimesByItemId.set(event.item_id, { startedAt, endedAt: startedAt })
        } else {
          this.pendingTurnQueue.push({ startedAt, endedAt: startedAt })
        }
        break
      }

      case 'input_audio_buffer.speech_stopped': {
        const endedAt = Date.now()
        this.speechEndedAt = endedAt
        if (event.item_id && this.turnTimesByItemId.has(event.item_id)) {
          const current = this.turnTimesByItemId.get(event.item_id)!
          this.turnTimesByItemId.set(event.item_id, {
            startedAt: current.startedAt,
            endedAt,
          })
        } else if (this.pendingTurnQueue.length > 0) {
          const last = this.pendingTurnQueue[this.pendingTurnQueue.length - 1]
          last.endedAt = endedAt
        }
        break
      }

      case 'conversation.item.input_audio_transcription.completed': {
        if (!this.isStreaming || this.isDestroyed) {
          break
        }

        const text = (event.transcript ?? '').trim()
        if (text) {
          const itemId = event.item_id
          let startedAt = this.speechStartedAt || Date.now()
          let endedAt = this.speechEndedAt || Date.now()

          if (itemId && this.turnTimesByItemId.has(itemId)) {
            const turn = this.turnTimesByItemId.get(itemId)!
            startedAt = turn.startedAt
            endedAt = turn.endedAt
            this.turnTimesByItemId.delete(itemId)
          } else if (this.pendingTurnQueue.length > 0) {
            const turn = this.pendingTurnQueue.shift()!
            startedAt = turn.startedAt
            endedAt = turn.endedAt
          }

          this.options?.onTranscript(text, startedAt, endedAt, itemId)
        }
        break
      }

      case 'error': {
        const errorMessage = (event.error?.message ?? '').toLowerCase()
        const errorCode = (event.error?.code ?? '').toLowerCase()
        if (
          errorMessage.includes('input audio buffer is empty')
          || errorMessage.includes('buffer too small')
          || errorCode === 'input_audio_buffer_commit_empty'
        ) {
          // manual commit 或 pause commit 期間可能觸發空 buffer/過小 buffer，忽略即可
          break
        }
        console.error('[RealtimeWebRTCEngine] error event:', event)
        if (this.lastSessionUpdatePayload) {
          console.error('[RealtimeWebRTCEngine] last session.update payload:', this.lastSessionUpdatePayload)
        }
        const detail = [
          event.error?.message ?? 'Realtime API unknown error',
          event.error?.param ? `param=${event.error.param}` : '',
          event.error?.code ? `code=${event.error.code}` : '',
        ].filter(Boolean).join(' | ')
        this.options?.onError(new Error(detail))
        break
      }

      default:
        break
    }
  }
}
