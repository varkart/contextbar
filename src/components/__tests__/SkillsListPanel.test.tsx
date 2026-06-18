import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import SkillsListPanel from '../SkillsListPanel'
import type { AiTool } from '../../types'

const tool: AiTool = {
  id: 'claude',
  name: 'Claude Code',
  version: '1.0.0',
  installed: true,
  skills: [
    { name: 'impeccable', path: '~/.claude/skills/impeccable', description: 'UI polish', hasFullDescription: false, active: true,  sourceId: 'skills_dir' },
    { name: 'graphify',   path: '~/.claude/skills/graphify',   description: 'Graphs',    hasFullDescription: false, active: true,  sourceId: 'skills_dir' },
    { name: 'xlsx',       path: '~/.claude/skills/.disabled/xlsx', description: 'Excel', hasFullDescription: false, active: false, sourceId: 'skills_dir' },
    { name: 'alpha', path: '/a', description: undefined, hasFullDescription: false, active: true, sourceId: 'skills_dir' },
    { name: 'beta',  path: '/b', description: undefined, hasFullDescription: false, active: true, sourceId: 'skills_dir' },
    { name: 'gamma', path: '/c', description: undefined, hasFullDescription: false, active: true, sourceId: 'skills_dir' },
  ],
  mcps: [],
  error: undefined,
}

describe('SkillsListPanel', () => {
  it('renders tool name breadcrumb', () => {
    render(<SkillsListPanel tool={tool} onBack={vi.fn()} onSelectSkill={vi.fn()} onAddSkill={vi.fn()} />)
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })

  it('renders Skills heading', () => {
    render(<SkillsListPanel tool={tool} onBack={vi.fn()} onSelectSkill={vi.fn()} onAddSkill={vi.fn()} />)
    expect(screen.getByText('Skills')).toBeInTheDocument()
  })

  it('lists all skills', () => {
    render(<SkillsListPanel tool={tool} onBack={vi.fn()} onSelectSkill={vi.fn()} onAddSkill={vi.fn()} />)
    expect(screen.getByText('impeccable')).toBeInTheDocument()
    expect(screen.getByText('graphify')).toBeInTheDocument()
    expect(screen.getByText('xlsx')).toBeInTheDocument()
  })

  it('inactive skill row has opacity-40', () => {
    render(<SkillsListPanel tool={tool} onBack={vi.fn()} onSelectSkill={vi.fn()} onAddSkill={vi.fn()} />)
    const xlsxBtn = screen.getByText('xlsx').closest('button')
    expect(xlsxBtn).toHaveClass('opacity-40')
  })

  it('back button calls onBack', () => {
    const onBack = vi.fn()
    render(<SkillsListPanel tool={tool} onBack={onBack} onSelectSkill={vi.fn()} onAddSkill={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Back'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('clicking skill calls onSelectSkill', () => {
    const onSelectSkill = vi.fn()
    render(<SkillsListPanel tool={tool} onBack={vi.fn()} onSelectSkill={onSelectSkill} onAddSkill={vi.fn()} />)
    fireEvent.click(screen.getByText('impeccable'))
    expect(onSelectSkill).toHaveBeenCalledWith(tool.skills[0])
  })

  it('shows search input when more than 5 skills', () => {
    render(<SkillsListPanel tool={tool} onBack={vi.fn()} onSelectSkill={vi.fn()} onAddSkill={vi.fn()} />)
    expect(screen.getByPlaceholderText('Filter skills…')).toBeInTheDocument()
  })

  it('hides search input when 5 or fewer skills', () => {
    const smallTool = { ...tool, skills: tool.skills.slice(0, 3) }
    render(<SkillsListPanel tool={smallTool} onBack={vi.fn()} onSelectSkill={vi.fn()} onAddSkill={vi.fn()} />)
    expect(screen.queryByPlaceholderText('Filter skills…')).not.toBeInTheDocument()
  })

  it('search filters skill list', () => {
    render(<SkillsListPanel tool={tool} onBack={vi.fn()} onSelectSkill={vi.fn()} onAddSkill={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Filter skills…'), { target: { value: 'imp' } })
    expect(screen.getByText('impeccable')).toBeInTheDocument()
    expect(screen.queryByText('graphify')).not.toBeInTheDocument()
  })

  it('shows no-match message when filter has no results', () => {
    render(<SkillsListPanel tool={tool} onBack={vi.fn()} onSelectSkill={vi.fn()} onAddSkill={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Filter skills…'), { target: { value: 'zzz' } })
    expect(screen.getByText(/No skills matching/)).toBeInTheDocument()
  })

  it('shows count of filtered skills', () => {
    render(<SkillsListPanel tool={tool} onBack={vi.fn()} onSelectSkill={vi.fn()} onAddSkill={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Filter skills…'), { target: { value: 'imp' } })
    expect(screen.getByText('1')).toBeInTheDocument()
  })
})
