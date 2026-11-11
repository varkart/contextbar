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
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('kb_create', { kind: 'todo', title: 'Call back', body: '', tags: [] }))
    expect(onAdded).toHaveBeenCalled()
  })

  it('Tab switches to note mode and saves the text as the note body', async () => {
    render(<QuickAdd onAdded={vi.fn()} />)
    fireEvent.keyDown(screen.getByLabelText('Add a todo'), { key: 'Tab' })
    const input = screen.getByLabelText('Jot a note')
    fireEvent.change(input, { target: { value: 'idea' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('kb_create', { kind: 'note', title: '', body: 'idea', tags: [] }))
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
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('kb_create', { kind: 'note', title: '', body: 'idea', tags: [] }))
    expect(await screen.findByText('idea')).toBeInTheDocument()
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
      kind: 'todo', title: 'Fix flaky test', body: 'only on CI\nsee run 42', tags: [],
    }))
  })

  it('keeps every line of a note in the body', async () => {
    render(<QuickAdd onAdded={vi.fn()} />)
    fireEvent.click(screen.getByText('Note'))
    const input = screen.getByLabelText('Jot a note')
    fireEvent.change(input, { target: { value: 'line one\nline two' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('kb_create', { kind: 'note', title: '', body: 'line one\nline two', tags: [] }))
  })
})
