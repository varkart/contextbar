import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }))

import { invoke } from '@tauri-apps/api/core'
import KbSection from '../KbSection'
import { noteTitle, notePreview, duration, type KbItem } from '../../kb'
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

  it('offers to install the skill for agents missing it once something is shared', async () => {
    setup([item({ id: 'a', title: 'Shared', shared: true })], [agent('claude', ['context-bar']), agent('codex')])
    expect(await screen.findByText(/Readable by CLAUDE/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Add to 1 more'))
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('kb_install_skill', { agentIds: ['codex'] }))
  })

  it('shows no skill banner when nothing is shared and no agent has the skill', async () => {
    setup([item({ id: 'a', title: 'Private' })], [agent('claude')])
    await screen.findByText('Private')
    expect(screen.queryByText(/Install skill/)).not.toBeInTheDocument()
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
