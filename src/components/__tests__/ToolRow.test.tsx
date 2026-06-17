import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ToolRow from '../ToolRow'
import { mockClaudeTool, mockNotInstalledTool } from '../../__tests__/fixtures'

describe('ToolRow', () => {
  it('installed tool: renders name, button enabled', () => {
    render(<ToolRow tool={mockClaudeTool} onSelectTool={vi.fn()} />)
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByRole('button')).not.toBeDisabled()
  })

  it('not-installed tool: renders name, "not found" label, button disabled', () => {
    render(<ToolRow tool={mockNotInstalledTool} onSelectTool={vi.fn()} />)
    expect(screen.getByText('Ollama')).toBeInTheDocument()
    expect(screen.getByText('not found')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('click installed tool → calls onSelectTool', () => {
    const onSelectTool = vi.fn()
    render(<ToolRow tool={mockClaudeTool} onSelectTool={onSelectTool} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onSelectTool).toHaveBeenCalledWith(mockClaudeTool)
  })

  it('click not-installed tool → does not call onSelectTool', () => {
    const onSelectTool = vi.fn()
    render(<ToolRow tool={mockNotInstalledTool} onSelectTool={onSelectTool} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onSelectTool).not.toHaveBeenCalled()
  })
})
