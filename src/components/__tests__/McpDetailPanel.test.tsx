import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import McpDetailPanel from '../McpDetailPanel'
import type { McpServer } from '../../types'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('../../analytics', () => ({ capture: vi.fn(), captureException: vi.fn() }))

import { invoke } from '@tauri-apps/api/core'
const mockInvoke = vi.mocked(invoke)

const baseMcp: McpServer = {
  name: 'github',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
  active: true,
  hasSecrets: true,
  secretKeyNames: ['GITHUB_TOKEN'],
  sourceId: 'settings_json',
}

beforeEach(() => {
  mockInvoke.mockReset()
})

describe('McpDetailPanel', () => {
  it('shows skeleton while loading', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    const { container } = render(<McpDetailPanel mcp={baseMcp} onBack={vi.fn()} />)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('renders mcp name in header', async () => {
    mockInvoke.mockResolvedValue([])
    render(<McpDetailPanel mcp={baseMcp} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.queryByText(/live tools \(/i)).toBeInTheDocument())
    expect(screen.getByText('github')).toBeInTheDocument()
  })

  it('renders tool list after invoke resolves', async () => {
    mockInvoke.mockResolvedValue([
      { name: 'search_repositories', description: 'Search GitHub repos' },
      { name: 'create_issue', description: 'Create an issue' },
    ])
    render(<McpDetailPanel mcp={baseMcp} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('search_repositories')).toBeInTheDocument())
    expect(screen.getByText('create_issue')).toBeInTheDocument()
  })

  it('shows error when invoke fails', async () => {
    mockInvoke.mockRejectedValue(new Error('connection refused'))
    render(<McpDetailPanel mcp={baseMcp} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/connection refused/i)).toBeInTheDocument())
  })

  it('back button calls onBack', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    const onBack = vi.fn()
    render(<McpDetailPanel mcp={baseMcp} onBack={onBack} />)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('shows toolName breadcrumb when provided', async () => {
    mockInvoke.mockResolvedValue([])
    render(<McpDetailPanel mcp={baseMcp} onBack={vi.fn()} toolName="Claude Code" />)
    await waitFor(() => expect(screen.queryByText(/live tools \(/i)).toBeInTheDocument())
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })

  it('expanding a tool item reveals its description', async () => {
    mockInvoke.mockResolvedValue([
      { name: 'search_repos', description: 'Searches GitHub repositories' },
    ])
    render(<McpDetailPanel mcp={baseMcp} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('search_repos')).toBeInTheDocument())
    expect(screen.queryByText('Searches GitHub repositories')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('search_repos'))
    expect(screen.getByText('Searches GitHub repositories')).toBeInTheDocument()
  })

  it('invokes query_mcp_tools with correct command and args', async () => {
    mockInvoke.mockResolvedValue([])
    render(<McpDetailPanel mcp={baseMcp} onBack={vi.fn()} />)
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled())
    expect(mockInvoke).toHaveBeenCalledWith('query_mcp_tools', {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
    })
  })
})
