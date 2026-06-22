import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ToolDot from '../ToolDot'

describe('ToolDot', () => {
  it('renders uppercased first letter of toolId', () => {
    render(<ToolDot toolId="claude" toolName="Claude Code" />)
    expect(screen.getByText('C')).toBeInTheDocument()
  })

  it('tooltip not visible by default', () => {
    render(<ToolDot toolId="claude" toolName="Claude Code" />)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows tooltip with toolName on mouse enter', () => {
    const { container } = render(<ToolDot toolId="claude" toolName="Claude Code" />)
    fireEvent.mouseEnter(container.firstChild as HTMLElement)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })

  it('hides tooltip on mouse leave', () => {
    const { container } = render(<ToolDot toolId="claude" toolName="Claude Code" />)
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
      const { unmount } = render(<ToolDot toolId={toolId} toolName={toolId} />)
      expect(screen.getByText(letter)).toBeInTheDocument()
      unmount()
    }
  })

  it('uses fallback colors for unknown toolId', () => {
    render(<ToolDot toolId="unknown-tool" toolName="Unknown" />)
    const dot = screen.getByText('U')
    expect(dot.className).toContain('zinc')
  })
})
