import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AllSkillsView from '../views/AllSkillsView'
import type { Agent, Skill } from '../../types'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('../../analytics', () => ({ capture: vi.fn(), captureException: vi.fn() }))

import { invoke } from '@tauri-apps/api/core'
const mockInvoke = vi.mocked(invoke)

beforeEach(() => {
  mockInvoke.mockReset()
  mockInvoke.mockResolvedValue(undefined)
})

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

describe('AllSkillsView — sorting', () => {
  const mixedTool = makeTool('claude', 'Claude Code', [
    makeSkill({ name: 'alpha-disabled', active: false }),
    makeSkill({ name: 'zeta-enabled', active: true }),
  ])

  it('defaults to alphabetical order', () => {
    const { container } = render(<AllSkillsView agents={[mixedTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    const text = container.textContent ?? ''
    expect(text.indexOf('alpha-disabled')).toBeLessThan(text.indexOf('zeta-enabled'))
  })

  it('clicking the sort control switches to enabled-first order', () => {
    const { container } = render(<AllSkillsView agents={[mixedTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    fireEvent.click(screen.getByTitle(/click to sort by enabled status/i))
    expect(screen.getByText('Enabled first')).toBeInTheDocument()
    const text = container.textContent ?? ''
    expect(text.indexOf('zeta-enabled')).toBeLessThan(text.indexOf('alpha-disabled'))
  })

  it('clicking the sort control twice returns to alphabetical order', () => {
    render(<AllSkillsView agents={[mixedTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    const toggle = () => fireEvent.click(screen.getByText(/name|enabled first/i))
    toggle()
    toggle()
    expect(screen.getByText('Name')).toBeInTheDocument()
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

describe('AllSkillsView — agent selector switches to a dropdown at 3+ agents', () => {
  const geminiTool = makeTool('gemini', 'Gemini', [makeSkill({ name: 'gemini-only' })])

  it('renders chips (not the dropdown) with 2 installed agents', () => {
    render(<AllSkillsView agents={[claudeTool, cursorTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    expect(screen.getByTestId('agent-filter-chips')).toBeInTheDocument()
    expect(screen.queryByTestId('agent-filter-dropdown')).not.toBeInTheDocument()
  })

  it('renders the dropdown (not chips) with 3 installed agents', () => {
    render(<AllSkillsView agents={[claudeTool, cursorTool, geminiTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    expect(screen.getByTestId('agent-filter-dropdown')).toBeInTheDocument()
    expect(screen.queryByTestId('agent-filter-chips')).not.toBeInTheDocument()
  })

  it('dropdown starts labeled "All agents" and narrows when one is unchecked', () => {
    render(<AllSkillsView agents={[claudeTool, cursorTool, geminiTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    const dropdown = screen.getByTestId('agent-filter-dropdown')
    expect(within(dropdown).getByText('All agents')).toBeInTheDocument()
    fireEvent.click(within(dropdown).getByText('All agents'))
    fireEvent.click(within(dropdown).getByText('Gemini'))
    // graphify (Claude-only) and cursor-review (Cursor-only) both stay visible —
    // unchecking Gemini deselects just Gemini, not everyone else (no solo).
    expect(screen.getByText('graphify')).toBeInTheDocument()
    expect(screen.getByText('cursor-review')).toBeInTheDocument()
    expect(screen.queryByText('gemini-only')).not.toBeInTheDocument()
    expect(within(dropdown).getByText('2 of 3 agents')).toBeInTheDocument()
  })
})

describe('AllSkillsView — status filter (All / Active / Inactive)', () => {
  const mixedStatusTool = makeTool('claude', 'Claude Code', [
    makeSkill({ name: 'on-skill', active: true }),
    makeSkill({ name: 'off-skill', active: false }),
  ])

  it('defaults to showing both active and inactive skills', () => {
    render(<AllSkillsView agents={[mixedStatusTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    expect(screen.getByText('on-skill')).toBeInTheDocument()
    expect(screen.getByText('off-skill')).toBeInTheDocument()
  })

  it('"Active" narrows to skills with at least one enabled variant', () => {
    render(<AllSkillsView agents={[mixedStatusTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    fireEvent.click(within(screen.getByTestId('status-filter')).getByText('Active'))
    expect(screen.getByText('on-skill')).toBeInTheDocument()
    expect(screen.queryByText('off-skill')).not.toBeInTheDocument()
  })

  it('"Inactive" narrows to skills with no enabled variant', () => {
    render(<AllSkillsView agents={[mixedStatusTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    fireEvent.click(within(screen.getByTestId('status-filter')).getByText('Inactive'))
    expect(screen.getByText('off-skill')).toBeInTheDocument()
    expect(screen.queryByText('on-skill')).not.toBeInTheDocument()
  })

  it('"All" restores both after narrowing', () => {
    render(<AllSkillsView agents={[mixedStatusTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    const bar = screen.getByTestId('status-filter')
    fireEvent.click(within(bar).getByText('Active'))
    fireEvent.click(within(bar).getByText('All'))
    expect(screen.getByText('on-skill')).toBeInTheDocument()
    expect(screen.getByText('off-skill')).toBeInTheDocument()
  })
})

describe('AllSkillsView — remove everywhere from the list row', () => {
  it('shows a warning naming every agent the skill is on, before removing anything', () => {
    render(<AllSkillsView agents={[claudeTool, cursorTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Remove impeccable from all agents'))
    const banner = screen.getByText(/Remove completely\?/).closest('p')!
    expect(banner.textContent).toContain('Claude Code')
    expect(banner.textContent).toContain('Cursor')
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('cancel dismisses without removing anything', () => {
    render(<AllSkillsView agents={[claudeTool, cursorTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Remove impeccable from all agents'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText(/Remove completely\?/)).not.toBeInTheDocument()
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('confirming removes the skill from every agent that has it and refreshes', async () => {
    const onInstalled = vi.fn().mockResolvedValue(undefined)
    render(<AllSkillsView agents={[claudeTool, cursorTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} onInstalled={onInstalled} />)
    // "impeccable" exists on both Claude and Cursor
    fireEvent.click(screen.getByLabelText('Remove impeccable from all agents'))
    fireEvent.click(screen.getByText('Remove completely'))

    await waitFor(() => expect(onInstalled).toHaveBeenCalled())
    const removeCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'remove_skill')
    expect(removeCalls).toHaveLength(2)
    expect(removeCalls.map(([, args]) => (args as { agentId: string }).agentId).sort()).toEqual(['claude', 'cursor'])
    expect(screen.queryByText(/Remove completely\?/)).not.toBeInTheDocument()
  })

  it('a skill installed on only one agent only removes from that one', async () => {
    const onInstalled = vi.fn().mockResolvedValue(undefined)
    render(<AllSkillsView agents={[claudeTool, cursorTool]} onBack={vi.fn()} onSelectSkill={vi.fn()} onInstalled={onInstalled} />)
    // "graphify" only exists on Claude
    fireEvent.click(screen.getByLabelText('Remove graphify from all agents'))
    fireEvent.click(screen.getByText('Remove completely'))

    await waitFor(() => expect(onInstalled).toHaveBeenCalled())
    const removeCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'remove_skill')
    expect(removeCalls).toHaveLength(1)
    expect((removeCalls[0][1] as { agentId: string }).agentId).toBe('claude')
  })
})
