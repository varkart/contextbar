import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import McpsListPanel from '../McpsListPanel'
import type { AiTool } from '../../types'

const tool: AiTool = {
  id: 'claude',
  name: 'Claude Code',
  version: '1.0.0',
  installed: true,
  skills: [],
  mcps: [
    { name: 'github',     command: 'npx', args: [], active: true,  hasSecrets: true,  secretKeyNames: ['GITHUB_TOKEN'], sourceId: 'settings_json' },
    { name: 'filesystem', command: 'npx', args: [], active: false, hasSecrets: false, secretKeyNames: [],               sourceId: 'settings_json' },
    { name: 'sentry',     command: 'npx', args: [], active: true,  hasSecrets: true,  secretKeyNames: ['SENTRY_TOKEN'], sourceId: 'settings_json' },
    { name: 'alpha',      command: 'npx', args: [], active: true,  hasSecrets: false, secretKeyNames: [],               sourceId: 'settings_json' },
    { name: 'beta',       command: 'npx', args: [], active: true,  hasSecrets: false, secretKeyNames: [],               sourceId: 'settings_json' },
    { name: 'gamma',      command: 'npx', args: [], active: true,  hasSecrets: false, secretKeyNames: [],               sourceId: 'settings_json' },
  ],
  error: undefined,
}

describe('McpsListPanel', () => {
  it('renders tool name breadcrumb', () => {
    render(<McpsListPanel tool={tool} onBack={vi.fn()} onSelectMcp={vi.fn()} onAddMcp={vi.fn()} />)
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })

  it('renders MCPs heading', () => {
    render(<McpsListPanel tool={tool} onBack={vi.fn()} onSelectMcp={vi.fn()} onAddMcp={vi.fn()} />)
    expect(screen.getByText('MCPs')).toBeInTheDocument()
  })

  it('lists all MCPs', () => {
    render(<McpsListPanel tool={tool} onBack={vi.fn()} onSelectMcp={vi.fn()} onAddMcp={vi.fn()} />)
    expect(screen.getByText('github')).toBeInTheDocument()
    expect(screen.getByText('filesystem')).toBeInTheDocument()
    expect(screen.getByText('sentry')).toBeInTheDocument()
  })

  it('inactive MCP row has opacity-40', () => {
    render(<McpsListPanel tool={tool} onBack={vi.fn()} onSelectMcp={vi.fn()} onAddMcp={vi.fn()} />)
    const btn = screen.getByText('filesystem').closest('button')
    expect(btn).toHaveClass('opacity-40')
  })

  it('shows lock icon for MCPs with secrets', () => {
    render(<McpsListPanel tool={tool} onBack={vi.fn()} onSelectMcp={vi.fn()} onAddMcp={vi.fn()} />)
    expect(screen.getAllByLabelText('has env secrets').length).toBeGreaterThan(0)
  })

  it('no lock icon for MCPs without secrets', () => {
    const singleTool = { ...tool, mcps: [tool.mcps[1]] } // filesystem: no secrets
    render(<McpsListPanel tool={singleTool} onBack={vi.fn()} onSelectMcp={vi.fn()} onAddMcp={vi.fn()} />)
    expect(screen.queryByLabelText('has env secrets')).not.toBeInTheDocument()
  })

  it('back button calls onBack', () => {
    const onBack = vi.fn()
    render(<McpsListPanel tool={tool} onBack={onBack} onSelectMcp={vi.fn()} onAddMcp={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Back'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('clicking MCP calls onSelectMcp', () => {
    const onSelectMcp = vi.fn()
    render(<McpsListPanel tool={tool} onBack={vi.fn()} onSelectMcp={onSelectMcp} onAddMcp={vi.fn()} />)
    fireEvent.click(screen.getByText('github'))
    expect(onSelectMcp).toHaveBeenCalledWith(tool.mcps[0])
  })

  it('shows search input when more than 5 MCPs', () => {
    render(<McpsListPanel tool={tool} onBack={vi.fn()} onSelectMcp={vi.fn()} onAddMcp={vi.fn()} />)
    expect(screen.getByPlaceholderText('Filter MCPs…')).toBeInTheDocument()
  })

  it('hides search input when 5 or fewer MCPs', () => {
    const smallTool = { ...tool, mcps: tool.mcps.slice(0, 3) }
    render(<McpsListPanel tool={smallTool} onBack={vi.fn()} onSelectMcp={vi.fn()} onAddMcp={vi.fn()} />)
    expect(screen.queryByPlaceholderText('Filter MCPs…')).not.toBeInTheDocument()
  })

  it('search filters MCP list', () => {
    render(<McpsListPanel tool={tool} onBack={vi.fn()} onSelectMcp={vi.fn()} onAddMcp={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Filter MCPs…'), { target: { value: 'git' } })
    expect(screen.getByText('github')).toBeInTheDocument()
    expect(screen.queryByText('filesystem')).not.toBeInTheDocument()
  })

  it('shows no-match message when filter has no results', () => {
    render(<McpsListPanel tool={tool} onBack={vi.fn()} onSelectMcp={vi.fn()} onAddMcp={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Filter MCPs…'), { target: { value: 'zzz' } })
    expect(screen.getByText(/No MCPs matching/)).toBeInTheDocument()
  })
})
