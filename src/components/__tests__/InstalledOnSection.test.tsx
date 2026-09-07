import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SkillInstalledOn, McpInstalledOn } from '../InstalledOnSection'
import type { Agent, Skill, McpServer } from '../../types'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('../../analytics', () => ({ capture: vi.fn(), captureException: vi.fn() }))

import { invoke } from '@tauri-apps/api/core'
const mockInvoke = vi.mocked(invoke)

function makeSkill(overrides: Partial<Skill> & Pick<Skill, 'name'>): Skill {
  return {
    path: `~/.claude/skills/${overrides.name}`,
    hasFullDescription: false,
    active: true,
    sourceId: 'skills_dir',
    ...overrides,
  }
}

function makeAgent(id: string, name: string, skills: Skill[], mcps: McpServer[] = []): Agent {
  return { id, name, installed: true, supportsSkills: true, supportsMcps: true, skills, mcps }
}

function makeMcp(overrides: Partial<McpServer> & Pick<McpServer, 'name'>): McpServer {
  return {
    command: 'npx',
    args: [],
    active: true,
    hasSecrets: false,
    secretKeyNames: [],
    sourceId: 'settings_json',
    ...overrides,
  }
}

beforeEach(() => {
  mockInvoke.mockReset()
  mockInvoke.mockResolvedValue(undefined)
})

describe('SkillInstalledOn — remove everywhere', () => {
  const skill = makeSkill({ name: 'human-review' })
  const claude = makeAgent('claude', 'Claude Code', [skill])
  const cursor = makeAgent('cursor', 'Cursor', [makeSkill({ name: 'human-review', path: '~/.cursor/skills/human-review' })])

  it('shows a warning banner naming every installed agent before removing', () => {
    render(
      <SkillInstalledOn skill={skill} currentAgentId="claude" allAgents={[claude, cursor]} onInstalled={vi.fn()} />
    )
    fireEvent.click(screen.getByLabelText('Remove skill from all agents'))
    const banner = screen.getByText(/Remove completely\?/).closest('p')!
    expect(within(banner).getByText('human-review')).toBeInTheDocument()
    expect(banner.textContent).toContain('Claude Code')
    expect(banner.textContent).toContain('Cursor')
    // Nothing happens until confirmed
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('cancel dismisses the banner without calling remove_skill', () => {
    render(
      <SkillInstalledOn skill={skill} currentAgentId="claude" allAgents={[claude, cursor]} onInstalled={vi.fn()} />
    )
    fireEvent.click(screen.getByLabelText('Remove skill from all agents'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText(/Remove completely\?/)).not.toBeInTheDocument()
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('confirming removes the skill from every installed agent and refreshes', async () => {
    const onInstalled = vi.fn().mockResolvedValue(undefined)
    render(
      <SkillInstalledOn skill={skill} currentAgentId="claude" allAgents={[claude, cursor]} onInstalled={onInstalled} />
    )
    fireEvent.click(screen.getByLabelText('Remove skill from all agents'))
    fireEvent.click(screen.getByText('Remove completely'))

    await waitFor(() => expect(onInstalled).toHaveBeenCalled(), { timeout: 3000 })

    const removeCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'remove_skill')
    expect(removeCalls).toHaveLength(2)
    expect(removeCalls.map(([, args]) => (args as { agentId: string }).agentId).sort()).toEqual(['claude', 'cursor'])
    // Banner closes on success
    expect(screen.queryByText(/Remove completely\?/)).not.toBeInTheDocument()
  })

  it('keeps the banner open and shows the error if a removal fails', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('disk full'))
    const onInstalled = vi.fn().mockResolvedValue(undefined)
    render(
      <SkillInstalledOn skill={skill} currentAgentId="claude" allAgents={[claude, cursor]} onInstalled={onInstalled} />
    )
    fireEvent.click(screen.getByLabelText('Remove skill from all agents'))
    fireEvent.click(screen.getByText('Remove completely'))

    await waitFor(() => expect(screen.getByText(/disk full/)).toBeInTheDocument())
    expect(screen.getByText(/Remove completely\?/)).toBeInTheDocument()
  })

  it('does not show the action when the skill has no installed variants', () => {
    const orphanSkill = makeSkill({ name: 'ghost' })
    render(
      <SkillInstalledOn skill={orphanSkill} currentAgentId="claude" allAgents={[claude]} onInstalled={vi.fn()} />
    )
    expect(screen.queryByLabelText('Remove skill from all agents')).not.toBeInTheDocument()
  })
})

describe('McpInstalledOn — remove everywhere', () => {
  const mcp = makeMcp({ name: 'github' })
  const claude = makeAgent('claude', 'Claude Code', [], [mcp])
  const cursor = makeAgent('cursor', 'Cursor', [], [makeMcp({ name: 'github' })])

  it('removes the MCP from every installed agent on confirm', async () => {
    const onInstalled = vi.fn().mockResolvedValue(undefined)
    render(
      <McpInstalledOn mcp={mcp} currentAgentId="claude" allAgents={[claude, cursor]} onInstalled={onInstalled} />
    )
    fireEvent.click(screen.getByLabelText('Remove MCP from all agents'))
    expect(within(screen.getByText(/Remove completely\?/).parentElement!).getByText(/github/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Remove completely'))

    await waitFor(() => expect(onInstalled).toHaveBeenCalled(), { timeout: 3000 })
    const removeCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'remove_mcp')
    expect(removeCalls).toHaveLength(2)
  })

  it('navigates back when the current agent is among the removed variants', async () => {
    const onBack = vi.fn()
    render(
      <McpInstalledOn mcp={mcp} currentAgentId="claude" allAgents={[claude, cursor]} onInstalled={vi.fn()} onBack={onBack} />
    )
    fireEvent.click(screen.getByLabelText('Remove MCP from all agents'))
    fireEvent.click(screen.getByText('Remove completely'))
    await waitFor(() => expect(onBack).toHaveBeenCalled(), { timeout: 3000 })
  })
})
