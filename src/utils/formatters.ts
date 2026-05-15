/**
 * 將 Unix timestamp（毫秒）轉為 HH:MM:SS 格式
 * 以會議開始時間為基準計算相對時間
 */
export function formatRelativeTime(timestamp: number, sessionStart: number): string {
  const elapsed = Math.max(0, timestamp - sessionStart)
  const totalSeconds = Math.floor(elapsed / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

/**
 * 將當前時間格式化為檔名安全字串（YYYYMMDD-HHmmss）
 */
export function formatFilename(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  )
}

/**
 * Markdown 表格中 pipe 字元需 escape
 */
export function escapeMarkdownCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

/**
 * 產生簡易 UUID（不依賴 crypto.randomUUID 的回退方案）
 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
