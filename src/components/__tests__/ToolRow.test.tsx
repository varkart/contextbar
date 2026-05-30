import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ToolRow from '../ToolRow'
import { mockClaudeTool, mockNotInstalledTool } from '../../__tests__/fixtures'

describe('ToolRow', () => {
  it('installed tool: renders name and expand arrow is visible', () => {
    render(<ToolRow tool={mockClaudeTool} />)
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    // Button should be enabled (expand arrow present and not disabled)
    const btn = screen.getByRole('button')
    expect(btn).not.toBeDisabled()
  })

  it('not-installed tool: renders "not installed", no expand arrow', () => {
    render(<ToolRow tool={mockNotInstalledTool} />)
    expect(screen.getByText('Ollama')).toBeInTheDocument()
    expect(screen.getByText('not installed')).toBeInTheDocument()
    // Button should be disabled (no expand)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
  })

  it('click expand → ToolDetails renders', () => {
    render(<ToolRow tool={mockClaudeTool} />)
    // ToolDetails not visible initially
    expect(screen.queryByText('Skills (2)')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/Skills/)).toBeInTheDocument()
  })

  it('click again → ToolDetails unmounts', () => {
    render(<ToolRow tool={mockClaudeTool} />)
    const btn = screen.getByRole('button')
    fireEvent.click(btn)
    expect(screen.getByText(/Skills/)).toBeInTheDocument()
    fireEvent.click(btn)
    expect(screen.queryByText(/Skills/)).not.toBeInTheDocument()
  })
})
