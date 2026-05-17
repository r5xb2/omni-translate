import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RealtimeWebRTCEngine } from '../../src/services/RealtimeWebRTCEngine'

class MockRTCDataChannel {
  readyState: RTCDataChannelState = 'open'
  sent: string[] = []
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = 'closed'
    this.onclose?.()
  }

  simulateMessage(payload: object) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent)
  }
}

class MockRTCPeerConnection {
  connectionState: RTCPeerConnectionState = 'connected'
  onconnectionstatechange: (() => void) | null = null
  dataChannel = new MockRTCDataChannel()

  addTrack = vi.fn()
  createDataChannel = vi.fn(() => this.dataChannel)
  createOffer = vi.fn(async () => ({ type: 'offer' as const, sdp: 'v=0\no=- test-offer' }))
  setLocalDescription = vi.fn(async () => undefined)
  setRemoteDescription = vi.fn(async () => undefined)
  close = vi.fn()
}

describe('RealtimeWebRTCEngine', () => {
  let engine: RealtimeWebRTCEngine
  let pc: MockRTCPeerConnection
  let track: { enabled: boolean; stop: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    engine = new RealtimeWebRTCEngine()
    track = { enabled: false, stop: vi.fn() }

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: 'ek_test_ephemeral' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'v=0\no=- test-answer',
      }))

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({
          getAudioTracks: () => [track],
          getTracks: () => [track],
        })),
      },
    })

    pc = new MockRTCPeerConnection()
    const rtcCtor = vi.fn(() => pc)
    vi.stubGlobal('RTCPeerConnection', rtcCtor)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('init 會送出 session.update 並回報 ready 狀態', async () => {
    const onStateChange = vi.fn()

    await engine.init({
      apiKey: 'sk-test',
      model: 'gpt-4o-transcribe',
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onStateChange,
    })

    expect(onStateChange).toHaveBeenCalledWith('connecting')
    expect(onStateChange).toHaveBeenCalledWith('ready')

    const sessionUpdate = pc.dataChannel.sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .find((m) => m.type === 'session.update')

    expect(sessionUpdate).toBeDefined()
    const session = sessionUpdate?.session as Record<string, unknown>
    expect(session?.type).toBe('transcription')
  })

  it('收到 transcription.completed 事件會觸發 onTranscript', async () => {
    const onTranscript = vi.fn()

    await engine.init({
      apiKey: 'sk-test',
      model: 'gpt-4o-transcribe',
      onTranscript,
      onError: vi.fn(),
      onStateChange: vi.fn(),
    })

    engine.start()

    pc.dataChannel.simulateMessage({ type: 'input_audio_buffer.speech_started', item_id: 'item_123' })
    pc.dataChannel.simulateMessage({ type: 'input_audio_buffer.speech_stopped', item_id: 'item_123' })
    pc.dataChannel.simulateMessage({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item_123',
      transcript: '  hello nvme  ',
    })

    expect(onTranscript).toHaveBeenCalledOnce()
    expect(onTranscript.mock.calls[0][0]).toBe('hello nvme')
    expect(onTranscript.mock.calls[0][3]).toBe('item_123')
  })

  it('pause 後會忽略晚到的 transcription.completed 事件', async () => {
    const onTranscript = vi.fn()

    await engine.init({
      apiKey: 'sk-test',
      model: 'gpt-4o-transcribe',
      onTranscript,
      onError: vi.fn(),
      onStateChange: vi.fn(),
    })

    engine.start()
    engine.pause()

    pc.dataChannel.simulateMessage({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item_pause_late',
      transcript: 'late transcript',
    })

    expect(onTranscript).not.toHaveBeenCalled()
  })

  it('pause 會在串流中送出 input_audio_buffer.commit', async () => {
    await engine.init({
      apiKey: 'sk-test',
      model: 'gpt-realtime-whisper',
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onStateChange: vi.fn(),
    })

    engine.start()
    engine.pause()

    const commitSent = pc.dataChannel.sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .some((m) => m.type === 'input_audio_buffer.commit')

    expect(commitSent).toBe(true)
    expect(track.enabled).toBe(false)
  })

  it('server_vad 模型 pause 不會送出 input_audio_buffer.commit', async () => {
    await engine.init({
      apiKey: 'sk-test',
      model: 'gpt-4o-transcribe',
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onStateChange: vi.fn(),
    })

    engine.start()
    engine.pause()

    const commitSent = pc.dataChannel.sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .some((m) => m.type === 'input_audio_buffer.commit')

    expect(commitSent).toBe(false)
  })

  it('empty buffer 錯誤會被忽略，不觸發 onError', async () => {
    const onError = vi.fn()

    await engine.init({
      apiKey: 'sk-test',
      model: 'gpt-4o-transcribe',
      onTranscript: vi.fn(),
      onError,
      onStateChange: vi.fn(),
    })

    pc.dataChannel.simulateMessage({
      type: 'error',
      error: { message: 'input audio buffer is empty' },
    })

    expect(onError).not.toHaveBeenCalled()
  })

  it('buffer too small 錯誤會被忽略，不觸發 onError', async () => {
    const onError = vi.fn()

    await engine.init({
      apiKey: 'sk-test',
      model: 'gpt-4o-transcribe',
      onTranscript: vi.fn(),
      onError,
      onStateChange: vi.fn(),
    })

    pc.dataChannel.simulateMessage({
      type: 'error',
      error: {
        message: 'Error committing input audio buffer: buffer too small',
        code: 'input_audio_buffer_commit_empty',
      },
    })

    expect(onError).not.toHaveBeenCalled()
  })

  it('destroy 會關閉 data channel / pc 並釋放 track', async () => {
    await engine.init({
      apiKey: 'sk-test',
      model: 'gpt-4o-transcribe',
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onStateChange: vi.fn(),
    })

    engine.destroy()

    expect(pc.close).toHaveBeenCalledOnce()
    expect(track.stop).toHaveBeenCalledOnce()
    expect(pc.dataChannel.readyState).toBe('closed')
  })
})
