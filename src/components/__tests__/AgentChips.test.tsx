import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import AgentChips from '../AgentChips'
import type { Agent } from '../../types'

function makeTools(ids: string[]): Agent[] {
  return ids.map(id => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    installed: true,
    supportsSkills: true,
    supportsMcps: true,
    skills: [],
    mcps: [],
  }))
}

describe('AgentChips', () => {
  it('renders nothing when only one installed tool', () => {
    const { container } = render(
      <AgentChips
        installedAgents={makeTools(['claude'])}
        selectedTools={new Set(['claude'])}
        onToggle={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders a chip for each installed tool', () => {
    const tools = makeTools(['claude', 'cursor', 'gemini'])
    render(
      <AgentChips
        installedAgents={tools}
        selectedTools={new Set(tools.map(t => t.id))}
        onToggle={vi.fn()}
      />
    )
    expect(screen.getByText('Claude')).toBeInTheDocument()
    expect(screen.getByText('Cursor')).toBeInTheDocument()
    expect(screen.getByText('Gemini')).toBeInTheDocument()
  })

  it('calls onToggle with the correct id when chip is clicked', () => {
    const tools = makeTools(['claude', 'cursor'])
    const onToggle = vi.fn()
    render(
      <AgentChips
        installedAgents={tools}
        selectedTools={new Set(tools.map(t => t.id))}
        onToggle={onToggle}
      />
    )
    fireEvent.click(screen.getByText('Cursor').closest('button')!)
    expect(onToggle).toHaveBeenCalledWith('cursor')
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('unselected chip has opacity-50', () => {
    const tools = makeTools(['claude', 'cursor'])
    render(
      <AgentChips
        installedAgents={tools}
        selectedTools={new Set(['claude'])}
        onToggle={vi.fn()}
      />
    )
    const unselected = screen.getByText('Cursor').closest('button')!
    expect(unselected.className).toContain('opacity-50')
  })

  it('selected chip does not have opacity-50', () => {
    const tools = makeTools(['claude', 'cursor'])
    render(
      <AgentChips
        installedAgents={tools}
        selectedTools={new Set(['claude', 'cursor'])}
        onToggle={vi.fn()}
      />
    )
    const selected = screen.getByText('Cursor').closest('button')!
    expect(selected.className).not.toContain('opacity-50')
  })
})
