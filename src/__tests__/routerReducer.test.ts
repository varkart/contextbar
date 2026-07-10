import { describe, it, expect } from 'vitest'
import { routerReducer, initialRouterState } from '../viewRouter'
import type { RouterState } from '../viewRouter'
import type { Agent, Skill, McpServer } from '../types'

const tool = {
  id: 'claude', name: 'Claude Code', installed: true, supportsSkills: true, supportsMcps: true, skills: [], mcps: [],
} as Agent

const skill: Skill = {
  name: 'graphify', path: '/skills/graphify', description: 'g', hasFullDescription: false, active: true, sourceId: 's',
}

const mcp: McpServer = {
  name: 'github', command: 'npx', args: [], active: true,
  hasSecrets: true, secretKeyNames: ['TOKEN'], sourceId: 'settings_json',
}

const base: RouterState = initialRouterState()

describe('initialRouterState', () => {
  it('defaults to main view', () => {
    expect(initialRouterState('').view).toBe('main')
  })

  it('reads #settings hash', () => {
    expect(initialRouterState('#settings').view).toBe('settings')
  })

  it('unknown hash defaults to main', () => {
    expect(initialRouterState('#other').view).toBe('main')
  })
})

describe('routerReducer — OPEN_AGENTS_LIST', () => {
  it('navigates to llms-list', () => {
    const next = routerReducer(base, { type: 'OPEN_AGENTS_LIST', mode: 'default' })
    expect(next.view).toBe('agents-list')
    expect(next.agentsListMode).toBe('default')
  })
})

describe('routerReducer — OPEN_SKILLS_LIST_FOR_AGENT', () => {
  it('sets selectedAgent and navigates to skills-list', () => {
    const next = routerReducer(base, { type: 'OPEN_SKILLS_LIST_FOR_AGENT', tool })
    expect(next.view).toBe('skills-list')
    expect(next.selectedAgent).toBe(tool)
  })
})

describe('routerReducer — OPEN_MCPS_LIST_FOR_AGENT', () => {
  it('sets selectedAgent and navigates to mcps-list', () => {
    const next = routerReducer(base, { type: 'OPEN_MCPS_LIST_FOR_AGENT', tool })
    expect(next.view).toBe('mcps-list')
    expect(next.selectedAgent).toBe(tool)
  })
})

describe('routerReducer — SELECT_AGENT', () => {
  it('sets selectedAgent and navigates to tool-detail', () => {
    const next = routerReducer(base, { type: 'SELECT_AGENT', tool })
    expect(next.view).toBe('agent-detail')
    expect(next.selectedAgent).toBe(tool)
  })

  it('preserves other state', () => {
    const next = routerReducer(base, { type: 'SELECT_AGENT', tool })
    expect(next.selectedSkill).toBeNull()
    expect(next.selectedMcp).toBeNull()
  })
})

describe('routerReducer — SELECT_SKILL', () => {
  it('sets selectedSkill, skillBackView, view', () => {
    const next = routerReducer(base, { type: 'SELECT_SKILL', skill, fromView: 'skills-list' })
    expect(next.view).toBe('skill-detail')
    expect(next.selectedSkill).toBe(skill)
    expect(next.skillBackView).toBe('skills-list')
  })

  it('defaults fromView to tool-detail', () => {
    const next = routerReducer(base, { type: 'SELECT_SKILL', skill, fromView: 'agent-detail' })
    expect(next.skillBackView).toBe('agent-detail')
  })
})

describe('routerReducer — SELECT_MCP', () => {
  it('sets selectedMcp, mcpBackView, view', () => {
    const next = routerReducer(base, { type: 'SELECT_MCP', mcp, fromView: 'mcps-list' })
    expect(next.view).toBe('mcp-detail')
    expect(next.selectedMcp).toBe(mcp)
    expect(next.mcpBackView).toBe('mcps-list')
  })
})

describe('routerReducer — SELECT_PERMISSIONS', () => {
  it('navigates to permissions-detail', () => {
    const next = routerReducer(base, { type: 'SELECT_PERMISSIONS' })
    expect(next.view).toBe('permissions-detail')
  })
})

describe('routerReducer — OPEN_SKILLS_PAGE', () => {
  it('navigates to all-skills-list', () => {
    const next = routerReducer(base, { type: 'OPEN_SKILLS_PAGE', fromView: 'agent-detail' })
    expect(next.view).toBe('all-skills-list')
  })

  it('stores allSkillsBackView from fromView', () => {
    const next = routerReducer(base, { type: 'OPEN_SKILLS_PAGE', fromView: 'agent-detail' })
    expect(next.allSkillsBackView).toBe('agent-detail')
  })
})

describe('routerReducer — OPEN_MCPS_PAGE', () => {
  it('navigates to all-mcps-list', () => {
    const next = routerReducer(base, { type: 'OPEN_MCPS_PAGE', fromView: 'agent-detail' })
    expect(next.view).toBe('all-mcps-list')
  })

  it('stores allMcpsBackView from fromView', () => {
    const next = routerReducer(base, { type: 'OPEN_MCPS_PAGE', fromView: 'agent-detail' })
    expect(next.allMcpsBackView).toBe('agent-detail')
  })
})

describe('routerReducer — GO_TO', () => {
  it('sets view directly', () => {
    expect(routerReducer(base, { type: 'GO_TO', view: 'settings' }).view).toBe('settings')
    expect(routerReducer(base, { type: 'GO_TO', view: 'logs' }).view).toBe('logs')
    expect(routerReducer(base, { type: 'GO_TO', view: 'notifications' }).view).toBe('notifications')
  })
})

describe('routerReducer — REFRESH_SELECTED', () => {
  const updatedTool = {
    ...tool,
    skills: [{ ...skill, active: false }],
    mcps: [{ ...mcp, active: false }],
  } as Agent

  it('updates selectedAgent from fresh tools', () => {
    const state: RouterState = { ...base, selectedAgent: tool }
    const next = routerReducer(state, { type: 'REFRESH_SELECTED', tools: [updatedTool] })
    expect(next.selectedAgent?.skills).toEqual([{ ...skill, active: false }])
  })

  it('keeps selectedAgent when not found in fresh tools', () => {
    const state: RouterState = { ...base, selectedAgent: tool }
    const next = routerReducer(state, { type: 'REFRESH_SELECTED', tools: [] })
    expect(next.selectedAgent).toBe(tool)
  })

  it('updates selectedSkill from fresh tools', () => {
    const updatedSkill = { ...skill, active: false }
    const freshTool = { ...tool, skills: [updatedSkill], mcps: [] } as Agent
    const state: RouterState = { ...base, selectedAgent: freshTool, selectedSkill: skill }
    const next = routerReducer(state, { type: 'REFRESH_SELECTED', tools: [freshTool] })
    expect(next.selectedSkill?.active).toBe(false)
  })

  it('keeps selectedSkill when not found', () => {
    const state: RouterState = { ...base, selectedSkill: skill }
    const next = routerReducer(state, { type: 'REFRESH_SELECTED', tools: [] })
    expect(next.selectedSkill).toBe(skill)
  })

  it('updates selectedMcp from fresh tools', () => {
    const updatedMcp = { ...mcp, active: false }
    const freshTool = { ...tool, skills: [], mcps: [updatedMcp] } as Agent
    const state: RouterState = { ...base, selectedAgent: freshTool, selectedMcp: mcp }
    const next = routerReducer(state, { type: 'REFRESH_SELECTED', tools: [freshTool] })
    expect(next.selectedMcp?.active).toBe(false)
  })

  it('keeps selectedMcp when not found', () => {
    const state: RouterState = { ...base, selectedMcp: mcp }
    const next = routerReducer(state, { type: 'REFRESH_SELECTED', tools: [] })
    expect(next.selectedMcp).toBe(mcp)
  })

  it('nulls are preserved through refresh', () => {
    const next = routerReducer(base, { type: 'REFRESH_SELECTED', tools: [tool] })
    expect(next.selectedAgent).toBeNull()
    expect(next.selectedSkill).toBeNull()
    expect(next.selectedMcp).toBeNull()
  })
})

describe('routerReducer — RESET_TO', () => {
  it('roots a fresh stack at the given view', () => {
    const dirty: RouterState = {
      ...base,
      view: 'skill-detail',
      selectedAgent: tool,
      selectedSkill: skill,
      selectedMcp: mcp,
      allSkillsBackView: 'agent-detail',
    }
    const next = routerReducer(dirty, { type: 'RESET_TO', view: 'all-skills-list' })
    expect(next.view).toBe('all-skills-list')
    expect(next.selectedAgent).toBeNull()
    expect(next.selectedSkill).toBeNull()
    expect(next.selectedMcp).toBeNull()
    // Embedded routers must escape to main, not a stale back-view
    expect(next.allSkillsBackView).toBe('main')
    expect(next.allMcpsBackView).toBe('main')
  })
})
