import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listen } from '@tauri-apps/api/event'
import { sendNotification } from '@tauri-apps/plugin-notification'
import { useToolsDiff } from '../useToolsDiff'

vi.mock('@tauri-apps/api/event')
vi.mock('@tauri-apps/plugin-notification')

type DiffPayload = {
  addedSkills: { toolName: string; itemName: string }[]
  removedSkills: { toolName: string; itemName: string }[]
  addedMcps: { toolName: string; itemName: string }[]
  removedMcps: { toolName: string; itemName: string }[]
}

const emptyDiff = (): DiffPayload => ({
  addedSkills: [],
  removedSkills: [],
  addedMcps: [],
  removedMcps: [],
})

describe('useToolsDiff', () => {
  let capturedCallback: ((event: { payload: DiffPayload }) => Promise<void>) | null = null
  let unlisten: ReturnType<typeof vi.fn>

  beforeEach(() => {
    capturedCallback = null
    unlisten = vi.fn()
    vi.mocked(listen).mockImplementation((_event, cb) => {
      capturedCallback = cb as typeof capturedCallback
      return Promise.resolve(unlisten as unknown as () => void)
    })
    vi.mocked(sendNotification).mockReset()
  })

  it('registers listener on mount', async () => {
    renderHook(() => useToolsDiff())
    await act(async () => {})
    expect(listen).toHaveBeenCalledWith('tools-diff', expect.any(Function))
  })

  it('calls unlisten on unmount', async () => {
    const { unmount } = renderHook(() => useToolsDiff())
    await act(async () => {})
    unmount()
    expect(unlisten).toHaveBeenCalled()
  })

  it('does nothing when diff is empty', async () => {
    renderHook(() => useToolsDiff())
    await act(async () => {})
    await act(async () => {
      await capturedCallback?.({ payload: emptyDiff() })
    })
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('sends single notification for one added skill', async () => {
    renderHook(() => useToolsDiff())
    await act(async () => {})
    await act(async () => {
      await capturedCallback?.({
        payload: {
          ...emptyDiff(),
          addedSkills: [{ toolName: 'Claude Code', itemName: 'impeccable' }],
        },
      })
    })
    expect(sendNotification).toHaveBeenCalledWith({
      title: 'aicontextbar',
      body: 'Claude Code: skill "impeccable" added',
    })
  })

  it('sends single notification for one added MCP', async () => {
    renderHook(() => useToolsDiff())
    await act(async () => {})
    await act(async () => {
      await capturedCallback?.({
        payload: {
          ...emptyDiff(),
          addedMcps: [{ toolName: 'Cursor', itemName: 'github' }],
        },
      })
    })
    expect(sendNotification).toHaveBeenCalledWith({
      title: 'aicontextbar',
      body: 'Cursor: MCP "github" added',
    })
  })

  it('sends summary notification for multiple changes', async () => {
    renderHook(() => useToolsDiff())
    await act(async () => {})
    await act(async () => {
      await capturedCallback?.({
        payload: {
          addedSkills: [{ toolName: 'Claude Code', itemName: 'skill-a' }],
          removedSkills: [{ toolName: 'Cursor', itemName: 'skill-b' }],
          addedMcps: [{ toolName: 'Claude Code', itemName: 'github' }],
          removedMcps: [],
        },
      })
    })
    expect(sendNotification).toHaveBeenCalledWith({
      title: 'aicontextbar',
      body: '3 changes detected',
    })
  })
})
