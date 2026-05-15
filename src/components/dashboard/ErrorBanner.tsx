import { useAppStore } from '../../store/AppStore'
import { AppErrorType } from '../../types'

const ERROR_MESSAGES: Record<NonNullable<AppErrorType>, string> = {
  rate_limit:       '⚠️ GROQ API 請求頻率過高，系統正在自動重試...',
  invalid_key:      '🔑 API Key 無效，請至設定重新輸入正確的 GROQ API Key。',
  network_offline:  '📡 網路中斷，正在保護您的錄音，請確認網路後繼續。',
  mic_denied:       '🎙️ 麥克風權限遭拒，請點擊瀏覽器網址列左側圖示授予麥克風權限。',
  groq_server_error:'🔧 GROQ 服務暫時異常，已自動重試，若持續發生請稍後再試。',
}

export function ErrorBanner() {
  const appError = useAppStore((s) => s.appError)
  const setAppError = useAppStore((s) => s.setAppError)

  if (!appError) return null

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
      <span>{ERROR_MESSAGES[appError]}</span>
      <button
        onClick={() => setAppError(null)}
        aria-label="關閉提示"
        className="shrink-0 text-amber-500 hover:text-amber-700"
      >
        ✕
      </button>
    </div>
  )
}
