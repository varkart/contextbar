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

  // ── full description overlay ─────────────────────────────────────────────

  it('shows full description button when hasFullDescription is true', async () => {
    const richSkill = { ...skill, hasFullDescription: true }
    mockInvoke.mockResolvedValue(fileTree)
    render(<SkillDetailPanel skill={richSkill} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('SKILL.md')).toBeInTheDocument())
    expect(screen.getByText('Show full description →')).toBeInTheDocument()
  })

  it('does not show full description button when hasFullDescription is false', async () => {
    mockInvoke.mockResolvedValue(fileTree)
    render(<SkillDetailPanel skill={skill} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('SKILL.md')).toBeInTheDocument())
    expect(screen.queryByText('Show full description →')).not.toBeInTheDocument()
  })

  it('clicking Show full description opens overlay and fetches content', async () => {
    const richSkill = { ...skill, hasFullDescription: true }
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'read_skill_dir') return Promise.resolve(fileTree)
      if (cmd === 'get_skill_full_description') return Promise.resolve('# Full\nSome detail.')
      return Promise.resolve(null)
    })
    render(<SkillDetailPanel skill={richSkill} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Show full description →')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Show full description →'))
    await waitFor(() => expect(screen.getByText('Show less')).toBeInTheDocument())
    expect(mockInvoke).toHaveBeenCalledWith('get_skill_full_description', { path: skill.path })
  })

  it('Show less button closes the overlay', async () => {
    const richSkill = { ...skill, hasFullDescription: true }
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'read_skill_dir') return Promise.resolve(fileTree)
      if (cmd === 'get_skill_full_description') return Promise.resolve('# Full\nSome detail.')
      return Promise.resolve(null)
    })
    render(<SkillDetailPanel skill={richSkill} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Show full description →')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Show full description →'))
    await waitFor(() => expect(screen.getByText('Show less')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Show less'))
    await waitFor(() => expect(screen.queryByText('Show less')).not.toBeInTheDocument())
  })

  it('Escape key closes the description overlay', async () => {
    const richSkill = { ...skill, hasFullDescription: true }
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'read_skill_dir') return Promise.resolve(fileTree)
      if (cmd === 'get_skill_full_description') return Promise.resolve('# Full\nSome detail.')
      return Promise.resolve(null)
    })
    render(<SkillDetailPanel skill={richSkill} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Show full description →')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Show full description →'))
    await waitFor(() => expect(screen.getByText('Show less')).toBeInTheDocument())
    fireEvent.keyDown(window, { key: 'Escape', bubbles: true })
    await waitFor(() => expect(screen.queryByText('Show less')).not.toBeInTheDocument())
  })

  it('Escape key does not call onBack when overlay is closed', async () => {
    mockInvoke.mockResolvedValue(fileTree)
    const onBack = vi.fn()
    render(<SkillDetailPanel skill={skill} onBack={onBack} />)
    await waitFor(() => expect(screen.getByText('SKILL.md')).toBeInTheDocument())
    fireEvent.keyDown(window, { key: 'Escape', bubbles: true })
    expect(onBack).not.toHaveBeenCalled()
  })
})
