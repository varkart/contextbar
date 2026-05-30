import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
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
})
