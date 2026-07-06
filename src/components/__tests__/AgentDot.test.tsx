import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import AgentDot from '../AgentDot'

describe('AgentDot', () => {
  it('renders uppercased first letter of toolId', () => {
    render(<AgentDot toolId="claude" toolName="Claude Code" />)
    expect(screen.getByText('C')).toBeInTheDocument()
  })

  it('tooltip not visible by default', () => {
    render(<AgentDot toolId="claude" toolName="Claude Code" />)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows tooltip with toolName on mouse enter', () => {
    const { container } = render(<AgentDot toolId="claude" toolName="Claude Code" />)
    fireEvent.mouseEnter(container.firstChild as HTMLElement)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })

  it('hides tooltip on mouse leave', () => {
    const { container } = render(<AgentDot toolId="claude" toolName="Claude Code" />)
    const wrapper = container.firstChild as HTMLElement
    fireEvent.mouseEnter(wrapper)
    fireEvent.mouseLeave(wrapper)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('renders correct letter for each toolId', () => {
    const cases = [
      { toolId: 'cursor', letter: 'C' },
      { toolId: 'windsurf', letter: 'W' },
      { toolId: 'gemini', letter: 'G' },
    ]
    for (const { toolId, letter } of cases) {
      const { unmount } = render(<AgentDot toolId={toolId} toolName={toolId} />)
      expect(screen.getByText(letter)).toBeInTheDocument()
      unmount()
    }
  })

  it('uses fallback colors for unknown toolId', () => {
    render(<AgentDot toolId="unknown-tool" toolName="Unknown" />)
    const dot = screen.getByText('U')
    const fallbackColors = ['pink', 'cyan', 'lime', 'fuchsia', 'rose', 'indigo']
    expect(fallbackColors.some(c => dot.className.includes(c))).toBe(true)
  })

  it('size=md applies larger size classes', () => {
    render(<AgentDot toolId="claude" toolName="Claude Code" size="md" />)
    const dot = screen.getByText('C')
    expect(dot.className).toContain('w-[22px]')
    expect(dot.className).toContain('h-[22px]')
  })

  it('size=sm (default) applies small size classes', () => {
    render(<AgentDot toolId="claude" toolName="Claude Code" />)
    const dot = screen.getByText('C')
    expect(dot.className).toContain('w-3.5')
    expect(dot.className).toContain('h-3.5')
  })
})
