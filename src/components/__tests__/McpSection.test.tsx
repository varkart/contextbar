import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import McpSection from '../McpSection'
import type { McpServer } from '../../types'

const mcp = (name: string): McpServer => ({
  name,
  command: 'npx',
  args: [],
  active: true,
  hasSecrets: false,
  secretKeyNames: [],
  sourceId: 'settings_json',
})

function getSectionHeader(container: HTMLElement) {
  return container.querySelector('button[aria-expanded]') as HTMLElement
}

describe('McpSection', () => {
  it('renders MCPs header', () => {
    render(<McpSection mcps={[mcp('github')]} />)
    expect(screen.getByText('MCPs')).toBeInTheDocument()
  })

  it('shows count of visible mcps', () => {
    const { container } = render(<McpSection mcps={[mcp('a'), mcp('b')]} />)
    const header = getSectionHeader(container)
    expect(header.textContent).toContain('2')
  })

  it('renders all mcp names', () => {
    render(<McpSection mcps={[mcp('github'), mcp('netlify')]} />)
    expect(screen.getByText('github')).toBeInTheDocument()
    expect(screen.getByText('netlify')).toBeInTheDocument()
  })

  it('shows "None detected" for empty list', () => {
    render(<McpSection mcps={[]} />)
    expect(screen.getByText(/none detected/i)).toBeInTheDocument()
  })

  it('collapses on header click', () => {
    const { container } = render(<McpSection mcps={[mcp('github')]} />)
    fireEvent.click(getSectionHeader(container))
    expect(screen.queryByText('github')).not.toBeInTheDocument()
  })

  it('re-expands after second header click', () => {
    const { container } = render(<McpSection mcps={[mcp('github')]} />)
    fireEvent.click(getSectionHeader(container))
    fireEvent.click(getSectionHeader(container))
    expect(screen.getByText('github')).toBeInTheDocument()
  })

  it('aria-expanded reflects open state', () => {
    const { container } = render(<McpSection mcps={[mcp('github')]} />)
    const header = getSectionHeader(container)
    expect(header).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
  })

  it('filters mcps by matchedNames', () => {
    render(<McpSection mcps={[mcp('github'), mcp('netlify')]} matchedNames={new Set(['github'])} />)
    expect(screen.getByText('github')).toBeInTheDocument()
    expect(screen.queryByText('netlify')).not.toBeInTheDocument()
  })

  it('shows "None detected" when filter yields 0 results', () => {
    render(<McpSection mcps={[mcp('github')]} matchedNames={new Set(['no-match'])} />)
    expect(screen.getByText(/none detected/i)).toBeInTheDocument()
  })

  it('calls onSelectMcp when mcp row is clicked', () => {
    const onSelectMcp = vi.fn()
    render(<McpSection mcps={[mcp('github')]} onSelectMcp={onSelectMcp} />)
    fireEvent.click(screen.getByText('github'))
    expect(onSelectMcp).toHaveBeenCalledWith(expect.objectContaining({ name: 'github' }))
  })
})
