import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import McpRow from '../McpRow'
import type { McpServer } from '../../types'

const baseMcp: McpServer = {
  name: 'github',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
  active: true,
  hasSecrets: true,
  secretKeyNames: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
}

function getTooltipContainer(name: string) {
  return screen.getByText(name).closest('[class*="relative"]') as HTMLElement
}

describe('McpRow', () => {
  it('renders MCP name', () => {
    render(<McpRow mcp={baseMcp} />)
    expect(screen.getByText('github')).toBeInTheDocument()
  })

  it('shows lock icon when hasSecrets=true', () => {
    render(<McpRow mcp={baseMcp} />)
    expect(screen.getByLabelText('has env secrets')).toBeInTheDocument()
  })

  it('no lock icon when hasSecrets=false', () => {
    render(<McpRow mcp={{ ...baseMcp, hasSecrets: false, secretKeyNames: [] }} />)
    expect(screen.queryByLabelText('has env secrets')).not.toBeInTheDocument()
  })

  it('tooltip shows command + args string', () => {
    render(<McpRow mcp={baseMcp} />)
    const container = getTooltipContainer('github')
    fireEvent.mouseEnter(container)
    expect(screen.getByRole('tooltip')).toHaveTextContent('npx -y @modelcontextprotocol/server-github')
  })

  it('tooltip shows secret key names when hasSecrets=true', () => {
    render(<McpRow mcp={baseMcp} />)
    const container = getTooltipContainer('github')
    fireEvent.mouseEnter(container)
    expect(screen.getByRole('tooltip')).toHaveTextContent('GITHUB_PERSONAL_ACCESS_TOKEN')
  })

  it('tooltip does NOT contain actual secret values', () => {
    render(<McpRow mcp={baseMcp} />)
    const container = getTooltipContainer('github')
    fireEvent.mouseEnter(container)
    expect(screen.getByRole('tooltip')).not.toHaveTextContent('supersecrettoken123')
  })

  // ── toggle ──────────────────────────────────────────────────────────────────

  it('no toggle rendered without onToggle prop', () => {
    render(<McpRow mcp={baseMcp} />)
    expect(screen.queryByRole('button', { name: /disable mcp/i })).toBeNull()
  })

  it('toggle renders when onToggle provided', () => {
    render(<McpRow mcp={baseMcp} onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: /disable mcp/i })).toBeInTheDocument()
  })

  it('toggle label is "Enable MCP" when mcp is inactive', () => {
    render(<McpRow mcp={{ ...baseMcp, active: false }} onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: /enable mcp/i })).toBeInTheDocument()
  })

  it('clicking active toggle calls onToggle(false)', () => {
    const onToggle = vi.fn()
    render(<McpRow mcp={baseMcp} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /disable mcp/i }))
    expect(onToggle).toHaveBeenCalledWith(false)
  })

  it('clicking inactive toggle calls onToggle(true)', () => {
    const onToggle = vi.fn()
    render(<McpRow mcp={{ ...baseMcp, active: false }} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /enable mcp/i }))
    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it('toggling=true disables the button', () => {
    render(<McpRow mcp={baseMcp} onToggle={vi.fn()} toggling={true} />)
    expect(screen.getByRole('button', { name: /disable mcp/i })).toBeDisabled()
  })

  it('inactive mcp row has reduced opacity class', () => {
    const { container } = render(<McpRow mcp={{ ...baseMcp, active: false }} />)
    expect(container.querySelector('.opacity-40')).toBeInTheDocument()
  })

  it('active mcp row has no opacity reduction', () => {
    const { container } = render(<McpRow mcp={baseMcp} />)
    expect(container.querySelector('.opacity-40')).toBeNull()
  })

  it('calls onSelect when row is clicked', () => {
    const onSelect = vi.fn()
    render(<McpRow mcp={baseMcp} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('github'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
