import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ToolRow from '../ToolRow'
import { mockClaudeTool, mockNotInstalledTool } from '../../__tests__/fixtures'

describe('ToolRow', () => {
  it('installed tool: renders name, button enabled', () => {
    render(<ToolRow tool={mockClaudeTool} />)
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByRole('button')).not.toBeDisabled()
  })

  it('not-installed tool: renders name, "not found" label, button disabled', () => {
    render(<ToolRow tool={mockNotInstalledTool} />)
    expect(screen.getByText('Ollama')).toBeInTheDocument()
    expect(screen.getByText('not found')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('click expand → Skills section appears', () => {
    render(<ToolRow tool={mockClaudeTool} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Skills')).toBeInTheDocument()
  })

  it('details are present in DOM even when collapsed (CSS transition)', () => {
    render(<ToolRow tool={mockClaudeTool} />)
    // ToolDetails is always mounted (uses max-height CSS transition), just hidden
    expect(screen.getByText('Skills')).toBeInTheDocument()
  })
})
