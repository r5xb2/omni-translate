import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

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
    removeMessage: vi.fn(),
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
      sttLanguageHint: 'auto',
      enableTranslation: true,
      systemPrompt: 'prompt',
      userPrompt: 'user prompt',
      zhPunctuationRepairEnabled: true,
      zhPunctuationMinChars: 6,
      rollingContextSize: 5,
      vadSilenceMs: 500,
      vadMaxDurationMs: 20_000,
      meetingReadableMode: false,
      readabilityMergeGapMs: 1200,
      readabilityMinChars: 1,
      sttMode: 'standard' as const,
      realtimeModel: 'gpt-realtime-whisper',
      speakerDiarizationEnabled: false,
      activeProfileId: 'meeting',
    },
    getProviderConfig: vi.fn(() => ({ apiKey: 'gsk_test', apiBase: 'https://api.groq.com/openai/v1' })),
  }

  const useAppStore = Object.assign(
    vi.fn(() => appStore),
    { getState: vi.fn(() => ({ messages: [], pendingCount: 0 })) },
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
import { GroqService } from '../../src/services/GroqService'

describe('useAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.configHookValue.config.sttMode = 'standard'
    mocks.configState.getOpenAiKey.mockReturnValue('sk-openai')
    mocks.audioInit.mockResolvedValue(undefined)
    mocks.rtcInit.mockResolvedValue(undefined)
    mocks.appStore.addMessage.mockReturnValue('msg_1')
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

  it('realtime 模式 pause 後保留短暫排空視窗，避免尾段遺失', async () => {
    mocks.configHookValue.config.sttMode = 'openai-realtime'
    const { result } = renderHook(() => useAudio())

    await act(async () => {
      await result.current.start()
    })

    const initOptions = mocks.rtcInit.mock.calls[0]?.[0] as {
      onTranscript: (text: string, startedAt: number, endedAt: number, itemId?: string) => void
    }

    act(() => {
      result.current.pause()
    })

    await act(async () => {
      initOptions.onTranscript('late message', Date.now(), Date.now(), 'item_pause_1')
    })

    expect(mocks.appStore.addMessage).toHaveBeenCalledTimes(1)
  })

  it('realtime 模式 stop 後會忽略晚到的 transcript.completed 事件', async () => {
    mocks.configHookValue.config.sttMode = 'openai-realtime'
    const { result } = renderHook(() => useAudio())

    await act(async () => {
      await result.current.start()
    })

    const initOptions = mocks.rtcInit.mock.calls[0]?.[0] as {
      onTranscript: (text: string, startedAt: number, endedAt: number, itemId?: string) => void
    }

    await act(async () => {
      await result.current.stop()
    })

    await act(async () => {
      initOptions.onTranscript('late after stop', Date.now(), Date.now(), 'item_stop_1')
    })

    expect(mocks.appStore.addMessage).not.toHaveBeenCalled()
  })

  it('關閉翻譯但啟用中文標點修復時，仍會呼叫 LLM 做標點優化', async () => {
    mocks.configHookValue.config.enableTranslation = false
    mocks.configHookValue.config.zhPunctuationRepairEnabled = true
    mocks.configHookValue.config.zhPunctuationMinChars = 6

    const transcribeSpy = vi
      .spyOn(GroqService, 'transcribe')
      .mockResolvedValue('我今天要去上課然後晚上再開會')
    const translateSpy = vi
      .spyOn(GroqService, 'translate')
      .mockResolvedValue('我今天要去上課，然後晚上再開會。')

    const { result } = renderHook(() => useAudio())

    await act(async () => {
      await result.current.start()
    })

    const initOptions = mocks.audioInit.mock.calls[0]?.[0] as {
      onSpeechEnd: (blob: Blob, startedAt: number, endedAt: number) => void
    }

    act(() => {
      initOptions.onSpeechEnd(new Blob(['demo']), Date.now(), Date.now())
    })

    await waitFor(() => {
      expect(mocks.appStore.updateMessage).toHaveBeenCalledWith(
        'msg_1',
        expect.objectContaining({
          originalText: '我今天要去上課，然後晚上再開會。',
          translatedText: '',
          status: 'completed',
        }),
      )
    })

    expect(translateSpy).toHaveBeenCalledTimes(1)
    transcribeSpy.mockRestore()
    translateSpy.mockRestore()
  })
})
