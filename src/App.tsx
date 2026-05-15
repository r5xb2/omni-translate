import { useState } from 'react'
import { useAudio } from './hooks/useAudio'
import { useAppStore } from './store/AppStore'
import { useConfigStore } from './store/ConfigStore'
import { TranslationTable } from './components/dashboard/TranslationTable'
import { ControlBar } from './components/dashboard/ControlBar'
import { ErrorBanner } from './components/dashboard/ErrorBanner'
import { SettingModal } from './components/dashboard/SettingModal'
import { ExportModal } from './components/dashboard/ExportModal'
import { ExportSession } from './types'

export function App() {
  const [showSettings, setShowSettings] = useState(false)
  const [exportSession, setExportSession] = useState<ExportSession | null>(null)
  const { start, pause, resume, stop, getExportSession } = useAudio()
  const { setRecordingState, clearMessages, pendingCount } = useAppStore()
  const { getProviderConfig, config } = useConfigStore()

  const handleStart = () => {
    const { apiKey } = getProviderConfig()
    if (!apiKey || apiKey.length < 10) {
      setShowSettings(true)
      return
    }
    start()
  }

  const handleStop = () => {
    stop()
    const session = getExportSession()
    setExportSession(session)
  }

  const handleExportConfirm = () => {
    setExportSession(null)
    clearMessages()
    setRecordingState('idle')
  }

  return (
    <div className="flex h-screen flex-col bg-gray-50 font-sans">
      {/* 頂部標題列 */}
      <header className="flex items-center gap-3 bg-white border-b px-4 py-3 shadow-sm">
        <span className="text-lg font-bold text-blue-600">OmniTranslate</span>
        <span className="text-xs rounded px-2 py-0.5 text-gray-400 bg-gray-100">
          {config.provider === 'openai' ? 'OpenAI' : 'GROQ LPU'}
        </span>
        {!config.enableTranslation && (
          <span className="text-xs rounded px-2 py-0.5 text-orange-600 bg-orange-50 border border-orange-200">
            僅轉文字
          </span>
        )}
        {pendingCount > 0 && (
          <span className="text-xs rounded px-2 py-0.5 text-blue-600 bg-blue-50 border border-blue-200 animate-pulse">
            處理中 {pendingCount}
          </span>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {config.modelSettings.sttModel}{config.enableTranslation ? ` ／ ${config.modelSettings.llmModel}` : ''}
        </span>
      </header>

      {/* 主內容區 */}
      <main className="flex flex-1 flex-col gap-2 overflow-hidden p-4">
        <ErrorBanner />
        <TranslationTable />
      </main>

      {/* 控制列 */}
      <ControlBar
        onStart={handleStart}
        onPause={pause}
        onResume={resume}
        onStop={handleStop}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Modals */}
      {showSettings && <SettingModal onClose={() => setShowSettings(false)} />}
      {exportSession && (
        <ExportModal
          session={exportSession}
          onClose={() => setExportSession(null)}
          onConfirm={handleExportConfirm}
        />
      )}
    </div>
  )
}
