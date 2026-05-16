import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RealtimeEngine } from '../../src/services/RealtimeEngine'

// Legacy coverage: 主執行路徑已改由 RealtimeWebRTCEngine，
// 此檔保留 RealtimeEngine 的回歸測試，避免後續整理前出現無聲退化。

// ─── Mock WebSocket ────────────────────────────────────────────
class MockWebSocket {
  static OPEN = 1
  static CLOSED = 3

  readyState = MockWebSocket.OPEN
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null

  sent: string[] = []
  protocols: string[]

  constructor(_url: string, protocols?: string[]) {
    this.protocols = protocols ?? []
    // 模擬非同步 onopen
    Promise.resolve().then(() => this.onopen?.())
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }

  /** 測試輔助：模擬伺服器送出事件 */
  simulateMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }
}

// ─── Mock navigator.mediaDevices ──────────────────────────────
const mockGetUserMedia = vi.fn().mockResolvedValue({
  getTracks: () => [{ stop: vi.fn() }],
} as unknown as MediaStream)

// ─── 測試套件 ──────────────────────────────────────────────────

describe('RealtimeEngine (legacy)', () => {
  let engine: RealtimeEngine
  let mockWs: MockWebSocket

  beforeEach(() => {
    // Mock fetch：模擬本地 server 回傳 ephemeral token
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ client_secret: { value: 'ek_test_ephemeral' } }),
    }))

    // 注入 Mock WebSocket（含靜態常數，使 RealtimeEngine 的 WebSocket.OPEN 判斷正常）
    const WsStub = Object.assign(
      function (url: string, protocols?: string[]) {
        mockWs = new MockWebSocket(url, protocols)
        return mockWs
      },
      { OPEN: 1, CLOSED: 3, CONNECTING: 0, CLOSING: 2 },
    )
    vi.stubGlobal('WebSocket', WsStub)

    // 注入 Mock getUserMedia
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: mockGetUserMedia },
    })

    engine = new RealtimeEngine()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // UT-RT-001
  it('收到 speech_started 事件時記錄 speechStartedAt 且不為 0', async () => {
    const onTranscript = vi.fn()
    await engine.init({
      apiKey: 'sk-test',
      model: 'gpt-4o-transcribe',
      onTranscript,
      onError: vi.fn(),
      onStateChange: vi.fn(),
    })

    const before = Date.now()
    mockWs.simulateMessage({ type: 'input_audio_buffer.speech_started' })
    const after = Date.now()

    // 發送 transcription.completed 以確認 startedAt 已記錄
    mockWs.simulateMessage({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'Hello world',
    })

    expect(onTranscript).toHaveBeenCalledOnce()
    const [, startedAt] = onTranscript.mock.calls[0] as [string, number, number]
    expect(startedAt).toBeGreaterThanOrEqual(before)
    expect(startedAt).toBeLessThanOrEqual(after)
  })

  // UT-RT-002
  it('收到 transcription.completed 後觸發 onTranscript，帶有正確 text', async () => {
    const onTranscript = vi.fn()
    await engine.init({
      apiKey: 'sk-test',
      model: 'gpt-4o-transcribe',
      onTranscript,
      onError: vi.fn(),
      onStateChange: vi.fn(),
    })

    mockWs.simulateMessage({ type: 'input_audio_buffer.speech_started' })
    mockWs.simulateMessage({ type: 'input_audio_buffer.speech_stopped' })
    mockWs.simulateMessage({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: '  NVMe controller test  ',
    })

    expect(onTranscript).toHaveBeenCalledOnce()
    expect(onTranscript.mock.calls[0][0]).toBe('NVMe controller test')
  })

  // UT-RT-002b
  it('transcript 為空白字串時不觸發 onTranscript', async () => {
    const onTranscript = vi.fn()
    await engine.init({
      apiKey: 'sk-test',
      model: 'gpt-4o-transcribe',
      onTranscript,
      onError: vi.fn(),
      onStateChange: vi.fn(),
    })

    mockWs.simulateMessage({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: '   ',
    })

    expect(onTranscript).not.toHaveBeenCalled()
  })

  // UT-RT-003
  it('destroy() 後 WebSocket readyState 為 CLOSED', async () => {
    await engine.init({
      apiKey: 'sk-test',
      model: 'gpt-4o-transcribe',
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onStateChange: vi.fn(),
    })

    engine.destroy()
    expect(mockWs.readyState).toBe(MockWebSocket.CLOSED)
  })

  // UT-RT-004
  it('resampleTo24kHz：輸出長度 = round(inputLength / ratio)', () => {
    const srcRate = 48_000
    const input = new Float32Array(4800)  // 0.1 秒 @ 48kHz
    const output = engine.resampleTo24kHz(input, srcRate)
    const expectedLength = Math.round(4800 / (48_000 / 24_000))  // 2400
    expect(output.length).toBe(expectedLength)
  })

  // UT-RT-004b
  it('resampleTo24kHz：來源已是 24kHz 時直接返回原陣列', () => {
    const input = new Float32Array(1000)
    const output = engine.resampleTo24kHz(input, 24_000)
    expect(output).toBe(input)
  })

  // UT-RT-005
  it('init() 送出的 session.update 使用 GA 轉寫格式（session.type = transcription）', async () => {
    await engine.init({
      apiKey: 'sk-test',
      model: 'gpt-realtime-whisper',
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onStateChange: vi.fn(),
    })

    const sessionMsg = mockWs.sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .find((m) => m['type'] === 'session.update')

    expect(sessionMsg).toBeDefined()
    const session = sessionMsg?.['session'] as Record<string, unknown>
    // GA 格式必須有 type: 'transcription'
    expect(session?.['type']).toBe('transcription')
    // GA 格式：音訊設定在 audio.input 內（不再有平層 input_audio_transcription）
    const audio = session?.['audio'] as Record<string, unknown>
    const input = audio?.['input'] as Record<string, unknown>
    expect(input?.['transcription']).toBeDefined()
    expect(input?.['turn_detection']).toBeDefined()
    // GA 轉寫 session 不有 create_response 欄位
    expect((session as Record<string, unknown>)?.['turn_detection']).toBeUndefined()
  })

  // UT-RT-006
  it('error 事件觸發 onError 回呼', async () => {
    const onError = vi.fn()
    await engine.init({
      apiKey: 'sk-test',
      model: 'gpt-4o-transcribe',
      onTranscript: vi.fn(),
      onError,
      onStateChange: vi.fn(),
    })

    mockWs.simulateMessage({
      type: 'error',
      error: { message: 'Authentication failed' },
    })

    expect(onError).toHaveBeenCalledOnce()
    expect((onError.mock.calls[0][0] as Error).message).toContain('Authentication failed')
  })
})
