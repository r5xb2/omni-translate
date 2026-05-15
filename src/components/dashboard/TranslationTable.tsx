import { useEffect, useRef } from 'react'
import { useAppStore } from '../../store/AppStore'
import { formatRelativeTime } from '../../utils/formatters'

// 講者換人判斷：上段結束 → 下段開始 的靜默間距超過此值才顯示提示
// 即 msg.timestamp - prev.capturedEndAt（純靜音時長，不含語音時長）
const SILENCE_GAP_THRESHOLD_MS = 5_000

export function TranslationTable() {
  const messages = useAppStore((s) => s.messages)
  const sessionStart = useAppStore((s) => s.sessionStartTime) ?? Date.now()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-400 text-sm">
        按下「開始」後，翻譯結果將在此顯示
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-gray-50 z-10">
          <tr>
            <th className="w-16 px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">時間</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">English</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">中文</th>
          </tr>
        </thead>
        <tbody>
          {messages.map((msg, idx) => {
            const prev = messages[idx - 1]
            // 靜默間距 = 下段開始 - 上段結束（純停頓時長，不含語音本身時長）
            const silenceGap = prev ? msg.timestamp - prev.capturedEndAt : 0
            const showSpeakerHint = silenceGap >= SILENCE_GAP_THRESHOLD_MS

            return (
              <>
                {showSpeakerHint && (
                  <tr key={`sep-${msg.id}`}>
                    <td colSpan={3} className="px-3 py-1">
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span className="flex-1 border-t border-dashed border-gray-300" />
                    <span>⏸ {Math.round(silenceGap / 1000)}s 停頓，可能換人發言</span>
                        <span className="flex-1 border-t border-dashed border-gray-300" />
                      </div>
                    </td>
                  </tr>
                )}
                <tr key={msg.id} className="border-b hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap align-top">
                    {formatRelativeTime(msg.timestamp, sessionStart)}
                  </td>
                  <td className="px-3 py-2 align-top text-gray-800">
                    {msg.status === 'transcribing' ? <Skeleton /> : msg.originalText}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {msg.status === 'transcribing' || msg.status === 'translating' ? (
                      <Skeleton />
                    ) : msg.status === 'error' ? (
                      <span className="text-red-500">{msg.translatedText || '轉譯失敗'}</span>
                    ) : (
                      <span className="text-gray-900">{msg.translatedText}</span>
                    )}
                  </td>
                </tr>
              </>
            )
          })}
        </tbody>
      </table>
      <div ref={bottomRef} />
    </div>
  )
}

function Skeleton() {
  return <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
}

