import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import McpDetailPanel from '../McpDetailPanel'
import type { McpServer, McpTool, NpmInstallState } from '../../types'

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

const notInstalledState: NpmInstallState = {
  package: '@modelcontextprotocol/server-github',
  installedVersion: null,
  isNpx: true,
}

const installedState: NpmInstallState = {
  package: '@modelcontextprotocol/server-github',
  installedVersion: '1.2.3',
  isNpx: true,
}

function defaultMocks(installState: NpmInstallState = notInstalledState, tools: McpTool[] = []) {
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'get_mcp_install_state') return Promise.resolve(installState)
    if (cmd === 'query_mcp_tools') return Promise.resolve(tools)
    return Promise.resolve(null)
  })
}

beforeEach(() => {
  mockInvoke.mockReset()
})

describe('McpDetailPanel', () => {
  it('shows spinner while loading', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    const { container } = render(<McpDetailPanel mcp={baseMcp} onBack={vi.fn()} />)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('renders tool list after invoke resolves', async () => {
    defaultMocks(notInstalledState, [
      { name: 'search_repositories', description: 'Search GitHub repos' },
      { name: 'create_issue', description: 'Create an issue' },
    ])
    render(<McpDetailPanel mcp={baseMcp} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('search_repositories')).toBeInTheDocument())
    expect(screen.getByText('create_issue')).toBeInTheDocument()
  })

  it('shows error when invoke fails', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_mcp_install_state') return Promise.resolve(notInstalledState)
      return Promise.reject(new Error('connection refused'))
    })
    render(<McpDetailPanel mcp={baseMcp} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/connection refused/i)).toBeInTheDocument())
  })

  it('expanding a tool item reveals its description', async () => {
    defaultMocks(notInstalledState, [
      { name: 'search_repos', description: 'Searches GitHub repositories' },
    ])
    render(<McpDetailPanel mcp={baseMcp} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('search_repos')).toBeInTheDocument())
    expect(screen.queryByText('Searches GitHub repositories')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('search_repos'))
    expect(screen.getByText('Searches GitHub repositories')).toBeInTheDocument()
  })

  it('invokes query_mcp_tools with correct command and args', async () => {
    defaultMocks()
    render(<McpDetailPanel mcp={baseMcp} onBack={vi.fn()} />)
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('query_mcp_tools', {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      url: null,
    }))
  })
})

describe('NpmInstallSection', () => {
  it('shows package name for npx MCPs', async () => {
    defaultMocks()
    render(<McpDetailPanel mcp={baseMcp} onBack={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByText('@modelcontextprotocol/server-github')).toBeInTheDocument()
    )
  })

  it('shows "not installed" when installedVersion is null and no auto-download flag', async () => {
    const noFlagMcp: McpServer = { ...baseMcp, args: ['@modelcontextprotocol/server-github'] }
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_mcp_install_state') return Promise.resolve(notInstalledState)
      return Promise.resolve([])
    })
    render(<McpDetailPanel mcp={noFlagMcp} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('not installed')).toBeInTheDocument())
  })

  it('shows Install button when not installed', async () => {
    defaultMocks()
    render(<McpDetailPanel mcp={baseMcp} onBack={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /install package/i })).toBeInTheDocument()
    )
  })

  it('shows version badge when installed', async () => {
    defaultMocks(installedState)
    render(<McpDetailPanel mcp={baseMcp} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('v1.2.3')).toBeInTheDocument())
    expect(screen.queryByText('not installed')).not.toBeInTheDocument()
  })

  it('shows "check for updates" button when installed', async () => {
    defaultMocks(installedState)
    render(<McpDetailPanel mcp={baseMcp} onBack={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /check for updates/i })).toBeInTheDocument()
    )
  })

  it('hides install section for non-npx MCPs', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_mcp_install_state')
        return Promise.resolve({ package: null, installedVersion: null, isNpx: false })
      return Promise.resolve([])
    })
    const nodeMcp: McpServer = { ...baseMcp, command: 'node', args: ['server.js'] }
    render(<McpDetailPanel mcp={nodeMcp} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.queryByText(/live tools/i)).toBeInTheDocument())
    expect(screen.queryByText('not installed')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /install/i })).not.toBeInTheDocument()
  })

  it('Install button calls install_mcp_npm with correct args', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_mcp_install_state') return Promise.resolve(notInstalledState)
      if (cmd === 'install_mcp_npm') return Promise.resolve('1.2.3')
      return Promise.resolve([])
    })
    render(<McpDetailPanel mcp={baseMcp} onBack={vi.fn()} agentId="claude" />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /install package/i })).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole('button', { name: /install package/i }))
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('install_mcp_npm', {
        agentId: 'claude',
        mcpName: 'github',
        packageName: '@modelcontextprotocol/server-github',
      })
    )
  })

  it('updates displayed version after successful install', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_mcp_install_state') return Promise.resolve(notInstalledState)
      if (cmd === 'install_mcp_npm') return Promise.resolve('1.3.0')
      return Promise.resolve([])
    })
    render(<McpDetailPanel mcp={baseMcp} onBack={vi.fn()} />)
    await waitFor(() => screen.getByRole('button', { name: /install package/i }))
    fireEvent.click(screen.getByRole('button', { name: /install package/i }))
    await waitFor(() => expect(screen.getByText('v1.3.0')).toBeInTheDocument())
    expect(screen.queryByText('not installed')).not.toBeInTheDocument()
  })

  it('shows error message when install fails', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_mcp_install_state') return Promise.resolve(notInstalledState)
      if (cmd === 'install_mcp_npm') return Promise.reject(new Error('npm not found on this system'))
      return Promise.resolve([])
    })
    render(<McpDetailPanel mcp={baseMcp} onBack={vi.fn()} />)
    await waitFor(() => screen.getByRole('button', { name: /install package/i }))
    fireEvent.click(screen.getByRole('button', { name: /install package/i }))
    await waitFor(() =>
      expect(screen.getByText(/npm not found on this system/i)).toBeInTheDocument()
    )
  })

  it('check for updates calls get_mcp_npm_latest', async () => {
    defaultMocks(installedState)
    render(<McpDetailPanel mcp={baseMcp} onBack={vi.fn()} />)
    await waitFor(() => screen.getByRole('button', { name: /check for updates/i }))
    fireEvent.click(screen.getByRole('button', { name: /check for updates/i }))
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('get_mcp_npm_latest', {
        packageName: '@modelcontextprotocol/server-github',
      })
    )
  })

  it('shows "up to date" when latest matches installed', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_mcp_install_state') return Promise.resolve(installedState)
      if (cmd === 'get_mcp_npm_latest') return Promise.resolve('1.2.3')
      return Promise.resolve([])
    })
    render(<McpDetailPanel mcp={baseMcp} onBack={vi.fn()} />)
    await waitFor(() => screen.getByRole('button', { name: /check for updates/i }))
    fireEvent.click(screen.getByRole('button', { name: /check for updates/i }))
    await waitFor(() => expect(screen.getByText('up to date')).toBeInTheDocument())
  })

  it('shows Update button when newer version available', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_mcp_install_state') return Promise.resolve(installedState)
      if (cmd === 'get_mcp_npm_latest') return Promise.resolve('2.0.0')
      return Promise.resolve([])
    })
    render(<McpDetailPanel mcp={baseMcp} onBack={vi.fn()} />)
    await waitFor(() => screen.getByRole('button', { name: /check for updates/i }))
    fireEvent.click(screen.getByRole('button', { name: /check for updates/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /update to 2\.0\.0/i })).toBeInTheDocument()
    )
    expect(screen.getByText('v2.0.0 available')).toBeInTheDocument()
  })
})
