import { describe, it, expect } from 'vitest'
import {
  GROQ_LLM_MODELS,
  GROQ_STT_MODELS,
  OPENAI_LLM_MODELS,
  OPENAI_REALTIME_MODELS,
} from '../../src/utils/constants'

describe('constants - 模型清單', () => {
  // UT-SETTING-001
  it('GROQ_LLM_MODELS 包含 openai/gpt-oss-20b', () => {
    const values = GROQ_LLM_MODELS.map((m) => m.value)
    expect(values).toContain('openai/gpt-oss-20b')
  })

  // UT-SETTING-001b
  it('GROQ_LLM_MODELS 包含 openai/gpt-oss-120b', () => {
    const values = GROQ_LLM_MODELS.map((m) => m.value)
    expect(values).toContain('openai/gpt-oss-120b')
  })

  // UT-SETTING-002
  it('GROQ_LLM_MODELS 不包含已棄用的 mixtral-8x7b-32768', () => {
    const values = GROQ_LLM_MODELS.map((m) => m.value)
    expect(values).not.toContain('mixtral-8x7b-32768')
  })

  // UT-SETTING-003
  it('所有 GROQ_LLM_MODELS 的 value 為非空字串', () => {
    GROQ_LLM_MODELS.forEach((m) => {
      expect(typeof m.value).toBe('string')
      expect(m.value.length).toBeGreaterThan(0)
      expect(typeof m.label).toBe('string')
      expect(m.label.length).toBeGreaterThan(0)
    })
  })

  // UT-SETTING-003b
  it('OPENAI_REALTIME_MODELS 包含 gpt-4o-transcribe', () => {
    const values = OPENAI_REALTIME_MODELS.map((m) => m.value)
    expect(values).toContain('gpt-4o-transcribe')
  })

  // UT-SETTING-003c
  it('所有模型清單均無重複 value', () => {
    const checkUnique = (list: { value: string; label: string }[]) => {
      const values = list.map((m) => m.value)
      const unique = new Set(values)
      expect(unique.size).toBe(values.length)
    }
    checkUnique(GROQ_LLM_MODELS)
    checkUnique(GROQ_STT_MODELS)
    checkUnique(OPENAI_LLM_MODELS)
    checkUnique(OPENAI_REALTIME_MODELS)
  })
})
