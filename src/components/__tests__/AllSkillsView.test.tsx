import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import AllSkillsView from '../views/AllSkillsView'
import type { Agent, Skill } from '../../types'

function makeSkill(overrides: Partial<Skill> & Pick<Skill, 'name'>): Skill {
  return {
    path: `~/.claude/skills/${overrides.name}`,
    hasFullDescription: false,
    active: true,
    sourceId: 'skills_dir',
    ...overrides,
  }
}

function makeTool(id: string, name: string, skills: Skill[], installed = true): Agent {
  return {
    id,
    name,
    installed,
    supportsSkills: true,
    supportsMcps: true,
    skills,
    mcps: [],
  }
}

const claudeSkills = [
  makeSkill({ name: 'impeccable', description: 'Polish frontend UI' }),
  makeSkill({ name: 'graphify', description: 'Knowledge graph from any input' }),
  makeSkill({ name: 'canvas-design', description: 'Design canvas layouts' }),
]

const cursorSkills = [
  makeSkill({ name: 'impeccable', description: 'Polish frontend UI' }),
  makeSkill({ name: 'cursor-review', description: 'Code review for Cursor' }),
]

const singleTool = makeTool('claude', 'Claude Code', claudeSkills)
const claudeTool = makeTool('claude', 'Claude Code', claudeSkills)
const cursorTool = makeTool('cursor', 'Cursor', cursorSkills)

describe('AllSkillsView — renders skills', () => {
  it('renders all unique skill names from installed tools', () => {
    render(<AllSkillsView agents={[singleTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    expect(screen.getByText('impeccable')).toBeInTheDocument()
    expect(screen.getByText('graphify')).toBeInTheDocument()
    expect(screen.getByText('canvas-design')).toBeInTheDocument()
  })

  it('does not render skills from uninstalled tools', () => {
    const notInstalled = makeTool('cursor', 'Cursor', [makeSkill({ name: 'cursor-only' })], false)
    render(<AllSkillsView agents={[singleTool, notInstalled]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    expect(screen.queryByText('cursor-only')).not.toBeInTheDocument()
  })

  it('exposes skill description as row tooltip', () => {
    render(<AllSkillsView agents={[singleTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    expect(screen.getByTitle('Polish frontend UI')).toBeInTheDocument()
  })

  it('deduplicates skills with the same name across tools', () => {
    // impeccable exists in both claude and cursor, should appear only once as a row
    render(<AllSkillsView agents={[claudeTool, cursorTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    const impeccables = screen.getAllByText('impeccable')
    expect(impeccables).toHaveLength(1)
  })
})

describe('AllSkillsView — search', () => {
  it('search filters skills by name', () => {
    render(<AllSkillsView agents={[singleTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Search skills…'), { target: { value: 'graph' } })
    expect(screen.getByText('graphify')).toBeInTheDocument()
    expect(screen.queryByText('impeccable')).not.toBeInTheDocument()
    expect(screen.queryByText('canvas-design')).not.toBeInTheDocument()
  })

  it('search filters skills by description', () => {
    render(<AllSkillsView agents={[singleTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Search skills…'), { target: { value: 'frontend' } })
    expect(screen.getByText('impeccable')).toBeInTheDocument()
    expect(screen.queryByText('graphify')).not.toBeInTheDocument()
  })

  it('shows empty state when search matches nothing', () => {
    render(<AllSkillsView agents={[singleTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Search skills…'), { target: { value: 'zzznomatch' } })
    expect(screen.getByText('No skills match')).toBeInTheDocument()
  })

  it('shows count label filtered when search active', () => {
    render(<AllSkillsView agents={[singleTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Search skills…'), { target: { value: 'graph' } })
    expect(screen.getByText(/1 of 3 skills/)).toBeInTheDocument()
  })

  it('shows full count + installs when no filter active', () => {
    render(<AllSkillsView agents={[singleTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    expect(screen.getByText(/3 skills · 3 installs/)).toBeInTheDocument()
  })
})

describe('AllSkillsView — provider chips', () => {
  it('does not render provider chips when only one installed tool', () => {
    render(<AllSkillsView agents={[singleTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    // AgentChips renders nothing when installedAgents.length <= 1
    expect(screen.queryByText('Claude Code')).not.toBeInTheDocument()
  })

  it('renders provider chips when multiple installed tools', () => {
    render(<AllSkillsView agents={[claudeTool, cursorTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByText('Cursor')).toBeInTheDocument()
  })
})

describe('AllSkillsView — interaction', () => {
  it('clicking a skill calls onSelectSkill with the primary skill', () => {
    const onSelectSkill = vi.fn()
    render(<AllSkillsView agents={[singleTool]} onBack={vi.fn()} onSelectSkill={onSelectSkill} />)
    fireEvent.click(screen.getByText('impeccable'))
    expect(onSelectSkill).toHaveBeenCalledTimes(1)
    expect(onSelectSkill).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'impeccable' })
    )
  })

  it('deselecting a provider chip hides that provider\'s exclusive skills', () => {
    // cursor-review only exists in Cursor; clicking Cursor chip should hide it
    render(<AllSkillsView agents={[claudeTool, cursorTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    // Initially cursor-review is visible
    expect(screen.getByText('cursor-review')).toBeInTheDocument()
    // Deselect Cursor chip
    fireEvent.click(screen.getByText('Cursor').closest('button')!)
    // cursor-review should be hidden
    expect(screen.queryByText('cursor-review')).not.toBeInTheDocument()
    // claude-only skills remain visible
    expect(screen.getByText('graphify')).toBeInTheDocument()
  })
})
