import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useAgentFilter } from '../useAgentFilter'
import type { Agent } from '../../types'

function tool(id: string): Agent {
  return { id, name: id, installed: true, supportsSkills: true, supportsMcps: true, skills: [], mcps: [] }
}

const agents = [tool('claude'), tool('cursor'), tool('gemini')]

describe('useAgentFilter — toggleTool (chip solo semantics)', () => {
  it('starts with everything selected', () => {
    const { result } = renderHook(() => useAgentFilter(agents))
    expect(result.current.allSelected).toBe(true)
    expect(result.current.selectedTools.size).toBe(3)
  })

  it('clicking one while all are selected solos it', () => {
    const { result } = renderHook(() => useAgentFilter(agents))
    act(() => result.current.toggleTool('cursor'))
    expect(result.current.selectedTools).toEqual(new Set(['cursor']))
    expect(result.current.allSelected).toBe(false)
  })

  it('clicking a second one adds to the selection', () => {
    const { result } = renderHook(() => useAgentFilter(agents))
    act(() => result.current.toggleTool('cursor'))
    act(() => result.current.toggleTool('gemini'))
    expect(result.current.selectedTools).toEqual(new Set(['cursor', 'gemini']))
  })

  it('removing the last selected agent falls back to all selected', () => {
    const { result } = renderHook(() => useAgentFilter(agents))
    act(() => result.current.toggleTool('cursor'))
    act(() => result.current.toggleTool('cursor'))
    expect(result.current.allSelected).toBe(true)
  })
})

describe('useAgentFilter — toggleToolCheckbox (dropdown checkbox semantics)', () => {
  it('unchecking one agent while all are selected deselects just that one, not a solo', () => {
    const { result } = renderHook(() => useAgentFilter(agents))
    act(() => result.current.toggleToolCheckbox('cursor'))
    expect(result.current.selectedTools).toEqual(new Set(['claude', 'gemini']))
    expect(result.current.allSelected).toBe(false)
  })

  it('rechecking that agent restores all-selected', () => {
    const { result } = renderHook(() => useAgentFilter(agents))
    act(() => result.current.toggleToolCheckbox('cursor'))
    act(() => result.current.toggleToolCheckbox('cursor'))
    expect(result.current.allSelected).toBe(true)
  })

  it('unchecking every agent falls back to all-selected rather than an empty dead end', () => {
    const { result } = renderHook(() => useAgentFilter(agents))
    act(() => result.current.toggleToolCheckbox('claude'))
    act(() => result.current.toggleToolCheckbox('cursor'))
    act(() => result.current.toggleToolCheckbox('gemini'))
    expect(result.current.allSelected).toBe(true)
  })
})

describe('useAgentFilter — selectAll', () => {
  it('resets to all-selected from any narrowed state', () => {
    const { result } = renderHook(() => useAgentFilter(agents))
    act(() => result.current.toggleTool('cursor'))
    expect(result.current.allSelected).toBe(false)
    act(() => result.current.selectAll())
    expect(result.current.allSelected).toBe(true)
    expect(result.current.selectedTools.size).toBe(3)
  })
})
