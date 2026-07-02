import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AgentDetailPage from '../AgentDetailPage'
import type { Agent } from '../../types'

vi.mock('../../analytics', () => ({
  capture: vi.fn(),
  captureException: vi.fn(),
}))

const mockAgent: Agent = {
  id: 'claude',
  name: 'Claude Code',
  version: '1.0.0',
  installed: true,
  supportsSkills: true,
  supportsMcps: true,
  skills: [
    { name: 'impeccable', path: '~/.claude/skills/impeccable', description: 'UI polish', hasFullDescription: false, active: true, sourceId: 'skills_dir' },
    { name: 'graphify',   path: '~/.claude/skills/.disabled/graphify', description: undefined, hasFullDescription: false, active: false, sourceId: 'skills_dir' },
  ],
  mcps: [],
  error: undefined,
}

const defaultProps = {
  agent: mockAgent,
  onBack: vi.fn(),
  onSelectSkill: vi.fn(),
  onSelectMcp: vi.fn(),
  onSelectPermissions: vi.fn(),
  onOpenSkillsPage: vi.fn(),
  onOpenMcpsPage: vi.fn(),
  onAgentUpdated: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AgentDetailPage', () => {
  it('renders both active and disabled skills', () => {
    render(<AgentDetailPage {...defaultProps} />)
    expect(screen.getByText('impeccable')).toBeInTheDocument()
    expect(screen.getByText('graphify')).toBeInTheDocument()
  })

  it('clicking a skill calls onSelectSkill', () => {
    render(<AgentDetailPage {...defaultProps} />)
    fireEvent.click(screen.getByText('impeccable'))
    expect(defaultProps.onSelectSkill).toHaveBeenCalledWith(mockAgent.skills[0])
  })

  it('no inline toggle buttons in list — enable/disable only from detail page', () => {
    render(<AgentDetailPage {...defaultProps} />)
    expect(screen.queryByRole('button', { name: /disable skill/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /enable skill/i })).not.toBeInTheDocument()
  })
})
