import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SkillDetailPanel from '../SkillDetailPanel'
import type { Skill, FileEntry } from '../../types'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('../../analytics', () => ({ capture: vi.fn(), captureException: vi.fn() }))

import { invoke } from '@tauri-apps/api/core'
const mockInvoke = vi.mocked(invoke)

const skill: Skill = {
  name: 'impeccable',
  path: '~/.claude/skills/impeccable',
  description: 'Polish frontend UI',
  hasFullDescription: false,
  active: true,
  sourceId: 'skills_dir',
}

const fileTree: FileEntry = {
  name: 'impeccable',
  path: '~/.claude/skills/impeccable',
  isDir: true,
  extension: undefined,
  children: [
    { name: 'SKILL.md', path: '~/.claude/skills/impeccable/SKILL.md', isDir: false, extension: 'md', children: [] },
    { name: 'lib', path: '~/.claude/skills/impeccable/lib', isDir: true, extension: undefined, children: [] },
  ],
}

beforeEach(() => {
  mockInvoke.mockReset()
})

describe('SkillDetailPanel', () => {
  it('shows skeleton while loading', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    const { container } = render(<SkillDetailPanel skill={skill} onBack={vi.fn()} />)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('renders skill name in header', async () => {
    mockInvoke.mockResolvedValue(fileTree)
    render(<SkillDetailPanel skill={skill} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('SKILL.md')).toBeInTheDocument())
    expect(screen.getByText('impeccable')).toBeInTheDocument()
  })

  it('renders file tree after invoke resolves', async () => {
    mockInvoke.mockResolvedValue(fileTree)
    render(<SkillDetailPanel skill={skill} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('SKILL.md')).toBeInTheDocument())
    expect(screen.getByText('lib')).toBeInTheDocument()
  })

  it('shows error when invoke fails', async () => {
    mockInvoke.mockRejectedValue(new Error('path not found'))
    render(<SkillDetailPanel skill={skill} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/path not found/i)).toBeInTheDocument())
  })

  it('back button calls onBack', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    const onBack = vi.fn()
    render(<SkillDetailPanel skill={skill} onBack={onBack} />)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('shows toolName breadcrumb when provided', async () => {
    mockInvoke.mockResolvedValue(fileTree)
    render(<SkillDetailPanel skill={skill} onBack={vi.fn()} toolName="Claude Code" />)
    await waitFor(() => expect(screen.getByText('SKILL.md')).toBeInTheDocument())
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })

  it('shows skill path at the bottom', async () => {
    mockInvoke.mockResolvedValue(fileTree)
    render(<SkillDetailPanel skill={skill} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.queryByText(/animate-pulse/)).not.toBeInTheDocument())
    expect(screen.getByText(skill.path)).toBeInTheDocument()
  })

  it('clicking a file invokes open_path', async () => {
    mockInvoke.mockResolvedValueOnce(fileTree)
    mockInvoke.mockResolvedValue(undefined)
    render(<SkillDetailPanel skill={skill} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('SKILL.md')).toBeInTheDocument())
    fireEvent.click(screen.getByText('SKILL.md'))
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('open_path', {
        path: '~/.claude/skills/impeccable/SKILL.md',
      })
    )
  })

  it('invokes read_skill_dir with correct path', async () => {
    mockInvoke.mockResolvedValue(fileTree)
    render(<SkillDetailPanel skill={skill} onBack={vi.fn()} />)
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled())
    expect(mockInvoke).toHaveBeenCalledWith('read_skill_dir', { path: skill.path })
  })

  // ── enable / disable toggle ──────────────────────────────────────────────

  it('shows Disable button when toolId provided and skill is active', async () => {
    mockInvoke.mockResolvedValue(fileTree)
    render(<SkillDetailPanel skill={skill} onBack={vi.fn()} toolId="claude" />)
    await waitFor(() => expect(screen.getByText('SKILL.md')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /disable skill/i })).toBeInTheDocument()
  })

  it('hides toggle button when toolId not provided', async () => {
    mockInvoke.mockResolvedValue(fileTree)
    render(<SkillDetailPanel skill={skill} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('SKILL.md')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /disable skill/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /enable skill/i })).not.toBeInTheDocument()
  })

  it('shows Enable button for inactive skill', async () => {
    const inactiveSkill = { ...skill, active: false }
    mockInvoke.mockResolvedValue(fileTree)
    render(<SkillDetailPanel skill={inactiveSkill} onBack={vi.fn()} toolId="claude" />)
    await waitFor(() => expect(screen.getByText('SKILL.md')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /enable skill/i })).toBeInTheDocument()
  })

  it('toggle calls set_skill_active with correct args', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'read_skill_dir') return Promise.resolve(fileTree)
      if (cmd === 'set_skill_active') return Promise.resolve(null)
      return Promise.resolve(null)
    })
    const onToggled = vi.fn()
    render(<SkillDetailPanel skill={skill} onBack={vi.fn()} toolId="claude" onToggled={onToggled} />)
    await waitFor(() => screen.getByRole('button', { name: /disable skill/i }))
    fireEvent.click(screen.getByRole('button', { name: /disable skill/i }))
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('set_skill_active', {
        toolId: 'claude',
        skillName: 'impeccable',
        skillPath: '~/.claude/skills/impeccable',
        active: false,
      })
    )
    expect(onToggled).toHaveBeenCalled()
  })

  it('shows error when toggle fails', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'read_skill_dir') return Promise.resolve(fileTree)
      return Promise.reject(new Error('permission denied'))
    })
    render(<SkillDetailPanel skill={skill} onBack={vi.fn()} toolId="claude" />)
    await waitFor(() => screen.getByRole('button', { name: /disable skill/i }))
    fireEvent.click(screen.getByRole('button', { name: /disable skill/i }))
    await waitFor(() => expect(screen.getByText(/permission denied/i)).toBeInTheDocument())
  })
})
