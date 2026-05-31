import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useUpdateCheck } from '../useUpdateCheck'

function mockRelease(tag: string, url = 'https://github.com/varkart/agentbar/releases/tag/' + tag) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ tag_name: tag, html_url: url }),
  }))
}

// Minimal in-memory localStorage to avoid jsdom environment quirks
function makeLocalStorage() {
  const store: Record<string, string> = {}
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { Object.keys(store).forEach(k => delete store[k]) },
  }
}

describe('useUpdateCheck', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const { result } = renderHook(() => useUpdateCheck('0.5.0'))
    await waitFor(() => {}, { timeout: 200 })
    expect(result.current).toBeNull()
  })

  it('returns null when latest equals current', async () => {
    mockRelease('v0.5.0')
    const { result } = renderHook(() => useUpdateCheck('0.5.0'))
    await waitFor(() => {}, { timeout: 200 })
    expect(result.current).toBeNull()
  })

  it('returns null when latest is older than current', async () => {
    mockRelease('v0.4.0')
    const { result } = renderHook(() => useUpdateCheck('0.5.0'))
    await waitFor(() => {}, { timeout: 200 })
    expect(result.current).toBeNull()
  })

  it('returns updateInfo when newer version available', async () => {
    mockRelease('v0.6.0', 'https://example.com/release')
    const { result } = renderHook(() => useUpdateCheck('0.5.0'))
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current?.latestVersion).toBe('v0.6.0')
    expect(result.current?.releaseUrl).toBe('https://example.com/release')
  })

  it('detects major version bump', async () => {
    mockRelease('v1.0.0')
    const { result } = renderHook(() => useUpdateCheck('0.5.0'))
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current?.latestVersion).toBe('v1.0.0')
  })

  it('returns null when response has no tag_name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ html_url: 'https://example.com' }),
    }))
    const { result } = renderHook(() => useUpdateCheck('0.5.0'))
    await waitFor(() => {}, { timeout: 200 })
    expect(result.current).toBeNull()
  })

  it('uses cache and skips second fetch within TTL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ tag_name: 'v0.6.0', html_url: 'https://example.com' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { unmount } = renderHook(() => useUpdateCheck('0.5.0'))
    await waitFor(() => {
      expect(localStorage.getItem('agentbar:updateCheck')).not.toBeNull()
    })
    unmount()

    const { result } = renderHook(() => useUpdateCheck('0.5.0'))
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('returns null when currentVersion is empty', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    const { result } = renderHook(() => useUpdateCheck(''))
    await waitFor(() => {}, { timeout: 200 })
    expect(result.current).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
