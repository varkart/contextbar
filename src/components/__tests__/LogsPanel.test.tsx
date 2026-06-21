import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import LogsPanel from '../LogsPanel'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

import { invoke } from '@tauri-apps/api/core'
const mockInvoke = vi.mocked(invoke)

const mockEvents = [
  { id: 1, ts_ms: Date.now() - 60000, event_type: 'skill_toggled', tool_id: 'claude', item_name: 'impeccable', detail: null },
  { id: 2, ts_ms: Date.now() - 3600000, event_type: 'mcp_toggled',   tool_id: 'cursor', item_name: 'github',     detail: 'active→false' },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockResolvedValue(mockEvents)
})

describe('LogsPanel', () => {
  it('calls get_audit_log on mount', async () => {
    render(<LogsPanel onBack={vi.fn()} />)
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('get_audit_log', { limit: 200 }))
  })

  it('shows event item names after load', async () => {
    render(<LogsPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('impeccable')).toBeInTheDocument())
    expect(screen.getByText('github')).toBeInTheDocument()
  })

  it('shows event type badges', async () => {
    render(<LogsPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('skill toggled')).toBeInTheDocument())
    expect(screen.getByText('mcp toggled')).toBeInTheDocument()
  })

  it('shows tool IDs', async () => {
    render(<LogsPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('claude')).toBeInTheDocument())
    expect(screen.getByText('cursor')).toBeInTheDocument()
  })

  it('shows detail text when present', async () => {
    render(<LogsPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('active→false')).toBeInTheDocument())
  })

  it('shows empty state when no events', async () => {
    mockInvoke.mockResolvedValue([])
    render(<LogsPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('No activity yet')).toBeInTheDocument())
  })

  it('shows count after load', async () => {
    render(<LogsPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument())
  })
})
