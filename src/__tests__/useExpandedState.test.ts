import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useExpandedState } from '../useExpandedState'

const STORAGE_KEY = 'aicontextbar:expandedTools'

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY)
})

describe('useExpandedState', () => {
  it('starts empty when localStorage is empty', () => {
    const { result } = renderHook(() => useExpandedState())
    expect(result.current.expanded.size).toBe(0)
  })

  it('loads previously saved ids from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['claude', 'cursor']))
    const { result } = renderHook(() => useExpandedState())
    expect(result.current.expanded.has('claude')).toBe(true)
    expect(result.current.expanded.has('cursor')).toBe(true)
  })

  it('toggle adds an id that was not present', () => {
    const { result } = renderHook(() => useExpandedState())
    act(() => result.current.toggle('claude'))
    expect(result.current.expanded.has('claude')).toBe(true)
  })

  it('toggle removes an id that was already present', () => {
    const { result } = renderHook(() => useExpandedState())
    act(() => result.current.toggle('claude'))
    act(() => result.current.toggle('claude'))
    expect(result.current.expanded.has('claude')).toBe(false)
  })

  it('persists changes to localStorage', () => {
    const { result } = renderHook(() => useExpandedState())
    act(() => result.current.toggle('claude'))
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    expect(stored).toContain('claude')
  })

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json{{{')
    expect(() => renderHook(() => useExpandedState())).not.toThrow()
    const { result } = renderHook(() => useExpandedState())
    expect(result.current.expanded.size).toBe(0)
  })

  it('multiple ids can be expanded simultaneously', () => {
    const { result } = renderHook(() => useExpandedState())
    act(() => result.current.toggle('claude'))
    act(() => result.current.toggle('cursor'))
    expect(result.current.expanded.has('claude')).toBe(true)
    expect(result.current.expanded.has('cursor')).toBe(true)
  })
})
