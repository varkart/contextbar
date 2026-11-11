import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }))

import { invoke } from '@tauri-apps/api/core'
import KbSection from '../KbSection'
import { noteTitle, notePreview, duration, splitTodoText, type KbItem } from '../../kb'
import { toggleWrap, insertLink, continueList } from '../../noteEditing'
import type { Agent } from '../../types'

const mockInvoke = vi.mocked(invoke)

function item(over: Partial<KbItem>): KbItem {
  return {
    id: 'x', kind: 'todo', title: '', body: '', tags: [], shared: false,
    created: Date.now() - 3_600_000, updated: Date.now(), done: null, source: null, path: '/kb/x.md',
    ...over,
  }
}

const agent = (id: string, skills: string[] = []): Agent => ({
  id, name: id.toUpperCase(), installed: true, supportsSkills: true, supportsMcps: true, mcps: [],
  skills: skills.map(name => ({ name, path: `/s/${name}`, hasFullDescription: true, active: true, sourceId: 'x' })),
})

function setup(items: KbItem[], agents: Agent[] = []) {
  mockInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
    if (cmd === 'kb_list') return items
    if (cmd === 'kb_history') return []
    if (cmd === 'kb_set_done') {
      const { id, done } = args as { id: string; done: boolean }
      return { ...items.find(i => i.id === id)!, done: done ? Date.now() : null }
    }
    if (cmd === 'kb_create') {
      const { kind, title } = args as { kind: 'todo' | 'note'; title: string }
      return item({ id: 'new', kind, title })
    }
    if (cmd === 'kb_install_skill') return ['/a', '/b']
    return null
  })
  const showToast = vi.fn()
  render(<KbSection agents={agents} repoNames={['app']} showToast={showToast} />)
  return { showToast }
}

describe('KbSection', () => {
  beforeEach(() => {
    localStorage.clear()
    mockInvoke.mockReset()
  })

  it('lists open todos and hides archived until expanded', async () => {
    setup([item({ id: 'a', title: 'Open one' }), item({ id: 'b', title: 'Old one', done: Date.now() })])
    expect(await screen.findByText('Open one')).toBeInTheDocument()
    expect(screen.queryByText('Old one')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText(/Archived \(1\)/))
    expect(screen.getByText('Old one')).toBeInTheDocument()
  })

  it('completing a todo moves it to archived and offers undo', async () => {
    setup([item({ id: 'a', title: 'Ship it' })])
    fireEvent.click(await screen.findByLabelText('Mark done'))
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('kb_set_done', { id: 'a', done: true }))
    expect(await screen.findByText('Done: Ship it')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Undo'))
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('kb_set_done', { id: 'a', done: false }))
  })

  it('adds a todo on Enter', async () => {
    setup([])
    const input = await screen.findByPlaceholderText('Add a todo and press Enter')
    fireEvent.change(input, { target: { value: '  Write tests ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('kb_create', { kind: 'todo', title: 'Write tests', body: '', tags: [] }))
  })

  it('compact banner offers to install the skill for agents missing it', async () => {
    localStorage.setItem('contextbar:kb:sharing-guide-dismissed', '1')
    setup([item({ id: 'a', title: 'Shared', shared: true })], [agent('claude', ['context-bar']), agent('codex')])
    expect(await screen.findByText(/Readable by CLAUDE/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Add to 1 more'))
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('kb_install_skill', { agentIds: ['codex'] }))
  })

  it('teaching card shows on first visit with per-agent status, and Got it collapses it', async () => {
    setup([item({ id: 'a', title: 'Private' })], [agent('claude', ['context-bar']), agent('codex')])
    expect(await screen.findByText('One set of notes for all your agents')).toBeInTheDocument()
    expect(screen.getByText('CLAUDE ✓')).toBeInTheDocument()
    expect(screen.getByText('Add to 1 more')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Got it'))
    expect(screen.queryByText('One set of notes for all your agents')).not.toBeInTheDocument()
    expect(localStorage.getItem('contextbar:kb:sharing-guide-dismissed')).toBe('1')
    fireEvent.click(screen.getByText('How sharing works'))
    expect(screen.getByText('One set of notes for all your agents')).toBeInTheDocument()
  })
})

describe('kb helpers', () => {
  it('derives a note title from the first body line when untitled', () => {
    expect(noteTitle(item({ kind: 'note', body: '\n# Setup\nuse pnpm' }))).toBe('Setup')
    expect(notePreview(item({ kind: 'note', body: '# Setup\nuse pnpm' }))).toBe('use pnpm')
    expect(noteTitle(item({ kind: 'note' }))).toBe('Untitled note')
  })

  it('formats durations', () => {
    expect(duration(30_000)).toBe('1m')
    expect(duration(3 * 3_600_000)).toBe('3h')
    expect(duration(5 * 86_400_000)).toBe('5d')
  })
})

describe('note editing helpers', () => {
  it('wraps and unwraps bold', () => {
    const w = toggleWrap('make this bold', 5, 9, '**')
    expect(w).toEqual({ value: 'make **this** bold', start: 7, end: 11 })
    expect(toggleWrap(w.value, w.start, w.end, '**')).toEqual({ value: 'make this bold', start: 5, end: 9 })
  })

  it('inserts a placeholder when nothing is selected', () => {
    expect(toggleWrap('ab', 1, 1, '*')).toEqual({ value: 'a*text*b', start: 2, end: 6 })
  })

  it('builds a link with the url selected', () => {
    const r = insertLink('see docs', 4, 8)
    expect(r.value).toBe('see [docs](url)')
    expect(r.value.slice(r.start, r.end)).toBe('url')
  })

  it('continues bullets, numbers and checklists, and ends an empty item', () => {
    expect(continueList('- a', 3)?.value).toBe('- a\n- ')
    expect(continueList('1. a', 4)?.value).toBe('1. a\n2. ')
    expect(continueList('- [x] done', 10)?.value).toBe('- [x] done\n- [ ] ')
    expect(continueList('- a\n- ', 6)).toEqual({ value: '- a\n', start: 4, end: 4 })
    expect(continueList('plain', 5)).toBeNull()
  })

  it('splits multi-line todo text', () => {
    expect(splitTodoText(' Title \n\nmore\nlines ')).toEqual({ title: 'Title', body: 'more\nlines' })
  })
})
