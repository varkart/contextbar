import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import AgentRow from '../AgentRow'
import { mockClaudeAgent, mockNotInstalledAgent } from '../../__tests__/fixtures'

describe('AgentRow', () => {
  it('installed tool: renders name, button enabled', () => {
    render(<AgentRow tool={mockClaudeAgent} onSelectAgent={vi.fn()} />)
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByRole('button')).not.toBeDisabled()
  })

  it('not-installed tool: renders name, "not found" label, button disabled', () => {
    render(<AgentRow tool={mockNotInstalledAgent} onSelectAgent={vi.fn()} />)
    expect(screen.getByText('Ollama')).toBeInTheDocument()
    expect(screen.getByText('not found')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('click installed tool → calls onSelectAgent', () => {
    const onSelectAgent = vi.fn()
    render(<AgentRow tool={mockClaudeAgent} onSelectAgent={onSelectAgent} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onSelectAgent).toHaveBeenCalledWith(mockClaudeAgent)
  })

  it('click not-installed tool → does not call onSelectAgent', () => {
    const onSelectAgent = vi.fn()
    render(<AgentRow tool={mockNotInstalledAgent} onSelectAgent={onSelectAgent} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onSelectAgent).not.toHaveBeenCalled()
  })
})
