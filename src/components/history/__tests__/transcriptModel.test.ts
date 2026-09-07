import { describe, it, expect } from 'vitest'
import { buildTurns, previewSteps, classify } from '../transcript/model'
import type { HistoryMessage, ContentBlock } from '../../../types'

const text = (t: string): ContentBlock => ({ blockType: 'text', text: t, isError: false })
const toolUse = (name: string, id: string, input = ''): ContentBlock => ({
  blockType: 'tool_use', toolName: name, toolInput: input, toolUseId: id, isError: false,
})
const toolResult = (id: string, output: string, isError = false): ContentBlock => ({
  blockType: 'tool_result', toolUseId: id, toolResult: output, isError,
})
const msg = (role: string, content: ContentBlock[], timestamp = 0): HistoryMessage => ({ role, content, timestamp })

describe('classify', () => {
  it('buckets tools by behaviour', () => {
    expect(classify('Bash')).toBe('shell')
    expect(classify('Read')).toBe('read')
    expect(classify('Grep')).toBe('read')
    expect(classify('Edit')).toBe('edit')
    expect(classify('Skill')).toBe('skill')
    expect(classify('mcp__github__create_pull_request')).toBe('mcp')
    expect(classify('WhoKnows')).toBe('other')
  })
})

describe('buildTurns', () => {
  it('pairs a tool_result onto its tool_use by id and exposes the output', () => {
    const turns = buildTurns([
      msg('user', [text('fix it')]),
      msg('assistant', [text('on it'), toolUse('Bash', 't1', 'npm test')]),
      msg('user', [toolResult('t1', 'PASS 12 passed')]),
    ])
    expect(turns).toHaveLength(2)
    const work = turns[1].segments.find(s => s.type === 'work')
    expect(work && work.type === 'work' && work.steps[0].output).toBe('PASS 12 passed')
  })

  it('drops a user turn that is only tool_result protocol noise', () => {
    const turns = buildTurns([
      msg('assistant', [toolUse('Read', 't1')]),
      msg('user', [toolResult('t1', '10 lines')]),
      msg('assistant', [text('done')]),
    ])
    expect(turns.map(t => t.role)).toEqual(['assistant', 'assistant'])
  })

  it('folds consecutive routine steps into one work segment', () => {
    const turns = buildTurns([
      msg('assistant', [toolUse('Grep', 'a'), toolUse('Read', 'b'), toolUse('Read', 'c'), toolUse('Edit', 'd')]),
    ])
    expect(turns[0].segments).toHaveLength(1)
    expect(turns[0].segments[0].type).toBe('work')
    expect(turns[0].segments[0].type === 'work' && turns[0].segments[0].steps).toHaveLength(4)
  })

  it('splits skill / MCP calls out as their own event segments', () => {
    const turns = buildTurns([
      msg('assistant', [
        toolUse('Skill', 's', 'code-review'),
        toolUse('Bash', 'b1', 'git commit'),
        toolUse('Bash', 'b2', 'git push'),
        toolUse('mcp__github__create_pull_request', 'm', 'title: x'),
      ]),
    ])
    expect(turns[0].segments.map(s => s.type)).toEqual(['event', 'work', 'event'])
    const mcp = turns[0].segments[2]
    expect(mcp.type === 'event' && mcp.step.server).toBe('github')
    expect(mcp.type === 'event' && mcp.step.bareName).toBe('create_pull_request')
    expect(turns[0].hasEvent).toBe(true)
  })

  it('groups one-tool-per-message assistant turns split by tool_result protocol turns', () => {
    // Claude Code shape when tools run in sequence: each tool_use is its own
    // assistant message, with a tool_result user message in between.
    const turns = buildTurns([
      msg('user', [text('do the thing')]),
      msg('assistant', [toolUse('Bash', 'a', 'step one')]),
      msg('user', [toolResult('a', 'ok')]),
      msg('assistant', [toolUse('Bash', 'b', 'step two')]),
      msg('user', [toolResult('b', 'ok')]),
      msg('assistant', [toolUse('Bash', 'c', 'step three')]),
      msg('user', [toolResult('c', 'ok')]),
      msg('assistant', [text('all done')]),
    ])
    expect(turns.map(t => t.role)).toEqual(['user', 'assistant', 'assistant'])
    const work = turns[1].segments[0]
    expect(work.type === 'work' && work.steps.map(s => s.input)).toEqual(['step one', 'step two', 'step three'])
    expect(turns[2].text).toBe('all done')
  })

  it('ignores empty (thinking-stripped) assistant messages between tool calls', () => {
    // Real Claude Code shape: a thinking-only assistant message (parsed to
    // empty) sits before almost every tool call.
    const empty = (): HistoryMessage => msg('assistant', [])
    const turns = buildTurns([
      msg('user', [text('go')]),
      empty(), msg('assistant', [toolUse('Bash', 'a', 'one')]), msg('user', [toolResult('a', 'ok')]),
      empty(), msg('assistant', [toolUse('Bash', 'b', 'two')]), msg('user', [toolResult('b', 'ok')]),
      empty(), msg('assistant', [toolUse('Read', 'c', 'three')]), msg('user', [toolResult('c', 'ok')]),
      msg('assistant', [text('done')]),
    ])
    expect(turns.map(t => t.role)).toEqual(['user', 'assistant', 'assistant'])
    const work = turns[1].segments[0]
    expect(work.type === 'work' && work.steps.map(s => s.input)).toEqual(['one', 'two', 'three'])
  })

  it('merges tool-only assistant messages into the preceding assistant turn', () => {
    const turns = buildTurns([
      msg('assistant', [text('working'), toolUse('Bash', 'a', 'x')]),
      msg('assistant', [toolUse('Bash', 'b', 'y')]),
      msg('assistant', [toolUse('Bash', 'c', 'z')]),
    ])
    expect(turns).toHaveLength(1)
    const work = turns[0].segments[0]
    expect(work.type === 'work' && work.steps).toHaveLength(3)
  })

  it('marks a turn with a failed step as hasError', () => {
    const turns = buildTurns([
      msg('assistant', [toolUse('Bash', 't1', 'boom')]),
      msg('user', [toolResult('t1', 'FAIL', true)]),
    ])
    expect(turns[0].hasError).toBe(true)
  })
})

describe('previewSteps', () => {
  it('shows a command chain for an all-Bash block', () => {
    expect(previewSteps([
      { name: 'Bash', input: 'git checkout -b x', isError: false, kind: 'shell' },
      { name: 'Bash', input: 'git push origin x', isError: false, kind: 'shell' },
    ])).toBe('git checkout  →  git push')
  })

  it('run-length-encodes mixed tool names', () => {
    expect(previewSteps([
      { name: 'Grep', isError: false, kind: 'read' },
      { name: 'Read', isError: false, kind: 'read' },
      { name: 'Read', isError: false, kind: 'read' },
      { name: 'Edit', isError: false, kind: 'edit' },
    ])).toBe('Grep · Read ×2 · Edit')
  })
})
