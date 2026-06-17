import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useTools } from '../useTools'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(vi.fn())) }))
vi.mock('../analytics', () => ({ capture: vi.fn(), captureException: vi.fn() }))

import { invoke } from '@tauri-apps/api/core'
const mockInvoke = vi.mocked(invoke)

const mockTools = [
  { id: 'claude', name: 'Claude Code', version: '1.0', installed: true, skills: [], mcps: [], error: undefined },
  { id: 'cursor', name: 'Cursor', version: undefined, installed: false, skills: [], mcps: [], error: undefined },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockResolvedValue(mockTools)
})

describe('useTools', () => {
  it('starts with loading true', () => {
    mockInvoke.mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useTools())
    expect(result.current.loading).toBe(true)
  })

  it('fetches tools on mount', async () => {
    const { result } = renderHook(() => useTools())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tools).toEqual(mockTools)
  })

  it('sets lastUpdated after fetch', async () => {
    const { result } = renderHook(() => useTools())
    await waitFor(() => expect(result.current.lastUpdated).not.toBeNull())
  })

  it('loading becomes false after fetch', async () => {
    const { result } = renderHook(() => useTools())
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('cloudSyncing starts false', () => {
    const { result } = renderHook(() => useTools())
    expect(result.current.cloudSyncing).toBe(false)
  })

  it('fetchTools can be called manually and returns fresh tools', async () => {
    const { result } = renderHook(() => useTools())
    await waitFor(() => expect(result.current.loading).toBe(false))
    mockInvoke.mockResolvedValue([mockTools[0]])
    const fresh = await act(() => result.current.fetchTools())
    expect(result.current.tools).toEqual([mockTools[0]])
    expect(fresh).toEqual([mockTools[0]])
  })

  it('handles fetch error gracefully', async () => {
    mockInvoke.mockRejectedValue(new Error('IPC error'))
    const { result } = renderHook(() => useTools())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tools).toEqual([])
  })
})
