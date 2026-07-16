import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import CommandPalette, { fuzzyMatch, buildPaletteItems } from '../CommandPalette'
import type { SessionEntry, RepoWorktrees } from '../../types'

function session(overrides: Partial<SessionEntry> = {}): SessionEntry {
  return {
    agent: 'claude',
    sessionId: 's1',
    display: 'fix the login bug',
    timestamp: Date.now(),
    project: '/Users/test/alpha',
    projectName: 'alpha',
    totalTokens: 0,
    isLive: false,
    errorCount: 0,
    promptCount: 1,
    ...overrides,
  }
}

function repo(overrides: Partial<RepoWorktrees> = {}): RepoWorktrees {
  return {
    repoName: 'alpha',
    repoPath: '/Users/test/alpha',
    baseBranch: 'main',
    worktrees: [],
    agentFiles: [],
    repoSkills: [],
    ...overrides,
  }
}

describe('fuzzyMatch', () => {
  it('matches when all chars appear in order', () => {
    expect(fuzzyMatch('ssn', 'Sessions').ok).toBe(true)
  })
  it('fails when a char is missing', () => {
    expect(fuzzyMatch('xyz', 'Sessions').ok).toBe(false)
  })
  it('fails when chars are out of order', () => {
    expect(fuzzyMatch('nose', 'Sessions').ok).toBe(false)
  })
  it('empty query matches everything with no highlighted indices', () => {
    expect(fuzzyMatch('', 'Sessions')).toEqual({ ok: true, idx: [] })
  })
  it('is case-insensitive', () => {
    expect(fuzzyMatch('SESS', 'sessions').ok).toBe(true)
  })
})

describe('buildPaletteItems', () => {
  const handlers = { goTo: vi.fn(), openSession: vi.fn(), viewSessionsForRepo: vi.fn() }

  it('includes all 8 static sections', () => {
    const items = buildPaletteItems([], [], handlers)
    expect(items.filter(i => i.group === 'Go to')).toHaveLength(8)
  })

  it('caps session items at 30, most recent first', () => {
    const sessions = Array.from({ length: 40 }, (_, i) =>
      session({ sessionId: `s${i}`, timestamp: i })
    )
    const items = buildPaletteItems(sessions, [], handlers)
    const sessionItems = items.filter(i => i.group === 'Sessions')
    expect(sessionItems).toHaveLength(30)
    expect(sessionItems[0].id).toBe('session-s39')
  })

  it('maps repos to Repos group items with worktree count in sub', () => {
    const items = buildPaletteItems([], [repo({ worktrees: [{ path: '/a', isPrimary: true, isDetached: false, isDirty: false, ahead: 0, behind: 0, isMerged: false }] })], handlers)
    const repoItems = items.filter(i => i.group === 'Repos')
    expect(repoItems).toHaveLength(1)
    expect(repoItems[0].sub).toBe('1 worktree')
  })

  it('invokes the right handler when an item action runs', () => {
    const s = session()
    const items = buildPaletteItems([s], [], handlers)
    const item = items.find(i => i.id === 'session-s1')!
    item.action()
    expect(handlers.openSession).toHaveBeenCalledWith(s)
  })
})

describe('CommandPalette component', () => {
  const items = [
    { id: 'a', group: 'Go to' as const, title: 'Sessions', sub: 'History', action: vi.fn() },
    { id: 'b', group: 'Go to' as const, title: 'Repos', sub: 'Worktrees', action: vi.fn() },
  ]

  it('renders nothing when closed', () => {
    render(<CommandPalette open={false} onClose={vi.fn()} items={items} />)
    expect(screen.queryByPlaceholderText(/Search sessions/)).not.toBeInTheDocument()
  })

  it('shows all items when open with an empty query', () => {
    render(<CommandPalette open={true} onClose={vi.fn()} items={items} />)
    expect(screen.getByText('Sessions')).toBeInTheDocument()
    expect(screen.getByText('Repos')).toBeInTheDocument()
  })

  it('filters items as the user types', () => {
    render(<CommandPalette open={true} onClose={vi.fn()} items={items} />)
    fireEvent.change(screen.getByPlaceholderText(/Search sessions/), { target: { value: 'rep' } })
    expect(screen.getByRole('button')).toHaveTextContent('Repos')
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('closes and runs the action on Enter', () => {
    const onClose = vi.fn()
    render(<CommandPalette open={true} onClose={onClose} items={items} />)
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onClose).toHaveBeenCalled()
    expect(items[0].action).toHaveBeenCalled()
  })

  it('closes on Escape without running an action', () => {
    const onClose = vi.fn()
    render(<CommandPalette open={true} onClose={onClose} items={items} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
