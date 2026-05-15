/**
 * CryptoService - MVP 版本
 *
 * 安全層級：Base64 編碼（非加密）
 * 理由：用戶確認 MVP 不使用 PIN 加密；
 *       瀏覽器 DevTools 仍可看到 Key，顯示警告橫幅告知風險。
 *
 * v1.1 升級路徑：改用 PBKDF2 + AES-GCM（CryptoService.ts 已預留介面）
 */

export const CryptoService = {
  /**
   * 將 API Key 以 Base64 編碼後存入 LocalStorage
   * （非加密，僅防止明文直接顯示）
   */
  encode(apiKey: string): string {
    return btoa(unescape(encodeURIComponent(apiKey)))
  },

  /**
   * 從 Base64 解碼還原 API Key
   * 解碼失敗時回傳空字串（Key 損毀情境）
   */
  decode(encoded: string): string {
    try {
      return decodeURIComponent(escape(atob(encoded)))
    } catch {
      return ''
    }
  },

  /**
   * 驗證解碼結果是否為有效的 GROQ API Key 格式
   * GROQ Key 以 'gsk_' 開頭，前綴後至少有 8 個字元
   */
  isValidGroqKey(key: string): boolean {
    return key.startsWith('gsk_') && key.length > 12
  },
}
