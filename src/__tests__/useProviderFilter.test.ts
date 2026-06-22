import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useProviderFilter } from '../hooks/useProviderFilter'
import type { AiTool } from '../types'

function makeTools(ids: string[], installed = true): AiTool[] {
  return ids.map(id => ({
    id,
    name: id,
    installed,
    supportsSkills: true,
    supportsMcps: true,
    skills: [],
    mcps: [],
  }))
}

describe('useProviderFilter', () => {
  it('returns only installed tools', () => {
    const tools = [...makeTools(['a', 'b']), ...makeTools(['c'], false)]
    const { result } = renderHook(() => useProviderFilter(tools))
    expect(result.current.installedTools).toHaveLength(2)
    expect(result.current.installedTools.map(t => t.id)).toEqual(['a', 'b'])
  })

  it('initializes selectedTools with all installed tool ids', () => {
    const { result } = renderHook(() => useProviderFilter(makeTools(['a', 'b', 'c'])))
    expect(result.current.selectedTools).toEqual(new Set(['a', 'b', 'c']))
  })

  it('allSelected is true when all installed tools selected', () => {
    const { result } = renderHook(() => useProviderFilter(makeTools(['a', 'b'])))
    expect(result.current.allSelected).toBe(true)
  })

  it('allSelected is false when any tool deselected', () => {
    const { result } = renderHook(() => useProviderFilter(makeTools(['a', 'b'])))
    act(() => result.current.toggleTool('a'))
    expect(result.current.allSelected).toBe(false)
  })

  it('toggleTool removes a selected tool', () => {
    const { result } = renderHook(() => useProviderFilter(makeTools(['a', 'b'])))
    act(() => result.current.toggleTool('a'))
    expect(result.current.selectedTools.has('a')).toBe(false)
    expect(result.current.selectedTools.has('b')).toBe(true)
  })

  it('toggleTool adds back a deselected tool', () => {
    const { result } = renderHook(() => useProviderFilter(makeTools(['a', 'b'])))
    act(() => result.current.toggleTool('a'))
    act(() => result.current.toggleTool('a'))
    expect(result.current.selectedTools.has('a')).toBe(true)
    expect(result.current.allSelected).toBe(true)
  })

  it('excludes uninstalled tools from installedTools', () => {
    const tools = [...makeTools(['x']), ...makeTools(['y', 'z'], false)]
    const { result } = renderHook(() => useProviderFilter(tools))
    expect(result.current.installedTools.map(t => t.id)).toEqual(['x'])
  })

  it('selectedTools only initializes with installed ids', () => {
    const tools = [...makeTools(['x']), ...makeTools(['y'], false)]
    const { result } = renderHook(() => useProviderFilter(tools))
    expect(result.current.selectedTools.has('y')).toBe(false)
  })
})
