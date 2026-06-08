import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks'
import ToolDetailPage from '../ToolDetailPage'
import type { AiTool } from '../../types'

vi.mock('../../analytics', () => ({
  capture: vi.fn(),
  captureException: vi.fn(),
}))

import { capture, captureException } from '../../analytics'

const mockTool: AiTool = {
  id: 'claude',
  name: 'Claude Code',
  version: '1.0.0',
  installed: true,
  skills: [
    { name: 'impeccable', path: '~/.claude/skills/impeccable', description: 'UI polish', active: true },
    { name: 'graphify',   path: '~/.claude/skills/.disabled/graphify', description: undefined, active: false },
  ],
  mcps: [],
  error: undefined,
}

const defaultProps = {
  tool: mockTool,
  onBack: vi.fn(),
  onSelectSkill: vi.fn(),
  onSelectMcp: vi.fn(),
  onToolUpdated: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  clearMocks()
})

describe('ToolDetailPage', () => {
  it('renders tool name in breadcrumb', () => {
    render(<ToolDetailPage {...defaultProps} />)
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByText('aicontextbar')).toBeInTheDocument()
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

  // ── skill toggle IPC ───────────────────────────────────────────────────────

  it('disabling a skill calls invoke with correct args', async () => {
    const invokedArgs: unknown[] = []
    mockIPC((cmd, args) => {
      if (cmd === 'set_skill_active') { invokedArgs.push(args); return null }
    })
    render(<ToolDetailPage {...defaultProps} />)

    const toggles = screen.getAllByRole('button', { name: /disable skill/i })
    fireEvent.click(toggles[0])

    await waitFor(() => expect(invokedArgs).toHaveLength(1))
    expect(invokedArgs[0]).toMatchObject({
      toolId: 'claude',
      skillName: 'impeccable',
      skillPath: '~/.claude/skills/impeccable',
      active: false,
    })
  })

  it('enabling a disabled skill passes active: true', async () => {
    const invokedArgs: unknown[] = []
    mockIPC((cmd, args) => {
      if (cmd === 'set_skill_active') { invokedArgs.push(args); return null }
    })
    render(<ToolDetailPage {...defaultProps} />)

    const toggle = screen.getByRole('button', { name: /enable skill/i })
    fireEvent.click(toggle)

    await waitFor(() => expect(invokedArgs).toHaveLength(1))
    expect(invokedArgs[0]).toMatchObject({ active: true, skillName: 'graphify' })
  })

  it('calls onToolUpdated after successful toggle', async () => {
    mockIPC((cmd) => { if (cmd === 'set_skill_active') return null })
    render(<ToolDetailPage {...defaultProps} />)

    fireEvent.click(screen.getAllByRole('button', { name: /disable skill/i })[0])

    await waitFor(() => expect(defaultProps.onToolUpdated).toHaveBeenCalled())
  })

  it('fires skill_toggled PostHog event on success', async () => {
    mockIPC((cmd) => { if (cmd === 'set_skill_active') return null })
    render(<ToolDetailPage {...defaultProps} />)

    fireEvent.click(screen.getAllByRole('button', { name: /disable skill/i })[0])

    await waitFor(() =>
      expect(capture).toHaveBeenCalledWith('skill_toggled', expect.objectContaining({
        tool_id: 'claude',
        skill_name: 'impeccable',
        active: false,
      }))
    )
  })

  it('fires skill_toggle_failed and captureException on IPC error', async () => {
    mockIPC((cmd) => {
      if (cmd === 'set_skill_active') throw new Error('permission denied')
    })
    render(<ToolDetailPage {...defaultProps} />)

    fireEvent.click(screen.getAllByRole('button', { name: /disable skill/i })[0])

    await waitFor(() =>
      expect(capture).toHaveBeenCalledWith('skill_toggle_failed', expect.objectContaining({
        tool_id: 'claude',
        skill_name: 'impeccable',
        intended_active: false,
      }))
    )
    expect(captureException).toHaveBeenCalled()
    expect(defaultProps.onToolUpdated).not.toHaveBeenCalled()
  })
})
