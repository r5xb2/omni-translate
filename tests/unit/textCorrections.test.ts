import { describe, expect, it } from 'vitest'
import { applyTerminologyCorrections } from '../../src/utils/textCorrections'

describe('applyTerminologyCorrections', () => {
  it('會套用常見術語修正', () => {
    const input = '我們在 modem 裡面用 CheckGPT 寫供單'
    const output = applyTerminologyCorrections(input)

    expect(output).toContain('Markdown')
    expect(output).toContain('ChatGPT')
    expect(output).toContain('工單')
  })
})
