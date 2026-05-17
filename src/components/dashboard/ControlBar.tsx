import { useState } from 'react'
import { useAppStore } from '../../store/AppStore'
import { useConfigStore } from '../../store/ConfigStore'
import { RecordingState } from '../../types'
import { DISPLAY_MODE_OPTIONS, INTERACTION_MODE_OPTIONS } from '../../utils/constants'
import { formatRelativeTime } from '../../utils/formatters'
import { Button } from '../shared/Button'

interface ControlBarProps {
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onOpenSettings: () => void
}

/** 狀態燈 */
function StatusLight({ state }: { state: RecordingState }) {
  if (state === 'recording') {
    return (
      <span className="inline-block h-3 w-3 rounded-full bg-red-500 animate-pulse" title="錄音中" />
    )
  }
  if (state === 'paused') {
    return <span className="inline-block h-3 w-3 rounded-full bg-yellow-400" title="已暫停" />
  }
  return <span className="inline-block h-3 w-3 rounded-full bg-green-500" title="就緒" />
}

export function ControlBar({ onStart, onPause, onResume, onStop, onOpenSettings }: ControlBarProps) {
  const recordingState = useAppStore((s) => s.recordingState)
  const messageCount = useAppStore((s) => s.messages.length)
  const messages = useAppStore((s) => s.messages)
  const sessionStart = useAppStore((s) => s.sessionStartTime) ?? Date.now()
  const { config, updateConfig } = useConfigStore()
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (messages.length === 0) return
    const text = messages
      .map((m) => {
        const time = formatRelativeTime(m.timestamp, sessionStart)
        const zh = m.translatedText ? `\n${m.translatedText}` : ''
        return `[${time}] ${m.originalText}${zh}`
      })
      .join('\n\n')
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex flex-col gap-2 border-t bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">模式</label>
        <select
          value={config.interactionMode}
          onChange={(e) => updateConfig({ interactionMode: e.target.value as typeof config.interactionMode })}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"
        >
          {INTERACTION_MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <label className="ml-2 text-xs text-gray-500">顯示</label>
        <select
          value={config.displayMode}
          onChange={(e) => updateConfig({ displayMode: e.target.value as typeof config.displayMode })}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"
        >
          {DISPLAY_MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
      <StatusLight state={recordingState} />

      {recordingState === 'idle' || recordingState === 'stopping' ? (
        <Button onClick={onStart} aria-label="開始錄音">
          ▶ 開始
        </Button>
      ) : recordingState === 'recording' ? (
        <>
          <Button variant="ghost" onClick={onPause} aria-label="暫停錄音">
            ⏸ 暫停
          </Button>
          <Button variant="danger" onClick={onStop} aria-label="停止錄音">
            ■ 停止
          </Button>
        </>
      ) : (
        /* paused */
        <>
          <Button onClick={onResume} aria-label="繼續錄音">
            ▶ 繼續
          </Button>
          <Button variant="danger" onClick={onStop} aria-label="停止錄音">
            ■ 停止
          </Button>
        </>
      )}

      <span className="ml-auto text-xs text-gray-400">{messageCount} 筆</span>

      {messageCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          aria-label="複製全部內容"
        >
          {copied ? '✓ 已複製' : '⎘ 複製全部'}
        </Button>
      )}

      <Button variant="ghost" size="sm" onClick={onOpenSettings} aria-label="開啟設定">
        ⚙ 設定
      </Button>
      </div>
    </div>
  )
}
