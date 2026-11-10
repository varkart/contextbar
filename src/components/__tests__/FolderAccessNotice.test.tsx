import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

import { invoke } from '@tauri-apps/api/core'
import FolderAccessNotice, { isFolderAccessError } from '../FolderAccessNotice'
const mockInvoke = vi.mocked(invoke)

beforeEach(() => mockInvoke.mockReset())

describe('isFolderAccessError', () => {
  it('matches the macOS EPERM message', () => {
    expect(isFolderAccessError('Operation not permitted (os error 1)')).toBe(true)
  })
  it('ignores other errors', () => {
    expect(isFolderAccessError('No such file or directory (os error 2)')).toBe(false)
    expect(isFolderAccessError('path outside home (os error 13)')).toBe(false)
  })
})

describe('FolderAccessNotice', () => {
  it('retries once macOS grants access', async () => {
    mockInvoke.mockResolvedValueOnce(true)
    const onRetry = vi.fn()
    render(<FolderAccessNotice path="/Users/x/.claude/skills/s" onRetry={onRetry} />)
    fireEvent.click(screen.getByText('Allow access'))
    await waitFor(() => expect(onRetry).toHaveBeenCalled())
    expect(mockInvoke).toHaveBeenCalledWith('request_folder_access', { path: '/Users/x/.claude/skills/s' })
  })

  it('offers System Settings when still blocked', async () => {
    mockInvoke.mockResolvedValueOnce(false)
    const onRetry = vi.fn()
    render(<FolderAccessNotice path="/p" onRetry={onRetry} />)
    fireEvent.click(screen.getByText('Allow access'))
    await screen.findByText('Open System Settings')
    expect(onRetry).not.toHaveBeenCalled()
    mockInvoke.mockResolvedValueOnce(undefined)
    fireEvent.click(screen.getByText('Open System Settings'))
    expect(mockInvoke).toHaveBeenLastCalledWith('open_files_and_folders_settings')
  })
})
