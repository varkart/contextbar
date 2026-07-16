import { describe, it, expect } from 'vitest'
import { groupMessages, isToolOnlyMessage } from '../SessionDetail'
import type { HistoryMessage, ContentBlock } from '../../../types'

function textBlock(text: string): ContentBlock {
  return { blockType: 'text', text, isError: false }
}
function toolBlock(name: string, isError = false): ContentBlock {
  return { blockType: 'tool_use', toolName: name, isError }
}
function msg(role: string, content: ContentBlock[]): HistoryMessage {
  return { role, content }
}

describe('isToolOnlyMessage', () => {
  it('true for an assistant message made entirely of tool_use blocks', () => {
    expect(isToolOnlyMessage(msg('assistant', [toolBlock('Bash')]))).toBe(true)
  })
  it('false when text is mixed in', () => {
    expect(isToolOnlyMessage(msg('assistant', [toolBlock('Bash'), textBlock('done')]))).toBe(false)
  })
  it('false for user messages', () => {
    expect(isToolOnlyMessage(msg('user', [toolBlock('Bash')]))).toBe(false)
  })
  it('false for empty content', () => {
    expect(isToolOnlyMessage(msg('assistant', []))).toBe(false)
  })
})

describe('groupMessages', () => {
  it('collapses a run of 3+ consecutive tool-only messages into one group', () => {
    const messages = [
      msg('user', [textBlock('do the thing')]),
      msg('assistant', [toolBlock('exec_command')]),
      msg('assistant', [toolBlock('exec_command')]),
      msg('assistant', [toolBlock('exec_command')]),
      msg('assistant', [textBlock('done')]),
    ]
    const units = groupMessages(messages)
    expect(units).toEqual([
      { kind: 'message', message: messages[0], key: 0 },
      { kind: 'toolGroup', blocks: [toolBlock('exec_command'), toolBlock('exec_command'), toolBlock('exec_command')], key: 1 },
      { kind: 'message', message: messages[4], key: 4 },
    ])
  })

  it('leaves a run of fewer than 3 tool-only messages ungrouped', () => {
    const messages = [
      msg('assistant', [toolBlock('Read')]),
      msg('assistant', [toolBlock('Edit')]),
    ]
    const units = groupMessages(messages)
    expect(units).toEqual([
      { kind: 'message', message: messages[0], key: 0 },
      { kind: 'message', message: messages[1], key: 1 },
    ])
  })

  it('handles two separate runs with a text message between them', () => {
    const messages = [
      msg('assistant', [toolBlock('a')]),
      msg('assistant', [toolBlock('b')]),
      msg('assistant', [toolBlock('c')]),
      msg('assistant', [textBlock('checkpoint')]),
      msg('assistant', [toolBlock('d')]),
      msg('assistant', [toolBlock('e')]),
      msg('assistant', [toolBlock('f')]),
    ]
    const units = groupMessages(messages)
    expect(units.map(u => u.kind)).toEqual(['toolGroup', 'message', 'toolGroup'])
    expect((units[0] as { blocks: ContentBlock[] }).blocks).toHaveLength(3)
    expect((units[2] as { blocks: ContentBlock[] }).blocks).toHaveLength(3)
  })

  it('a single mixed text+tool message never gets grouped', () => {
    const messages = [msg('assistant', [toolBlock('a'), toolBlock('b'), toolBlock('c'), textBlock('x')])]
    const units = groupMessages(messages)
    expect(units).toEqual([{ kind: 'message', message: messages[0], key: 0 }])
  })

  it('empty input yields empty output', () => {
    expect(groupMessages([])).toEqual([])
  })
})
