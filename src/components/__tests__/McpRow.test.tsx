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
  sourceId: 'settings_json',
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

  it('lock icon title contains secret key names', () => {
    render(<McpRow mcp={baseMcp} />)
    const lockSpan = screen.getByLabelText('has env secrets').closest('span')!
    expect(lockSpan.title).toContain('GITHUB_PERSONAL_ACCESS_TOKEN')
  })

  it('no toggle button — enable/disable only from detail page', () => {
    render(<McpRow mcp={baseMcp} />)
    expect(screen.queryByRole('button', { name: /enable|disable/i })).toBeNull()
  })

  it('inactive mcp row has reduced opacity', () => {
    const { container } = render(<McpRow mcp={{ ...baseMcp, active: false }} />)
    expect(container.querySelector('.opacity-40')).toBeInTheDocument()
  })

  it('active mcp row has no opacity reduction', () => {
    const { container } = render(<McpRow mcp={baseMcp} />)
    expect(container.querySelector('.opacity-40')).toBeNull()
  })

  it('shows chevron when onSelect provided', () => {
    const { container } = render(<McpRow mcp={baseMcp} onSelect={vi.fn()} />)
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(1)
  })

  it('calls onSelect when row is clicked', () => {
    const onSelect = vi.fn()
    render(<McpRow mcp={baseMcp} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('github'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
