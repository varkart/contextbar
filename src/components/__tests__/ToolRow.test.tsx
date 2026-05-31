import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import ToolRow from '../ToolRow'
import { mockClaudeTool, mockNotInstalledTool } from '../../__tests__/fixtures'

// Wrapper that manages expanded state locally so toggle works in tests
function ToolRowWrapper(props: Parameters<typeof ToolRow>[0]) {
  const [isExpanded, setIsExpanded] = useState(props.isExpanded ?? false)
  return (
    <ToolRow
      {...props}
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded(v => !v)}
    />
  )
}

describe('ToolRow', () => {
  it('installed tool: renders name, button enabled', () => {
    render(<ToolRowWrapper tool={mockClaudeTool} isExpanded={false} onToggle={vi.fn()} />)
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByRole('button')).not.toBeDisabled()
  })

  it('not-installed tool: renders name, "not found" label, button disabled', () => {
    render(<ToolRowWrapper tool={mockNotInstalledTool} isExpanded={false} onToggle={vi.fn()} />)
    expect(screen.getByText('Ollama')).toBeInTheDocument()
    expect(screen.getByText('not found')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('click expand → Skills section appears', () => {
    render(<ToolRowWrapper tool={mockClaudeTool} isExpanded={false} onToggle={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Skills')).toBeInTheDocument()
  })

  it('details are present in DOM even when collapsed (CSS transition)', () => {
    render(<ToolRowWrapper tool={mockClaudeTool} isExpanded={false} onToggle={vi.fn()} />)
    // ToolDetails is always mounted (uses max-height CSS transition), just hidden
    expect(screen.getByText('Skills')).toBeInTheDocument()
  })
})
