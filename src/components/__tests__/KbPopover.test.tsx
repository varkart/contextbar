import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }))

import { invoke } from '@tauri-apps/api/core'
import KbPopoverView, { KbTile, QuickAdd } from '../KbPopover'
import type { KbItem } from '../../kb'

const mockInvoke = vi.mocked(invoke)

const item = (over: Partial<KbItem>): KbItem => ({
  id: 'x', kind: 'todo', title: '', body: '', tags: [], shared: false,
  created: Date.now(), updated: Date.now(), done: null, source: null, path: '', ...over,
})

describe('QuickAdd', () => {
  beforeEach(() => { mockInvoke.mockReset(); mockInvoke.mockResolvedValue(item({ id: 'n' })) })

  it('adds a todo on Enter', async () => {
    const onAdded = vi.fn()
    render(<QuickAdd onAdded={onAdded} />)
    const input = screen.getByLabelText('Add a todo')
    fireEvent.change(input, { target: { value: 'Call back' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('kb_create', { kind: 'todo', title: 'Call back', body: '', tags: [], tzOffset: expect.any(Number) }))
    expect(onAdded).toHaveBeenCalled()
  })

  it('Tab switches to note mode and saves the text as the note body', async () => {
    render(<QuickAdd onAdded={vi.fn()} />)
    fireEvent.keyDown(screen.getByLabelText('Add a todo'), { key: 'Tab' })
    const input = screen.getByLabelText('Jot a note')
    fireEvent.change(input, { target: { value: 'idea' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('kb_create', { kind: 'note', title: '', body: 'idea', tags: [], tzOffset: expect.any(Number) }))
  })
})

describe('KbTile', () => {
  it('shows the open count and note count', () => {
    render(<KbTile loading={false} onClick={vi.fn()} items={[
      item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c', done: Date.now() }), item({ id: 'n', kind: 'note' }),
    ]} />)
    expect(screen.getByText('2 open')).toBeInTheDocument()
    expect(screen.getByText(/1 note$/)).toBeInTheDocument()
  })
})

describe('KbPopoverView', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('completes a todo', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'kb_list') return [item({ id: 'a', title: 'Reply to PR' })]
      if (cmd === 'kb_set_done') return item({ id: 'a', title: 'Reply to PR', done: Date.now() })
      return null
    })
    render(<KbPopoverView />)
    fireEvent.click(await screen.findByLabelText('Mark done: Reply to PR'))
    await waitFor(() => expect(screen.queryByText('Reply to PR')).not.toBeInTheDocument())
    expect(screen.getByText(/Archived \(1\)/)).toBeInTheDocument()
  })
})

describe('KbPopoverView notes', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('adds a note from the Notes tab', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'kb_list') return []
      if (cmd === 'kb_create') return item({ id: 'n', kind: 'note', body: 'idea' })
      return null
    })
    render(<KbPopoverView />)
    fireEvent.click(screen.getByText(/^Notes/))
    const input = screen.getByLabelText('Jot a note')
    fireEvent.change(input, { target: { value: 'idea' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('kb_create', { kind: 'note', title: '', body: 'idea', tags: [], tzOffset: expect.any(Number) }))
    expect(await screen.findByText('idea')).toBeInTheDocument()
  })
  it('renders note previews instead of raw markdown', async () => {
    mockInvoke.mockImplementation(async (cmd: string) =>
      cmd === 'kb_list' ? [item({ id: 'n', kind: 'note', title: 'Plan', body: '- [ ] ship **today**' })] : null)
    render(<KbPopoverView />)
    fireEvent.click(screen.getByText(/^Notes/))
    const strong = await screen.findByText('today')
    expect(strong.tagName).toBe('STRONG')
    expect(strong.parentElement?.textContent).toContain('☐ ship today')
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument()
  })
})

describe('multi-line input', () => {
  beforeEach(() => { mockInvoke.mockReset(); mockInvoke.mockResolvedValue(item({ id: 'n' })) })

  it('Shift+Enter does not submit; Enter saves first line as title, rest as details', async () => {
    render(<QuickAdd onAdded={vi.fn()} />)
    const input = screen.getByLabelText('Add a todo')
    expect(input.tagName).toBe('TEXTAREA')
    fireEvent.change(input, { target: { value: 'Fix flaky test\nonly on CI\nsee run 42' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(mockInvoke).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('kb_create', {
      kind: 'todo', title: 'Fix flaky test', body: 'only on CI\nsee run 42', tags: [], tzOffset: expect.any(Number),
    }))
  })

  it('keeps every line of a note in the body', async () => {
    render(<QuickAdd onAdded={vi.fn()} />)
    fireEvent.click(screen.getByText('Note'))
    const input = screen.getByLabelText('Jot a note')
    fireEvent.change(input, { target: { value: 'line one\nline two' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('kb_create', { kind: 'note', title: '', body: 'line one\nline two', tags: [], tzOffset: expect.any(Number) }))
  })
})

describe('KbPopoverView list tools', () => {
  beforeEach(() => { mockInvoke.mockReset(); localStorage.clear() })

  const serve = (list: KbItem[]) => mockInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
    if (cmd === 'kb_list') return list
    if (cmd === 'kb_update') {
      const { id, patch } = args as { id: string; patch: object }
      return { ...list.find(i => i.id === id)!, ...patch }
    }
    if (cmd === 'kb_set_shared') {
      const { items, shared } = args as { items: { id: string }[]; shared: boolean }
      return items.map(r => ({ ...list.find(i => i.id === r.id)!, shared }))
    }
    return null
  })

  it('expands a todo to show rendered details', async () => {
    serve([item({ id: 'a', title: 'Deploy', body: 'run **migrations**' })])
    render(<KbPopoverView />)
    fireEvent.click(await screen.findByText('Deploy'))
    expect(screen.getByText('migrations').tagName).toBe('STRONG')
    expect(screen.getByText('Edit in window ⤢')).toBeInTheDocument()
  })

  it('expands a note in place', async () => {
    serve([item({ id: 'n', kind: 'note', title: 'Style', body: '# Rules\n- use pnpm' })])
    render(<KbPopoverView />)
    fireEvent.click(screen.getByText(/^Notes/))
    fireEvent.click(await screen.findByText('Style'))
    expect(screen.getByRole('heading', { name: 'Rules' })).toBeInTheDocument()
    expect(screen.getByText('use pnpm').tagName).toBe('LI')
  })

  it('shares one item, and all matching items at once', async () => {
    serve([item({ id: 'a', title: 'One' }), item({ id: 'b', title: 'Two' })])
    render(<KbPopoverView />)
    await screen.findByText('One')
    fireEvent.click(screen.getAllByText('Share')[0])
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('kb_update', expect.objectContaining({ patch: { shared: true } })))
    fireEvent.click(screen.getByText(/Share all \(/))
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('kb_set_shared', expect.objectContaining({ shared: true })))
  })

  it('searches, filters by sharing and pages', async () => {
    const many = Array.from({ length: 25 }, (_, i) => item({ id: `t${i}`, title: `Task ${i}`, created: 1000 + i }))
    serve([...many, item({ id: 's', title: 'Secret plan', shared: true, created: 1 })])
    render(<KbPopoverView />)
    await screen.findByText('Task 24')
    expect(screen.queryByText('Task 4')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText(/Show 6 more/))
    expect(screen.getByText('Task 4')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'secret' } })
    expect(screen.getByText('Secret plan')).toBeInTheDocument()
    expect(screen.queryByText('Task 24')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Filter by sharing'), { target: { value: 'shared' } })
    expect(screen.getByText('1 of 26')).toBeInTheDocument()
  })
})
