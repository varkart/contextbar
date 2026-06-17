import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('../analytics', () => ({ capture: vi.fn(), captureException: vi.fn() }))

import { invoke } from '@tauri-apps/api/core'
import { capture } from '../analytics'
import { useViewRouter } from '../useViewRouter'
import type { AiTool, Skill, McpServer } from '../types'

const mockInvoke = vi.mocked(invoke)
const mockCapture = vi.mocked(capture)

const tool: AiTool = {
  id: 'claude', name: 'Claude Code', installed: true, skills: [], mcps: [],
}

const skill: Skill = {
  name: 'graphify', path: '/skills/graphify', description: 'g', hasFullDescription: false, active: true, sourceId: 's',
}

const mcp: McpServer = {
  name: 'github', command: 'npx', args: [], active: true,
  hasSecrets: true, secretKeyNames: ['TOKEN'], sourceId: 'settings_json',
}

beforeEach(() => {
  vi.clearAllMocks()
  window.location.hash = ''
})

describe('useViewRouter — initial state', () => {
  it('starts on main view', () => {
    const { result } = renderHook(() => useViewRouter())
    expect(result.current.view).toBe('main')
  })

  it('reads #settings hash on init', () => {
    window.location.hash = '#settings'
    const { result } = renderHook(() => useViewRouter())
    expect(result.current.view).toBe('settings')
  })

  it('unknown hash defaults to main', () => {
    window.location.hash = '#unknown'
    const { result } = renderHook(() => useViewRouter())
    expect(result.current.view).toBe('main')
  })
})

describe('useViewRouter — selectTool', () => {
  it('navigates to tool-detail and sets selectedTool', () => {
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.selectTool(tool) })
    expect(result.current.view).toBe('tool-detail')
    expect(result.current.selectedTool).toBe(tool)
  })

  it('fires capture event', () => {
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.selectTool(tool) })
    expect(mockCapture).toHaveBeenCalledWith('tool_detail_viewed', { tool_id: 'claude' })
  })
})

describe('useViewRouter — selectSkill', () => {
  it('navigates to skill-detail', () => {
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.selectSkill(skill, 'tool-detail') })
    expect(result.current.view).toBe('skill-detail')
    expect(result.current.selectedSkill).toBe(skill)
    expect(result.current.skillBackView).toBe('tool-detail')
  })

  it('defaults fromView to tool-detail', () => {
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.selectSkill(skill) })
    expect(result.current.skillBackView).toBe('tool-detail')
  })

  it('fires capture event', () => {
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.selectSkill(skill) })
    expect(mockCapture).toHaveBeenCalledWith('skill_detail_viewed', { skill_name: 'graphify' })
  })
})

describe('useViewRouter — selectMcp', () => {
  it('navigates to mcp-detail', () => {
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.selectMcp(mcp, 'mcps-list') })
    expect(result.current.view).toBe('mcp-detail')
    expect(result.current.selectedMcp).toBe(mcp)
    expect(result.current.mcpBackView).toBe('mcps-list')
  })

  it('defaults fromView to tool-detail', () => {
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.selectMcp(mcp) })
    expect(result.current.mcpBackView).toBe('tool-detail')
  })

  it('fires capture event', () => {
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.selectMcp(mcp) })
    expect(mockCapture).toHaveBeenCalledWith('mcp_detail_viewed', { mcp_name: 'github' })
  })
})

describe('useViewRouter — selectPermissions', () => {
  it('navigates to permissions-detail', () => {
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.selectTool(tool) })
    act(() => { result.current.selectPermissions() })
    expect(result.current.view).toBe('permissions-detail')
  })

  it('fires capture with tool_id', () => {
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.selectTool(tool) })
    act(() => { result.current.selectPermissions() })
    expect(mockCapture).toHaveBeenCalledWith('permissions_detail_viewed', { tool_id: 'claude' })
  })
})

describe('useViewRouter — openSkillsPage / openMcpsPage', () => {
  it('openSkillsPage navigates to skills-list', () => {
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.openSkillsPage() })
    expect(result.current.view).toBe('skills-list')
  })

  it('openMcpsPage navigates to mcps-list', () => {
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.openMcpsPage() })
    expect(result.current.view).toBe('mcps-list')
  })
})

describe('useViewRouter — goTo', () => {
  it('sets view directly', () => {
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.goTo('settings') })
    expect(result.current.view).toBe('settings')
  })
})

describe('useViewRouter — escape', () => {
  it('from settings navigates to main', () => {
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.goTo('settings') })
    act(() => { result.current.escape() })
    expect(result.current.view).toBe('main')
  })

  it('from tool-detail navigates to main', () => {
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.selectTool(tool) })
    act(() => { result.current.escape() })
    expect(result.current.view).toBe('main')
  })

  it('from skill-detail goes to skillBackView', () => {
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.selectSkill(skill, 'skills-list') })
    act(() => { result.current.escape() })
    expect(result.current.view).toBe('skills-list')
  })

  it('from mcp-detail goes to mcpBackView', () => {
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.selectMcp(mcp, 'mcps-list') })
    act(() => { result.current.escape() })
    expect(result.current.view).toBe('mcps-list')
  })

  it('from main calls hide_window', () => {
    mockInvoke.mockResolvedValue(undefined)
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.escape() })
    expect(mockInvoke).toHaveBeenCalledWith('hide_window')
  })

  it('hide_window error is swallowed', () => {
    mockInvoke.mockRejectedValue(new Error('IPC error'))
    const { result } = renderHook(() => useViewRouter())
    expect(() => act(() => { result.current.escape() })).not.toThrow()
  })
})

describe('useViewRouter — URL hash sync', () => {
  it('sets hash to #settings when on settings view', () => {
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.goTo('settings') })
    expect(window.location.hash).toBe('#settings')
  })

  it('clears hash when leaving settings', () => {
    window.location.hash = '#settings'
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.goTo('main') })
    expect(window.location.hash).toBe('')
  })

  it('non-settings views clear hash', () => {
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.goTo('settings') })
    act(() => { result.current.selectTool(tool) })
    expect(window.location.hash).toBe('')
  })
})

describe('useViewRouter — refreshSelected', () => {
  it('updates selectedTool in state', () => {
    const updatedTool = { ...tool, skills: [skill] }
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.selectTool(tool) })
    act(() => { result.current.refreshSelected([updatedTool]) })
    expect(result.current.selectedTool?.skills).toHaveLength(1)
  })

  it('keeps selectedTool when not found in fresh list', () => {
    const { result } = renderHook(() => useViewRouter())
    act(() => { result.current.selectTool(tool) })
    act(() => { result.current.refreshSelected([]) })
    expect(result.current.selectedTool).toBe(tool)
  })
})
