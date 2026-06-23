import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import AllMcpsView from '../views/AllMcpsView'
import type { AiTool, McpServer } from '../../types'

function makeMcp(overrides: Partial<McpServer> & Pick<McpServer, 'name'>): McpServer {
  return {
    command: 'npx',
    args: [],
    active: true,
    hasSecrets: false,
    secretKeyNames: [],
    sourceId: 'settings_json',
    ...overrides,
  }
}

function makeTool(id: string, name: string, mcps: McpServer[], installed = true): AiTool {
  return {
    id,
    name,
    installed,
    supportsSkills: true,
    supportsMcps: true,
    skills: [],
    mcps,
  }
}

const claudeMcps = [
  makeMcp({ name: 'github', command: 'npx -y @modelcontextprotocol/server-github' }),
  makeMcp({ name: 'netlify', command: 'npx -y @netlify/mcp' }),
  makeMcp({ name: 'sentry', command: 'npx -y @sentry/mcp-server' }),
]

const cursorMcps = [
  makeMcp({ name: 'github', command: 'npx -y @modelcontextprotocol/server-github' }),
  makeMcp({ name: 'cursor-db', command: 'npx -y cursor-db-mcp' }),
]

const singleTool = makeTool('claude', 'Claude Code', claudeMcps)
const claudeTool = makeTool('claude', 'Claude Code', claudeMcps)
const cursorTool = makeTool('cursor', 'Cursor', cursorMcps)

describe('AllMcpsView — renders MCPs', () => {
  it('renders all unique MCP names from installed tools', () => {
    render(<AllMcpsView tools={[singleTool]} onBack={vi.fn()} onSelectMcp={vi.fn()} />)
    expect(screen.getByText('github')).toBeInTheDocument()
    expect(screen.getByText('netlify')).toBeInTheDocument()
    expect(screen.getByText('sentry')).toBeInTheDocument()
  })

  it('does not render MCPs from uninstalled tools', () => {
    const notInstalled = makeTool('gemini', 'Gemini', [makeMcp({ name: 'gemini-mcp' })], false)
    render(<AllMcpsView tools={[singleTool, notInstalled]} onBack={vi.fn()} onSelectMcp={vi.fn()} />)
    expect(screen.queryByText('gemini-mcp')).not.toBeInTheDocument()
  })

  it('deduplicates MCPs with the same name across tools', () => {
    // github exists in both claude and cursor, should appear only once as a row
    render(<AllMcpsView tools={[claudeTool, cursorTool]} onBack={vi.fn()} onSelectMcp={vi.fn()} />)
    const githubs = screen.getAllByText('github')
    expect(githubs).toHaveLength(1)
  })
})

describe('AllMcpsView — search', () => {
  it('search filters MCPs by name', () => {
    render(<AllMcpsView tools={[singleTool]} onBack={vi.fn()} onSelectMcp={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Search MCPs…'), { target: { value: 'net' } })
    expect(screen.getByText('netlify')).toBeInTheDocument()
    expect(screen.queryByText('github')).not.toBeInTheDocument()
    expect(screen.queryByText('sentry')).not.toBeInTheDocument()
  })

  it('shows empty state when search matches nothing', () => {
    render(<AllMcpsView tools={[singleTool]} onBack={vi.fn()} onSelectMcp={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Search MCPs…'), { target: { value: 'zzznomatch' } })
    expect(screen.getByText('No MCPs match')).toBeInTheDocument()
  })

  it('count label shows "N of M MCPs" when filtered', () => {
    render(<AllMcpsView tools={[singleTool]} onBack={vi.fn()} onSelectMcp={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Search MCPs…'), { target: { value: 'net' } })
    expect(screen.getByText(/1 of 3 MCPs/)).toBeInTheDocument()
  })

  it('count label shows full count with providers when not filtered', () => {
    render(<AllMcpsView tools={[singleTool]} onBack={vi.fn()} onSelectMcp={vi.fn()} />)
    expect(screen.getByText(/3 MCPs · 1 providers/)).toBeInTheDocument()
  })
})

describe('AllMcpsView — provider chips', () => {
  it('does not render provider chips when only one installed tool', () => {
    render(<AllMcpsView tools={[singleTool]} onBack={vi.fn()} onSelectMcp={vi.fn()} />)
    // ProviderChips renders nothing when installedTools.length <= 1
    expect(screen.queryByText('Claude Code')).not.toBeInTheDocument()
  })

  it('renders provider chips when multiple installed tools', () => {
    render(<AllMcpsView tools={[claudeTool, cursorTool]} onBack={vi.fn()} onSelectMcp={vi.fn()} />)
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByText('Cursor')).toBeInTheDocument()
  })
})

describe('AllMcpsView — interaction', () => {
  it('clicking an MCP calls onSelectMcp with the primary MCP', () => {
    const onSelectMcp = vi.fn()
    render(<AllMcpsView tools={[singleTool]} onBack={vi.fn()} onSelectMcp={onSelectMcp} />)
    fireEvent.click(screen.getByText('github'))
    expect(onSelectMcp).toHaveBeenCalledTimes(1)
    expect(onSelectMcp).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'github' })
    )
  })

  it('deselecting a provider chip hides that provider\'s exclusive MCPs', () => {
    // cursor-db only exists in Cursor; deselecting Cursor chip should hide it
    render(<AllMcpsView tools={[claudeTool, cursorTool]} onBack={vi.fn()} onSelectMcp={vi.fn()} />)
    expect(screen.getByText('cursor-db')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cursor').closest('button')!)
    expect(screen.queryByText('cursor-db')).not.toBeInTheDocument()
    // Claude's exclusive MCPs still visible
    expect(screen.getByText('netlify')).toBeInTheDocument()
  })
})
