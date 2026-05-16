import { Fragment, useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '../../store/AppStore'
import { useConfigStore } from '../../store/ConfigStore'
import { formatRelativeTime } from '../../utils/formatters'

// 講者換人判斷：上段結束 → 下段開始 的靜默間距超過此值才顯示提示
// 即 msg.timestamp - prev.capturedEndAt（純靜音時長，不含語音時長）
const SILENCE_GAP_THRESHOLD_MS = 5_000
const PUNCT_TOKEN_RE = /[,.!?;:，。！？；：]/
const ZH_CHAR_RE = /[\u3400-\u9FFF]/

function joinChineseSegments(left: string, right: string): string {
  const a = left.trim()
  const b = right.trim()
  if (!a) return b
  if (!b) return a
  if (/^[，。！？；：]/.test(b)) return `${a}${b}`
  if (/[，。！？；：]$/.test(a)) return `${a}${b}`
  if (ZH_CHAR_RE.test(a) && ZH_CHAR_RE.test(b)) return `${a}，${b}`
  return `${a} ${b}`
}

function sanitizeChineseCell(text: string): string {
  const compact = text.trim()
  if (!compact) return '（待翻譯）'
  return compact
}

export function TranslationTable() {
  const messages = useAppStore((s) => s.messages)
  const sessionStart = useAppStore((s) => s.sessionStartTime) ?? Date.now()
  const {
    meetingReadableMode,
    readabilityMergeGapMs,
    readabilityMinChars,
  } = useConfigStore((s) => s.config)
  const bottomRef = useRef<HTMLDivElement>(null)

  const displayMessages = useMemo(() => {
    if (!meetingReadableMode) return messages

    const compactLength = (text: string): number =>
      text
        .replace(/[\s.,!?;:'"，。！？；：「」、『』（）()\-_/\\]/g, '')
        .trim()
        .length

    const merged: typeof messages = []
    for (const msg of messages) {
      if (msg.status !== 'completed') {
        merged.push(msg)
        continue
      }

      const tooShort =
        compactLength(msg.originalText) < readabilityMinChars &&
        compactLength(msg.translatedText) < readabilityMinChars
      const keepForPunctuation =
        PUNCT_TOKEN_RE.test(msg.originalText) ||
        PUNCT_TOKEN_RE.test(msg.translatedText)
      if (tooShort && !keepForPunctuation) continue

      const prev = merged[merged.length - 1]
      const canMerge =
        !!prev &&
        prev.status === 'completed' &&
        msg.timestamp - prev.capturedEndAt <= readabilityMergeGapMs

      if (canMerge && prev) {
        merged[merged.length - 1] = {
          ...prev,
          capturedEndAt: msg.capturedEndAt,
          originalText: `${prev.originalText} ${msg.originalText}`.trim(),
          translatedText: joinChineseSegments(prev.translatedText, msg.translatedText),
        }
      } else {
        merged.push(msg)
      }
    }

    return merged
  }, [meetingReadableMode, messages, readabilityMergeGapMs, readabilityMinChars])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [displayMessages])

  if (displayMessages.length === 0) {
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
          {displayMessages.map((msg, idx) => {
            const prev = displayMessages[idx - 1]
            // 靜默間距 = 下段開始 - 上段結束（純停頓時長，不含語音本身時長）
            const silenceGap = prev ? msg.timestamp - prev.capturedEndAt : 0
            const showSpeakerHint = silenceGap >= SILENCE_GAP_THRESHOLD_MS

            return (
              <Fragment key={msg.id}>
                {showSpeakerHint && (
                  <tr>
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
                      <span className="text-gray-900">{sanitizeChineseCell(msg.translatedText)}</span>
                    )}
                  </td>
                </tr>
              </Fragment>
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

