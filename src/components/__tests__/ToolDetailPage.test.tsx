import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ToolDetailPage from '../ToolDetailPage'
import type { AiTool } from '../../types'

vi.mock('../../analytics', () => ({
  capture: vi.fn(),
  captureException: vi.fn(),
}))

const mockTool: AiTool = {
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
  tool: mockTool,
  onBack: vi.fn(),
  onSelectSkill: vi.fn(),
  onSelectMcp: vi.fn(),
  onSelectPermissions: vi.fn(),
  onOpenSkillsPage: vi.fn(),
  onOpenMcpsPage: vi.fn(),
  onToolUpdated: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ToolDetailPage', () => {
  it('renders tool name in breadcrumb', () => {
    render(<ToolDetailPage {...defaultProps} />)
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByText('LLM Manager')).toBeInTheDocument()
  })

  it('renders both active and disabled skills', () => {
    render(<ToolDetailPage {...defaultProps} />)
    expect(screen.getByText('impeccable')).toBeInTheDocument()
    expect(screen.getByText('graphify')).toBeInTheDocument()
  })

  it('back button calls onBack', () => {
    render(<ToolDetailPage {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Back'))
    expect(defaultProps.onBack).toHaveBeenCalled()
  })

  it('clicking a skill calls onSelectSkill', () => {
    render(<ToolDetailPage {...defaultProps} />)
    fireEvent.click(screen.getByText('impeccable'))
    expect(defaultProps.onSelectSkill).toHaveBeenCalledWith(mockTool.skills[0])
  })

  it('no inline toggle buttons in list — enable/disable only from detail page', () => {
    render(<ToolDetailPage {...defaultProps} />)
    expect(screen.queryByRole('button', { name: /disable skill/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /enable skill/i })).not.toBeInTheDocument()
  })
})
