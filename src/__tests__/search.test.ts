import { describe, it, expect } from 'vitest'
import { searchTools, highlight } from '../search'
import type { AiTool } from '../types'

const makeTool = (overrides: Partial<AiTool> = {}): AiTool => ({
  id: 'claude',
  name: 'Claude Code',
  installed: true,
  skills: [],
  mcps: [],
  ...overrides,
})

// ── searchTools ──────────────────────────────────────────────────────────────

describe('searchTools', () => {
  it('empty query returns all tools with score 1', () => {
    const tools = [makeTool({ id: 'a' }), makeTool({ id: 'b' })]
    const results = searchTools(tools, '')
    expect(results).toHaveLength(2)
    results.forEach(r => expect(r.score).toBe(1))
  })

  it('whitespace-only query returns all tools', () => {
    const tools = [makeTool({ id: 'a' }), makeTool({ id: 'b' })]
    expect(searchTools(tools, '   ')).toHaveLength(2)
  })

  it('matches tool by name', () => {
    const tools = [makeTool({ name: 'Claude Code' }), makeTool({ id: 'cursor', name: 'Cursor' })]
    const results = searchTools(tools, 'claude')
    expect(results).toHaveLength(1)
    expect(results[0].tool.name).toBe('Claude Code')
  })

  it('matches tool by id', () => {
    const tools = [makeTool({ id: 'claude', name: 'Claude Code' })]
    const results = searchTools(tools, 'claude')
    expect(results).toHaveLength(1)
  })

  it('excludes tools with no match', () => {
    const tools = [makeTool({ id: 'cursor', name: 'Cursor' })]
    expect(searchTools(tools, 'gemini')).toHaveLength(0)
  })

  it('matches by skill name and records matched path', () => {
    const tool = makeTool({
      skills: [{ name: 'impeccable', path: '/skills/impeccable', description: undefined, active: true, sourceId: 'skills_dir' }],
    })
    const results = searchTools([tool], 'impec')
    expect(results).toHaveLength(1)
    expect(results[0].matchedSkills.has('/skills/impeccable')).toBe(true)
  })

  it('matches by skill description', () => {
    const tool = makeTool({
      skills: [{ name: 'my-skill', path: '/p', description: 'Builds graphs', active: true, sourceId: 'skills_dir' }],
    })
    const results = searchTools([tool], 'graph')
    expect(results).toHaveLength(1)
    expect(results[0].matchedSkills.has('/p')).toBe(true)
  })

  it('matches by mcp name and records matched name', () => {
    const tool = makeTool({
      mcps: [{ name: 'github', command: 'npx', args: [], active: true, hasSecrets: false, secretKeyNames: [], sourceId: 'settings_json' }],
    })
    const results = searchTools([tool], 'github')
    expect(results).toHaveLength(1)
    expect(results[0].matchedMcps.has('github')).toBe(true)
  })


  it('sorts by score descending', () => {
    const exact = makeTool({ id: 'gemini', name: 'gemini' })
    const partial = makeTool({ id: 'gemini-cli', name: 'Gemini CLI' })
    const results = searchTools([partial, exact], 'gemini')
    // exact match should score higher than prefix
    expect(results[0].tool.id).toBe('gemini')
  })

  it('case-insensitive matching', () => {
    const tools = [makeTool({ name: 'Claude Code' })]
    expect(searchTools(tools, 'CLAUDE')).toHaveLength(1)
  })

  it('fuzzy match: all chars in order', () => {
    const tools = [makeTool({ name: 'Claude Code' })]
    // 'cde' appears in order in 'Claude Code' (c...d...e)
    expect(searchTools(tools, 'cde')).toHaveLength(1)
  })
})

// ── highlight ────────────────────────────────────────────────────────────────

describe('highlight', () => {
  it('empty query returns single no-match segment', () => {
    expect(highlight('hello', '')).toEqual([{ text: 'hello', match: false }])
  })

  it('whitespace query returns single no-match segment', () => {
    expect(highlight('hello', '  ')).toEqual([{ text: 'hello', match: false }])
  })

  it('no match returns single no-match segment', () => {
    expect(highlight('hello', 'xyz')).toEqual([{ text: 'hello', match: false }])
  })

  it('match at start', () => {
    const parts = highlight('claude', 'cla')
    expect(parts).toEqual([
      { text: 'cla', match: true },
      { text: 'ude', match: false },
    ])
  })

  it('match at end', () => {
    const parts = highlight('impeccable', 'able')
    expect(parts).toEqual([
      { text: 'impeccable'.slice(0, -4), match: false },
      { text: 'able', match: true },
    ])
  })

  it('match in middle produces three segments', () => {
    const parts = highlight('Claude Code', 'ude')
    expect(parts).toHaveLength(3)
    expect(parts[1]).toEqual({ text: 'ude', match: true })
  })

  it('case-insensitive match preserves original casing', () => {
    const parts = highlight('Claude Code', 'CLAUDE')
    const matched = parts.find(p => p.match)
    expect(matched?.text).toBe('Claude')
  })

  it('filters out empty segments', () => {
    // full string match → no before/after segments
    const parts = highlight('abc', 'abc')
    expect(parts.every(p => p.text.length > 0)).toBe(true)
    expect(parts.find(p => p.match)?.text).toBe('abc')
  })
})
