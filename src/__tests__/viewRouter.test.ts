import { describe, it, expect } from 'vitest'
import { escapeTransition, ALL_VIEWS } from '../viewRouter'
import type { AiTool } from '../types'

const tool = { id: 'claude', name: 'Claude Code', installed: true, supportsSkills: true, supportsMcps: true, skills: [], mcps: [] } as AiTool

describe('escapeTransition', () => {
  it('skill-detail → skillBackView', () => {
    expect(escapeTransition('skill-detail', 'default', 'skills-list', 'tool-detail', tool))
      .toEqual({ type: 'navigate', to: 'skills-list' })
  })

  it('skill-detail with tool-detail backView', () => {
    expect(escapeTransition('skill-detail', 'default', 'tool-detail', 'tool-detail', tool))
      .toEqual({ type: 'navigate', to: 'tool-detail' })
  })

  it('mcp-detail → mcpBackView', () => {
    expect(escapeTransition('mcp-detail', 'default', 'tool-detail', 'mcps-list', tool))
      .toEqual({ type: 'navigate', to: 'mcps-list' })
  })

  it('permissions-detail with selectedTool → tool-detail', () => {
    expect(escapeTransition('permissions-detail', 'default', 'tool-detail', 'tool-detail', tool))
      .toEqual({ type: 'navigate', to: 'tool-detail' })
  })

  it('permissions-detail without selectedTool → main', () => {
    expect(escapeTransition('permissions-detail', 'default', 'tool-detail', 'tool-detail', null))
      .toEqual({ type: 'navigate', to: 'main' })
  })

  it('skills-list in default mode → tool-detail', () => {
    expect(escapeTransition('skills-list', 'default', 'tool-detail', 'tool-detail', tool))
      .toEqual({ type: 'navigate', to: 'tool-detail' })
  })

  it('skills-list in skills mode → llms-list', () => {
    expect(escapeTransition('skills-list', 'skills', 'tool-detail', 'tool-detail', tool))
      .toEqual({ type: 'navigate', to: 'llms-list' })
  })

  it('mcps-list in default mode → tool-detail', () => {
    expect(escapeTransition('mcps-list', 'default', 'tool-detail', 'tool-detail', tool))
      .toEqual({ type: 'navigate', to: 'tool-detail' })
  })

  it('mcps-list in mcps mode → llms-list', () => {
    expect(escapeTransition('mcps-list', 'mcps', 'tool-detail', 'tool-detail', tool))
      .toEqual({ type: 'navigate', to: 'llms-list' })
  })

  it('tool-detail → llms-list', () => {
    expect(escapeTransition('tool-detail', 'default', 'tool-detail', 'tool-detail', tool))
      .toEqual({ type: 'navigate', to: 'llms-list' })
  })

  it('llms-list → main', () => {
    expect(escapeTransition('llms-list', 'default', 'tool-detail', 'tool-detail', null))
      .toEqual({ type: 'navigate', to: 'main' })
  })

  it('settings → main', () => {
    expect(escapeTransition('settings', 'default', 'tool-detail', 'tool-detail', null))
      .toEqual({ type: 'navigate', to: 'main' })
  })

  it('notifications → main', () => {
    expect(escapeTransition('notifications', 'default', 'tool-detail', 'tool-detail', null))
      .toEqual({ type: 'navigate', to: 'main' })
  })

  it('logs → main', () => {
    expect(escapeTransition('logs', 'default', 'tool-detail', 'tool-detail', null))
      .toEqual({ type: 'navigate', to: 'main' })
  })

  it('main → hide', () => {
    expect(escapeTransition('main', 'default', 'tool-detail', 'tool-detail', null))
      .toEqual({ type: 'hide' })
  })
})

describe('escape keyboard coverage — fails when a new view is missing escape handling', () => {
  it('every view except main navigates on Escape', () => {
    const nonMain = ALL_VIEWS.filter(v => v !== 'main')
    for (const view of nonMain) {
      const result = escapeTransition(view, 'default', 'tool-detail', 'tool-detail', null)
      expect(
        result.type,
        `View "${view}" returns "hide" from escapeTransition — Escape will close the window instead of navigating back. Add a case for it in escapeTransition().`
      ).toBe('navigate')
    }
  })
})
