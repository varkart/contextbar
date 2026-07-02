import { describe, it, expect } from 'vitest'
import { escapeTransition, ALL_VIEWS } from '../viewRouter'
import type { Agent } from '../types'

const tool = { id: 'claude', name: 'Claude Code', installed: true, supportsSkills: true, supportsMcps: true, skills: [], mcps: [] } as Agent

const esc = (view: Parameters<typeof escapeTransition>[0], opts?: {
  skillBack?: Parameters<typeof escapeTransition>[1]
  mcpBack?: Parameters<typeof escapeTransition>[2]
  selectedAgent?: Parameters<typeof escapeTransition>[3]
  allSkillsBack?: Parameters<typeof escapeTransition>[4]
  allMcpsBack?: Parameters<typeof escapeTransition>[5]
}) => escapeTransition(
  view,
  opts?.skillBack ?? 'agent-detail',
  opts?.mcpBack ?? 'agent-detail',
  opts?.selectedAgent ?? null,
  opts?.allSkillsBack ?? 'agent-detail',
  opts?.allMcpsBack ?? 'agent-detail',
)

describe('escapeTransition', () => {
  it('skill-detail → skillBackView', () => {
    expect(esc('skill-detail', { skillBack: 'skills-list', selectedAgent: tool }))
      .toEqual({ type: 'navigate', to: 'skills-list' })
  })

  it('skill-detail with tool-detail backView', () => {
    expect(esc('skill-detail', { selectedAgent: tool }))
      .toEqual({ type: 'navigate', to: 'agent-detail' })
  })

  it('mcp-detail → mcpBackView', () => {
    expect(esc('mcp-detail', { mcpBack: 'mcps-list', selectedAgent: tool }))
      .toEqual({ type: 'navigate', to: 'mcps-list' })
  })

  it('permissions-detail with selectedAgent → tool-detail', () => {
    expect(esc('permissions-detail', { selectedAgent: tool }))
      .toEqual({ type: 'navigate', to: 'agent-detail' })
  })

  it('permissions-detail without selectedAgent → main', () => {
    expect(esc('permissions-detail'))
      .toEqual({ type: 'navigate', to: 'main' })
  })

  it('all-skills-list → allSkillsBackView', () => {
    expect(esc('all-skills-list', { allSkillsBack: 'agent-detail' }))
      .toEqual({ type: 'navigate', to: 'agent-detail' })
  })

  it('all-mcps-list → allMcpsBackView', () => {
    expect(esc('all-mcps-list', { allMcpsBack: 'agent-detail' }))
      .toEqual({ type: 'navigate', to: 'agent-detail' })
  })

  it('skills-list → tool-detail', () => {
    expect(esc('skills-list', { selectedAgent: tool }))
      .toEqual({ type: 'navigate', to: 'agent-detail' })
  })

  it('mcps-list → tool-detail', () => {
    expect(esc('mcps-list', { selectedAgent: tool }))
      .toEqual({ type: 'navigate', to: 'agent-detail' })
  })

  it('tool-detail → llms-list', () => {
    expect(esc('agent-detail', { selectedAgent: tool }))
      .toEqual({ type: 'navigate', to: 'agents-list' })
  })

  it('llms-list → main', () => {
    expect(esc('agents-list')).toEqual({ type: 'navigate', to: 'main' })
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
