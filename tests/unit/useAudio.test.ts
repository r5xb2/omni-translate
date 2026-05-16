import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const mocks = vi.hoisted(() => {
  const audioInit = vi.fn(async () => undefined)
  const audioStart = vi.fn()
  const audioPause = vi.fn()
  const audioResume = vi.fn()
  const audioDestroy = vi.fn()

  const rtcInit = vi.fn(async () => undefined)
  const rtcStart = vi.fn()
  const rtcPause = vi.fn()
  const rtcResume = vi.fn()
  const rtcDestroy = vi.fn()

  const appStore = {
    addMessage: vi.fn(),
    updateMessage: vi.fn(),
    setRecordingState: vi.fn(),
    setAppError: vi.fn(),
    startSession: vi.fn(),
    getExportSession: vi.fn(),
    addPending: vi.fn(),
    removePending: vi.fn(),
  }

  const configState = {
    getOpenAiKey: vi.fn(),
  }

  const configHookValue = {
    config: {
      provider: 'groq',
      modelSettings: { sttModel: 'whisper-large-v3-turbo', llmModel: 'llama-3.3-70b-versatile' },
      sttPrompt: '',
      enableTranslation: true,
      systemPrompt: 'prompt',
      rollingContextSize: 5,
      vadSilenceMs: 500,
      vadMaxDurationMs: 20_000,
      sttMode: 'standard' as const,
      realtimeModel: 'gpt-realtime-whisper',
    },
    getProviderConfig: vi.fn(() => ({ apiKey: 'gsk_test', apiBase: 'https://api.groq.com/openai/v1' })),
  }

  const useAppStore = Object.assign(
    vi.fn(() => appStore),
    { getState: vi.fn(() => ({ messages: [] })) },
  )

  const useConfigStore = Object.assign(
    vi.fn(() => configHookValue),
    { getState: vi.fn(() => configState) },
  )

  return {
    audioInit,
    audioStart,
    audioPause,
    audioResume,
    audioDestroy,
    rtcInit,
    rtcStart,
    rtcPause,
    rtcResume,
    rtcDestroy,
    appStore,
    configState,
    configHookValue,
    useAppStore,
    useConfigStore,
  }
})

vi.mock('../../src/services/AudioEngine', () => ({
  AudioEngine: vi.fn().mockImplementation(() => ({
    init: mocks.audioInit,
    start: mocks.audioStart,
    pause: mocks.audioPause,
    resume: mocks.audioResume,
    destroy: mocks.audioDestroy,
  })),
}))

vi.mock('../../src/services/RealtimeWebRTCEngine', () => ({
  RealtimeWebRTCEngine: vi.fn().mockImplementation(() => ({
    init: mocks.rtcInit,
    start: mocks.rtcStart,
    pause: mocks.rtcPause,
    resume: mocks.rtcResume,
    destroy: mocks.rtcDestroy,
  })),
}))

vi.mock('../../src/store/AppStore', () => ({
  useAppStore: mocks.useAppStore,
}))

vi.mock('../../src/store/ConfigStore', () => ({
  useConfigStore: mocks.useConfigStore,
}))

import { useAudio } from '../../src/hooks/useAudio'
import { AudioEngine } from '../../src/services/AudioEngine'
import { RealtimeWebRTCEngine } from '../../src/services/RealtimeWebRTCEngine'

describe('useAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.configHookValue.config.sttMode = 'standard'
    mocks.configState.getOpenAiKey.mockReturnValue('sk-openai')
    mocks.audioInit.mockResolvedValue(undefined)
    mocks.rtcInit.mockResolvedValue(undefined)
  })

  it('sttMode=standard 時建立 AudioEngine 路徑', async () => {
    const { result } = renderHook(() => useAudio())

    await act(async () => {
      await result.current.start()
    })

    expect(AudioEngine).toHaveBeenCalledTimes(1)
    expect(mocks.audioInit).toHaveBeenCalledTimes(1)
    expect(mocks.audioStart).toHaveBeenCalledTimes(1)
    expect(RealtimeWebRTCEngine).not.toHaveBeenCalled()
    expect(mocks.appStore.setRecordingState).toHaveBeenCalledWith('recording')
  })

  it('sttMode=openai-realtime 且有 key 時建立 RealtimeWebRTCEngine 路徑', async () => {
    mocks.configHookValue.config.sttMode = 'openai-realtime'
    const { result } = renderHook(() => useAudio())

    await act(async () => {
      await result.current.start()
    })

    expect(RealtimeWebRTCEngine).toHaveBeenCalledTimes(1)
    expect(mocks.rtcInit).toHaveBeenCalledTimes(1)
    expect(mocks.rtcStart).toHaveBeenCalledTimes(1)
    expect(AudioEngine).not.toHaveBeenCalled()
    expect(mocks.appStore.setRecordingState).toHaveBeenCalledWith('recording')
  })

  it('realtime init 失敗會 fallback 到 standard 路徑', async () => {
    mocks.configHookValue.config.sttMode = 'openai-realtime'
    mocks.rtcInit.mockRejectedValueOnce(new Error('realtime broken'))

    const { result } = renderHook(() => useAudio())

    await act(async () => {
      await result.current.start()
    })

    expect(RealtimeWebRTCEngine).toHaveBeenCalledTimes(1)
    expect(AudioEngine).toHaveBeenCalledTimes(1)
    expect(mocks.audioStart).toHaveBeenCalledTimes(1)
    const lastCall = mocks.appStore.setAppError.mock.calls[mocks.appStore.setAppError.mock.calls.length - 1]
    expect(lastCall[0]).toBe('realtime_error')
    expect(String(lastCall[1])).toContain('已自動切回標準模式')
    expect(mocks.appStore.setRecordingState).toHaveBeenCalledWith('recording')
  })

  it('realtime 模式缺少 OpenAI key 會 fallback 到 standard 路徑', async () => {
    mocks.configHookValue.config.sttMode = 'openai-realtime'
    mocks.configState.getOpenAiKey.mockReturnValue('')

    const { result } = renderHook(() => useAudio())

    await act(async () => {
      await result.current.start()
    })

    expect(RealtimeWebRTCEngine).not.toHaveBeenCalled()
    expect(AudioEngine).toHaveBeenCalledTimes(1)
    expect(mocks.audioStart).toHaveBeenCalledTimes(1)
    expect(mocks.appStore.setAppError).toHaveBeenCalledWith('realtime_error', '未設定 OpenAI API Key，已自動切回標準模式')
  })
})
