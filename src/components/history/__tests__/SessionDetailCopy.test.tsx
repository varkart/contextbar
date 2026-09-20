import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SessionDetail from '../SessionDetail'
import type { SessionEntry } from '../../../types'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
import { invoke } from '@tauri-apps/api/core'
const mockInvoke = vi.mocked(invoke)

const session: SessionEntry = {
  agent: 'claude',
  sessionId: 's1',
  display: 'Fix the login bug',
  timestamp: Date.now(),
  project: '/repo',
  projectName: 'repo',
  totalTokens: 1000,
  model: 'claude-sonnet-5',
  durationMinutes: 5,
  isLive: false,
  errorCount: 0,
  promptCount: 3,
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'get_session') return Promise.resolve({ agent: 'claude', sessionId: 's1', messages: [], totalTokens: {}, model: null, durationMs: null, project: '/repo', projectName: 'repo', timestamp: Date.now() })
    if (cmd === 'get_session_meta') return Promise.resolve([])
    if (cmd === 'get_resume_command') return Promise.resolve("cd '/repo' && claude --resume s1")
    return Promise.resolve(undefined)
  })
})

describe('SessionDetail copy-resume-command button', () => {
  it('writes the prefetched command to the clipboard synchronously on click', async () => {
    render(<SessionDetail session={session} />)

    // Let the prefetch (get_resume_command) resolve before clicking — this
    // is the fix: the fetch happens up front, not inside the click handler.
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('get_resume_command', { project: '/repo', sessionId: 's1', agent: 'claude' })
    )

    fireEvent.click(screen.getByLabelText('Copy resume command'))

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("cd '/repo' && claude --resume s1")
    await waitFor(() => expect(screen.getByLabelText('Copy resume command')).toHaveTextContent('✓'))
  })

  it('does nothing if clicked before the prefetch resolves', () => {
    // Resolve get_resume_command on a promise that never settles within this test.
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_session') return Promise.resolve({ agent: 'claude', sessionId: 's1', messages: [], totalTokens: {}, model: null, durationMs: null, project: '/repo', projectName: 'repo', timestamp: Date.now() })
      if (cmd === 'get_session_meta') return Promise.resolve([])
      if (cmd === 'get_resume_command') return new Promise(() => {})
      return Promise.resolve(undefined)
    })
    render(<SessionDetail session={session} />)

    fireEvent.click(screen.getByLabelText('Copy resume command'))

    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  })
})
