import { render, screen, fireEvent, within } from '@testing-library/react'
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

  it('shows skill description inline under the name', () => {
    render(<AllSkillsView agents={[singleTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    expect(screen.getByText('Polish frontend UI')).toBeInTheDocument()
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
    const filterBar = within(screen.getByTestId('agent-filter-chips'))
    expect(filterBar.getByText('Claude Code')).toBeInTheDocument()
    expect(filterBar.getByText('Cursor')).toBeInTheDocument()
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

  it('clicking a provider chip solos that provider, hiding the others\' exclusive skills', () => {
    // graphify only exists in Claude; clicking the Cursor chip should solo Cursor and hide it
    render(<AllSkillsView agents={[claudeTool, cursorTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    // Initially both are visible
    expect(screen.getByText('cursor-review')).toBeInTheDocument()
    expect(screen.getByText('graphify')).toBeInTheDocument()
    // Solo the Cursor filter chip
    fireEvent.click(within(screen.getByTestId('agent-filter-chips')).getByText('Cursor').closest('button')!)
    // Claude-exclusive skill should be hidden
    expect(screen.queryByText('graphify')).not.toBeInTheDocument()
    // Cursor-exclusive skill remains visible
    expect(screen.getByText('cursor-review')).toBeInTheDocument()
  })
})
