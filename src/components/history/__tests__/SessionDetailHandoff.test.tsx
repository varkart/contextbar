import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SessionDetail from '../SessionDetail'
import type { SessionEntry, HandoffCandidate, HandoffOutcome } from '../../../types'

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

const sessions: SessionEntry[] = [
  session,
  { ...session, sessionId: 's2', agent: 'codex' },
  { ...session, sessionId: 's3', agent: 'codex' },
]

const candidates: HandoffCandidate[] = [
  { agentId: 'codex', supportsCondensing: true, supportsSeeding: true, caveat: null },
  { agentId: 'opencode', supportsCondensing: true, supportsSeeding: false, caveat: 'Can’t be pre-seeded — you’ll paste it in yourself after it opens' },
]

const outcome: HandoffOutcome = {
  fileName: 'handoff-claude-to-codex-20260101-000000.md',
  condensed: true,
  launched: true,
  clipboardText: null,
  caveat: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'get_session') return Promise.resolve({ agent: 'claude', sessionId: 's1', messages: [], totalTokens: {}, model: null, durationMs: null, project: '/repo', projectName: 'repo', timestamp: Date.now() })
    if (cmd === 'get_session_meta') return Promise.resolve([])
    if (cmd === 'get_handoff_candidates') return Promise.resolve(candidates)
    if (cmd === 'generate_handoff') return Promise.resolve(outcome)
    return Promise.resolve(undefined)
  })
})

describe('SessionDetail handoff picker', () => {
  it('ranks candidates by how often this project actually uses each agent', async () => {
    render(<SessionDetail session={session} sessions={sessions} showToast={vi.fn()} />)
    fireEvent.click(await screen.findByLabelText('Hand off this session to a different agent'))

    await waitFor(() => expect(screen.getByText('Codex')).toBeInTheDocument())
    // codex has 2 sessions in the fixture vs opencode's 0 — should render first.
    const names = screen.getAllByText(/Codex|OpenCode/).map(el => el.textContent)
    expect(names[0]).toBe('Codex')
  })

  it('shows the caveat under an agent that cannot be pre-seeded', async () => {
    render(<SessionDetail session={session} sessions={sessions} showToast={vi.fn()} />)
    fireEvent.click(await screen.findByLabelText('Hand off this session to a different agent'))
    await waitFor(() => expect(screen.getByText(/paste it in yourself/)).toBeInTheDocument())
  })

  it('generates the handoff and reports success via the toast', async () => {
    const showToast = vi.fn()
    render(<SessionDetail session={session} sessions={sessions} showToast={showToast} />)
    fireEvent.click(await screen.findByLabelText('Hand off this session to a different agent'))
    await waitFor(() => expect(screen.getByText('Codex')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Codex'))

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('generate_handoff', {
        project: '/repo',
        sourceAgent: 'claude',
        sessionId: 's1',
        targetAgent: 'codex',
      })
    )
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('success', expect.stringContaining('codex')))
  })

  it('copies the briefing to the clipboard when the target cannot be pre-seeded', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_session') return Promise.resolve({ agent: 'claude', sessionId: 's1', messages: [], totalTokens: {}, model: null, durationMs: null, project: '/repo', projectName: 'repo', timestamp: Date.now() })
      if (cmd === 'get_session_meta') return Promise.resolve([])
      if (cmd === 'get_handoff_candidates') return Promise.resolve(candidates)
      if (cmd === 'generate_handoff') return Promise.resolve({ ...outcome, launched: true, clipboardText: 'the briefing', condensed: true })
      return Promise.resolve(undefined)
    })
    const showToast = vi.fn()
    render(<SessionDetail session={session} sessions={sessions} showToast={showToast} />)
    fireEvent.click(await screen.findByLabelText('Hand off this session to a different agent'))
    await waitFor(() => expect(screen.getByText('OpenCode')).toBeInTheDocument())

    fireEvent.click(screen.getByText('OpenCode'))

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('the briefing'))
  })
})
