import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ViewManager renders children that call Tauri APIs (Settings, LogsPanel, etc.)
// Mock them up-front so every test that triggers those views doesn't throw.
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(vi.fn())) }))
vi.mock('../../analytics', () => ({ capture: vi.fn(), captureException: vi.fn() }))

import ViewManager from '../views/ViewManager'
import type { AiTool, Skill, McpServer } from '../../types'

function makeSkill(name: string): Skill {
  return {
    name,
    path: `~/.claude/skills/${name}`,
    hasFullDescription: false,
    active: true,
    sourceId: 'skills_dir',
  }
}

function makeMcp(name: string): McpServer {
  return {
    name,
    command: 'npx',
    args: [],
    active: true,
    hasSecrets: false,
    secretKeyNames: [],
    sourceId: 'settings_json',
  }
}

const mockTool: AiTool = {
  id: 'claude',
  name: 'Claude Code',
  version: '1.0.0',
  installed: true,
  supportsSkills: true,
  supportsMcps: true,
  skills: [makeSkill('impeccable'), makeSkill('graphify')],
  mcps: [makeMcp('github'), makeMcp('netlify')],
}

// Minimal props that satisfy ViewManager's `any` typed interface.
// Individual tests override only what they need.
function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    view: 'main',
    llmsListMode: 'default',
    selectedTool: null,
    selectedSkill: null,
    selectedMcp: null,
    selectTool: vi.fn(),
    openLlmsList: vi.fn(),
    openSkillsListForTool: vi.fn(),
    openMcpsListForTool: vi.fn(),
    selectSkill: vi.fn(),
    selectMcp: vi.fn(),
    openSkillsPage: vi.fn(),
    openMcpsPage: vi.fn(),
    goTo: vi.fn(),
    escape: vi.fn(),
    query: '',
    loading: false,
    tools: [mockTool],
    installedTools: [mockTool],
    searchResults: [],
    notifications: [],
    updateInfo: null,
    lastUpdated: null,
    cloudSyncing: false,
    handleFetchTools: vi.fn(),
    theme: 'system' as const,
    setTheme: vi.fn(),
    fetchNotifications: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ViewManager — main view (default fallback)', () => {
  it('renders MainView when view is "main"', () => {
    render(<ViewManager {...makeProps({ view: 'main' })} />)
    // MainView shows the "Coding Agents" tile
    expect(screen.getByText('Coding Agents')).toBeInTheDocument()
  })

  it('renders MainView when view is an unrecognised string (fallback)', () => {
    render(<ViewManager {...makeProps({ view: 'unknown-view' })} />)
    expect(screen.getByText('Coding Agents')).toBeInTheDocument()
  })
})

describe('ViewManager — settings view', () => {
  it('renders Settings when view is "settings"', () => {
    render(
      <ViewManager
        {...makeProps({ view: 'settings' })}
      />
    )
    // Settings always shows a "General" section heading
    expect(screen.getByText('General')).toBeInTheDocument()
  })
})

describe('ViewManager — llms-list view', () => {
  it('renders LlmsListView when view is "llms-list"', () => {
    render(<ViewManager {...makeProps({ view: 'llms-list' })} />)
    // LlmsListView renders the tool name
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })
})

describe('ViewManager — all-skills-list view', () => {
  it('renders AllSkillsView when view is "all-skills-list"', () => {
    render(<ViewManager {...makeProps({ view: 'all-skills-list' })} />)
    expect(screen.getByPlaceholderText('Search skills…')).toBeInTheDocument()
    expect(screen.getByText('impeccable')).toBeInTheDocument()
    expect(screen.getByText('graphify')).toBeInTheDocument()
  })
})

describe('ViewManager — all-mcps-list view', () => {
  it('renders AllMcpsView when view is "all-mcps-list"', () => {
    render(<ViewManager {...makeProps({ view: 'all-mcps-list' })} />)
    expect(screen.getByPlaceholderText('Search MCPs…')).toBeInTheDocument()
    expect(screen.getByText('github')).toBeInTheDocument()
    expect(screen.getByText('netlify')).toBeInTheDocument()
  })
})

describe('ViewManager — skills-list view', () => {
  it('renders SkillsListPanel when view is "skills-list" and selectedTool is set', () => {
    render(<ViewManager {...makeProps({ view: 'skills-list', selectedTool: mockTool })} />)
    // SkillsListPanel shows a "Filter skills…" placeholder
    expect(screen.getByPlaceholderText('Filter skills…')).toBeInTheDocument()
  })

  it('falls back to MainView when view is "skills-list" but selectedTool is null', () => {
    render(<ViewManager {...makeProps({ view: 'skills-list', selectedTool: null })} />)
    expect(screen.getByText('Coding Agents')).toBeInTheDocument()
  })
})

describe('ViewManager — mcps-list view', () => {
  it('renders McpsListPanel when view is "mcps-list" and selectedTool is set', () => {
    render(<ViewManager {...makeProps({ view: 'mcps-list', selectedTool: mockTool })} />)
    expect(screen.getByPlaceholderText('Filter MCPs…')).toBeInTheDocument()
  })

  it('falls back to MainView when view is "mcps-list" but selectedTool is null', () => {
    render(<ViewManager {...makeProps({ view: 'mcps-list', selectedTool: null })} />)
    expect(screen.getByText('Coding Agents')).toBeInTheDocument()
  })
})

describe('ViewManager — tool-detail view', () => {
  it('renders ToolDetailPage when view is "tool-detail" and selectedTool is set', () => {
    render(<ViewManager {...makeProps({ view: 'tool-detail', selectedTool: mockTool })} />)
    // ToolDetailPage shows the tool name prominently
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })

  it('falls back to MainView when view is "tool-detail" but selectedTool is null', () => {
    render(<ViewManager {...makeProps({ view: 'tool-detail', selectedTool: null })} />)
    expect(screen.getByText('Coding Agents')).toBeInTheDocument()
  })
})
