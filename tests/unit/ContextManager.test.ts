import { describe, it, expect, beforeEach } from 'vitest'
import { ContextManager } from '../../src/services/ContextManager'
import { Message } from '../../src/types'

function makeMsg(id: string, orig: string, trans: string): Message {
  return {
    id,
    timestamp: Date.now(),
    originalText: orig,
    translatedText: trans,
    status: 'completed',
  }
}

describe('ContextManager', () => {
  let cm: ContextManager

  beforeEach(() => {
    cm = new ContextManager(5)
  })

  // UT-CM-001
  it('初始狀態下 buildMessages 無歷史，只有 system + current', () => {
    const msgs = cm.buildMessages('Hello', 'SYSTEM_PROMPT')
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('system')
    expect(msgs[1].role).toBe('user')
    expect(msgs[1].content).toContain('Hello')
  })

  // UT-CM-002
  it('Buffer 有 3 則時，buildMessages 包含 3 對 history', () => {
    cm.add(makeMsg('1', 'A', '甲'))
    cm.add(makeMsg('2', 'B', '乙'))
    cm.add(makeMsg('3', 'C', '丙'))
    const msgs = cm.buildMessages('D')
    // system(1) + 3對history(6) + current(1) = 8
    expect(msgs).toHaveLength(8)
    expect(msgs[0].role).toBe('system')
    expect(msgs[msgs.length - 1].role).toBe('user')
  })

  // UT-CM-003
  it('超過 maxSize=5 時自動截斷，history 最多 5 對', () => {
    for (let i = 0; i < 8; i++) {
      cm.add(makeMsg(String(i), `E${i}`, `中${i}`))
    }
    const msgs = cm.buildMessages('current')
    // system(1) + 5對history(10) + current(1) = 12
    expect(msgs).toHaveLength(12)
  })

  // UT-CM-004
  it('clear() 後 buffer 為空，buildMessages 只有 2 則', () => {
    cm.add(makeMsg('1', 'A', '甲'))
    cm.clear()
    const msgs = cm.buildMessages('B')
    expect(msgs).toHaveLength(2)
  })

  // UT-CM-005
  it('第一則訊息的 role 必須是 system', () => {
    cm.add(makeMsg('1', 'X', '叉'))
    const msgs = cm.buildMessages('Y', 'MY_PROMPT')
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toBe('MY_PROMPT')
  })
})
