import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme } from '../useTheme'

const STORAGE_KEY = 'llmmanager:theme'

function mockMatchMedia(matches: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = []
  const mq = {
    matches,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => { listeners.push(cb) },
    removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
      const idx = listeners.indexOf(cb); if (idx > -1) listeners.splice(idx, 1)
    },
    dispatchChange: (m: boolean) => { mq.matches = m; listeners.forEach(cb => cb({ matches: m })) },
  }
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => mq) })
  return mq
}

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY)
  document.documentElement.classList.remove('dark')
  mockMatchMedia(false)
})

describe('useTheme', () => {
  it('defaults to system when nothing stored', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('system')
  })

  it('loads stored preference from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'dark')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
  })

  it('setTheme persists to localStorage', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setTheme('light'))
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light')
  })

  it('setTheme dark adds dark class to documentElement', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setTheme('dark'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('setTheme light removes dark class from documentElement', () => {
    document.documentElement.classList.add('dark')
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setTheme('light'))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('system preference dark → adds dark class', () => {
    mockMatchMedia(true)
    renderHook(() => useTheme())
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('system preference light → no dark class', () => {
    mockMatchMedia(false)
    renderHook(() => useTheme())
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('system mode reacts to media query change', () => {
    const mq = mockMatchMedia(false)
    renderHook(() => useTheme())
    act(() => mq.dispatchChange(true))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
