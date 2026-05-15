import { useState } from 'react'
import { useAppStore } from '../../store/AppStore'
import { RecordingState } from '../../types'
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
    <div className="flex items-center gap-3 border-t bg-white px-4 py-3">
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
  )
}
