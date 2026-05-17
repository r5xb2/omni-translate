import { useEffect, useState } from 'react'
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
  const { getProviderConfig, config, hydrateFromLocalConfig } = useConfigStore()

  useEffect(() => {
    void hydrateFromLocalConfig()
  }, [hydrateFromLocalConfig])

  const handleStart = () => {
    const { apiKey } = getProviderConfig()
    if (!apiKey || apiKey.length < 10) {
      setShowSettings(true)
      return
    }
    start()
  }

  const handleStop = () => {
    void (async () => {
      await stop()
      const session = getExportSession()
      setExportSession(session)
    })()
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
        <span className="text-xs text-gray-500">
          即時語音轉文字與翻譯，支援逐字稿與模板化紀錄輸出
        </span>
        <span className="text-xs rounded px-2 py-0.5 text-gray-500 bg-gray-100">
          {config.interactionMode === 'conversation' ? '會議 / 對談記錄' : '單向內容記錄'}
        </span>
        <span className="text-xs rounded px-2 py-0.5 text-blue-700 bg-blue-50 border border-blue-200">
          {config.displayMode === 'original' ? '原文' : config.displayMode === 'translated' ? '翻譯' : '雙語'}
        </span>
        {pendingCount > 0 && (
          <span className="text-xs rounded px-2 py-0.5 text-blue-600 bg-blue-50 border border-blue-200 animate-pulse">
            處理中 {pendingCount}
          </span>
        )}
      </header>

      {/* 主內容區 */}
      <main className="flex flex-1 flex-col gap-2 overflow-hidden p-4">
        <h1 className="sr-only">OmniTranslate 即時語音轉文字工具</h1>
        <p className="sr-only">
          本頁提供會議與課堂場景的語音轉文字，支援原文、翻譯、雙語顯示，以及逐字稿與紀錄匯出。
        </p>
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
