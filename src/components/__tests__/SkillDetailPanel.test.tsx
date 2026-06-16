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
})
