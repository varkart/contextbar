import { describe, it, expect } from 'vitest'
import { escapeTransition, ALL_VIEWS } from '../viewRouter'
import type { AiTool } from '../types'

const tool = { id: 'claude', name: 'Claude Code', installed: true, supportsSkills: true, supportsMcps: true, skills: [], mcps: [] } as AiTool

const esc = (view: Parameters<typeof escapeTransition>[0], opts?: {
  mode?: Parameters<typeof escapeTransition>[1]
  skillBack?: Parameters<typeof escapeTransition>[2]
  mcpBack?: Parameters<typeof escapeTransition>[3]
  selectedTool?: Parameters<typeof escapeTransition>[4]
  allSkillsBack?: Parameters<typeof escapeTransition>[5]
  allMcpsBack?: Parameters<typeof escapeTransition>[6]
}) => escapeTransition(
  view,
  opts?.mode ?? 'default',
  opts?.skillBack ?? 'tool-detail',
  opts?.mcpBack ?? 'tool-detail',
  opts?.selectedTool ?? null,
  opts?.allSkillsBack ?? 'tool-detail',
  opts?.allMcpsBack ?? 'tool-detail',
)

describe('escapeTransition', () => {
  it('skill-detail → skillBackView', () => {
    expect(esc('skill-detail', { skillBack: 'skills-list', selectedTool: tool }))
      .toEqual({ type: 'navigate', to: 'skills-list' })
  })

  it('skill-detail with tool-detail backView', () => {
    expect(esc('skill-detail', { selectedTool: tool }))
      .toEqual({ type: 'navigate', to: 'tool-detail' })
  })

  it('mcp-detail → mcpBackView', () => {
    expect(esc('mcp-detail', { mcpBack: 'mcps-list', selectedTool: tool }))
      .toEqual({ type: 'navigate', to: 'mcps-list' })
  })

  it('permissions-detail with selectedTool → tool-detail', () => {
    expect(esc('permissions-detail', { selectedTool: tool }))
      .toEqual({ type: 'navigate', to: 'tool-detail' })
  })

  it('permissions-detail without selectedTool → main', () => {
    expect(esc('permissions-detail'))
      .toEqual({ type: 'navigate', to: 'main' })
  })

  it('all-skills-list → allSkillsBackView', () => {
    expect(esc('all-skills-list', { allSkillsBack: 'tool-detail' }))
      .toEqual({ type: 'navigate', to: 'tool-detail' })
  })

  it('all-mcps-list → allMcpsBackView', () => {
    expect(esc('all-mcps-list', { allMcpsBack: 'tool-detail' }))
      .toEqual({ type: 'navigate', to: 'tool-detail' })
  })

  it('skills-list in default mode → tool-detail', () => {
    expect(esc('skills-list', { selectedTool: tool }))
      .toEqual({ type: 'navigate', to: 'tool-detail' })
  })

  it('skills-list in skills mode → llms-list', () => {
    expect(esc('skills-list', { mode: 'skills', selectedTool: tool }))
      .toEqual({ type: 'navigate', to: 'llms-list' })
  })

  it('mcps-list in default mode → tool-detail', () => {
    expect(esc('mcps-list', { selectedTool: tool }))
      .toEqual({ type: 'navigate', to: 'tool-detail' })
  })

  it('mcps-list in mcps mode → llms-list', () => {
    expect(esc('mcps-list', { mode: 'mcps', selectedTool: tool }))
      .toEqual({ type: 'navigate', to: 'llms-list' })
  })

  it('tool-detail → llms-list', () => {
    expect(esc('tool-detail', { selectedTool: tool }))
      .toEqual({ type: 'navigate', to: 'llms-list' })
  })

  it('llms-list → main', () => {
    expect(esc('llms-list')).toEqual({ type: 'navigate', to: 'main' })
  })

  it('settings → main', () => {
    expect(esc('settings')).toEqual({ type: 'navigate', to: 'main' })
  })

  it('notifications → main', () => {
    expect(esc('notifications')).toEqual({ type: 'navigate', to: 'main' })
  })

  it('logs → main', () => {
    expect(esc('logs')).toEqual({ type: 'navigate', to: 'main' })
  })

  it('main → hide', () => {
    expect(esc('main')).toEqual({ type: 'hide' })
  })
})

describe('escape keyboard coverage — fails when a new view is missing escape handling', () => {
  it('every view except main navigates on Escape', () => {
    const nonMain = ALL_VIEWS.filter(v => v !== 'main')
    for (const view of nonMain) {
      const result = esc(view)
      expect(
        result.type,
        `View "${view}" returns "hide" from escapeTransition — Escape will close the window instead of navigating back. Add a case for it in escapeTransition().`
      ).toBe('navigate')
    }
  })
})
