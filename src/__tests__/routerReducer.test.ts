import { describe, it, expect } from 'vitest'
import { routerReducer, initialRouterState } from '../viewRouter'
import type { RouterState } from '../viewRouter'
import type { AiTool, Skill, McpServer } from '../types'

const tool = {
  id: 'claude', name: 'Claude Code', installed: true, supportsSkills: true, supportsMcps: true, skills: [], mcps: [],
} as AiTool

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

describe('routerReducer — OPEN_LLMS_LIST', () => {
  it('navigates to llms-list', () => {
    const next = routerReducer(base, { type: 'OPEN_LLMS_LIST', mode: 'default' })
    expect(next.view).toBe('llms-list')
    expect(next.llmsListMode).toBe('default')
  })
})

describe('routerReducer — OPEN_SKILLS_LIST_FOR_TOOL', () => {
  it('sets selectedTool and navigates to skills-list', () => {
    const next = routerReducer(base, { type: 'OPEN_SKILLS_LIST_FOR_TOOL', tool })
    expect(next.view).toBe('skills-list')
    expect(next.selectedTool).toBe(tool)
  })
})

describe('routerReducer — OPEN_MCPS_LIST_FOR_TOOL', () => {
  it('sets selectedTool and navigates to mcps-list', () => {
    const next = routerReducer(base, { type: 'OPEN_MCPS_LIST_FOR_TOOL', tool })
    expect(next.view).toBe('mcps-list')
    expect(next.selectedTool).toBe(tool)
  })
})

describe('routerReducer — SELECT_TOOL', () => {
  it('sets selectedTool and navigates to tool-detail', () => {
    const next = routerReducer(base, { type: 'SELECT_TOOL', tool })
    expect(next.view).toBe('tool-detail')
    expect(next.selectedTool).toBe(tool)
  })

  it('preserves other state', () => {
    const next = routerReducer(base, { type: 'SELECT_TOOL', tool })
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
    const next = routerReducer(base, { type: 'SELECT_SKILL', skill, fromView: 'tool-detail' })
    expect(next.skillBackView).toBe('tool-detail')
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
    const next = routerReducer(base, { type: 'OPEN_SKILLS_PAGE', fromView: 'tool-detail' })
    expect(next.view).toBe('all-skills-list')
  })

  it('stores allSkillsBackView from fromView', () => {
    const next = routerReducer(base, { type: 'OPEN_SKILLS_PAGE', fromView: 'tool-detail' })
    expect(next.allSkillsBackView).toBe('tool-detail')
  })
})

describe('routerReducer — OPEN_MCPS_PAGE', () => {
  it('navigates to all-mcps-list', () => {
    const next = routerReducer(base, { type: 'OPEN_MCPS_PAGE', fromView: 'tool-detail' })
    expect(next.view).toBe('all-mcps-list')
  })

  it('stores allMcpsBackView from fromView', () => {
    const next = routerReducer(base, { type: 'OPEN_MCPS_PAGE', fromView: 'tool-detail' })
    expect(next.allMcpsBackView).toBe('tool-detail')
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
  } as AiTool

  it('updates selectedTool from fresh tools', () => {
    const state: RouterState = { ...base, selectedTool: tool }
    const next = routerReducer(state, { type: 'REFRESH_SELECTED', tools: [updatedTool] })
    expect(next.selectedTool?.skills).toEqual([{ ...skill, active: false }])
  })

  it('keeps selectedTool when not found in fresh tools', () => {
    const state: RouterState = { ...base, selectedTool: tool }
    const next = routerReducer(state, { type: 'REFRESH_SELECTED', tools: [] })
    expect(next.selectedTool).toBe(tool)
  })

  it('updates selectedSkill from fresh tools', () => {
    const updatedSkill = { ...skill, active: false }
    const freshTool = { ...tool, skills: [updatedSkill], mcps: [] } as AiTool
    const state: RouterState = { ...base, selectedTool: freshTool, selectedSkill: skill }
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
    const freshTool = { ...tool, skills: [], mcps: [updatedMcp] } as AiTool
    const state: RouterState = { ...base, selectedTool: freshTool, selectedMcp: mcp }
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
    expect(next.selectedTool).toBeNull()
    expect(next.selectedSkill).toBeNull()
    expect(next.selectedMcp).toBeNull()
  })
})
