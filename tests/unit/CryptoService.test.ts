import { describe, it, expect } from 'vitest'
import { CryptoService } from '../../src/services/CryptoService'

describe('CryptoService', () => {
  const API_KEY = 'gsk_testkey_abcdefghijklmnopqrstuvwxyz123456'

  // UT-CS-001
  it('encode 後 decode 可還原原始 API Key', () => {
    const encoded = CryptoService.encode(API_KEY)
    expect(CryptoService.decode(encoded)).toBe(API_KEY)
  })

  // UT-CS-002
  it('損毀的 encoded 值解碼回傳空字串，不拋出錯誤', () => {
    expect(CryptoService.decode('!!!invalid!!!')).toBe('')
  })

  // UT-CS-003
  it('encoded 值不包含明文 API Key', () => {
    const encoded = CryptoService.encode(API_KEY)
    expect(encoded).not.toContain(API_KEY)
  })

  // UT-CS-004
  it('isValidGroqKey 識別有效的 GROQ Key', () => {
    expect(CryptoService.isValidGroqKey('gsk_abcdefghij12345')).toBe(true)
    expect(CryptoService.isValidGroqKey('sk-openai-key')).toBe(false)
    expect(CryptoService.isValidGroqKey('')).toBe(false)
  })
})
