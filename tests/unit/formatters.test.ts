import { describe, it, expect } from 'vitest'
import { formatRelativeTime, escapeMarkdownCell, generateId, formatFilename } from '../../src/utils/formatters'

describe('formatters', () => {
  it('formatRelativeTime: 0ms → 00:00:00', () => {
    expect(formatRelativeTime(1000, 1000)).toBe('00:00:00')
  })

  it('formatRelativeTime: 3661000ms → 01:01:01', () => {
    expect(formatRelativeTime(1000 + 3_661_000, 1000)).toBe('01:01:01')
  })

  it('formatRelativeTime: 音訊早於 start 時回傳 00:00:00', () => {
    expect(formatRelativeTime(500, 1000)).toBe('00:00:00')
  })

  it('escapeMarkdownCell: | 字元被 escape', () => {
    expect(escapeMarkdownCell('A | B')).toBe('A \\| B')
  })

  it('escapeMarkdownCell: 無特殊字元不受影響', () => {
    expect(escapeMarkdownCell('hello world')).toBe('hello world')
  })

  it('generateId: 每次回傳不同值', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()))
    expect(ids.size).toBe(100)
  })

  it('formatFilename: 格式為 YYYYMMDD-HHmmss', () => {
    expect(formatFilename()).toMatch(/^\d{8}-\d{6}$/)
  })
})
