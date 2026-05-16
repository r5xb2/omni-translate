import { create } from 'zustand'
import { Message, RecordingState, AppErrorType, ExportSession } from '../types'
import { generateId } from '../utils/formatters'

interface AppStoreState {
  messages: Message[]
  recordingState: RecordingState
  appError: AppErrorType
  errorDetail: string | null
  sessionStartTime: number | null
  /** 佇列中尚未處理完畢的 blob 數量（可觀測性，0 = 無遺失風險） */
  pendingCount: number

  // ─── Actions ─────────────────────────────────────────────────
  addMessage: (msg: Omit<Message, 'id' | 'timestamp' | 'capturedEndAt'>, capturedAt?: number, capturedEndAt?: number) => string
  updateMessage: (id: string, patch: Partial<Message>) => void
  setRecordingState: (state: RecordingState) => void
  setAppError: (err: AppErrorType, detail?: string) => void
  clearMessages: () => void
  startSession: () => void
  addPending: () => void
  removePending: () => void

  /** 取得導出用的 Session 快照 */
  getExportSession: () => ExportSession
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  messages: [],
  recordingState: 'idle',
  appError: null,
  errorDetail: null,
  sessionStartTime: null,
  pendingCount: 0,

  addMessage: (msg, capturedAt, capturedEndAt) => {
    const id = generateId()
    const now = Date.now()
    const message: Message = {
      id,
      timestamp: capturedAt ?? now,
      capturedEndAt: capturedEndAt ?? now,
      ...msg,
    }
    set((s) => ({ messages: [...s.messages, message] }))
    return id
  },

  updateMessage: (id, patch) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }))
  },

  setRecordingState: (state) => set({ recordingState: state }),

  setAppError: (err, detail) => set({ appError: err, errorDetail: detail ?? null }),

  clearMessages: () => set({ messages: [], sessionStartTime: null, pendingCount: 0 }),

  startSession: () => set({ sessionStartTime: Date.now(), messages: [], pendingCount: 0, appError: null, errorDetail: null }),

  addPending: () => set((s) => ({ pendingCount: s.pendingCount + 1 })),
  removePending: () => set((s) => ({ pendingCount: Math.max(0, s.pendingCount - 1) })),

  getExportSession: () => {
    const { messages, sessionStartTime } = get()
    return {
      sessionId: generateId(),
      startTime: sessionStartTime ?? Date.now(),
      endTime: Date.now(),
      messages: messages
        .filter((m) => m.status === 'completed')
        .map(({ timestamp, originalText, translatedText }) => ({
          timestamp,
          originalText,
          translatedText,
        })),
    }
  },
}))
