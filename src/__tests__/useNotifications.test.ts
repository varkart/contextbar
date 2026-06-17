import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useNotifications } from '../useNotifications'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(vi.fn())) }))

import { invoke } from '@tauri-apps/api/core'
const mockInvoke = vi.mocked(invoke)

const mockNotifications = [
  { id: 1, title: 'Update available', body: 'v1.1.0 ready', level: 'info', ts_ms: Date.now() },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockResolvedValue(mockNotifications)
})

describe('useNotifications', () => {
  it('starts with empty notifications', () => {
    mockInvoke.mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useNotifications())
    expect(result.current.notifications).toEqual([])
  })

  it('fetches notifications on mount', async () => {
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.notifications).toEqual(mockNotifications))
  })

  it('handles fetch error silently', async () => {
    mockInvoke.mockRejectedValue(new Error('DB error'))
    const { result } = renderHook(() => useNotifications())
    await act(async () => {})
    expect(result.current.notifications).toEqual([])
  })

  it('fetchNotifications refreshes data', async () => {
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.notifications).toEqual(mockNotifications))
    mockInvoke.mockResolvedValue([])
    await act(() => result.current.fetchNotifications())
    expect(result.current.notifications).toEqual([])
  })
})
