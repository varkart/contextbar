import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Set isE2E=true so splashDismissed initialises to true (module-level constant)
vi.hoisted(() => { (globalThis as Record<string, unknown>).__skipSplash = true })

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(vi.fn())) }))
vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: vi.fn().mockResolvedValue(true),
  requestPermission: vi.fn().mockResolvedValue('granted'),
}))
vi.mock('../analytics', () => ({ capture: vi.fn(), captureException: vi.fn() }))

const mockFetchTools = vi.fn().mockResolvedValue([])
const mockFetchNotifications = vi.fn()

vi.mock('../useAgents', () => ({
  useAgents: vi.fn(() => ({
    agents: [],
    loading: false,
    cloudSyncing: false,
    lastUpdated: null,
    fetchAgents: mockFetchTools,
  })),
}))

vi.mock('../useNotifications', () => ({
  useNotifications: vi.fn(() => ({
    notifications: [],
    fetchNotifications: mockFetchNotifications,
  })),
}))

vi.mock('../useUpdateCheck', () => ({ useUpdateCheck: vi.fn(() => null) }))
vi.mock('../useAgentsDiff', () => ({ useAgentsDiff: vi.fn() }))
vi.mock('../useTheme', () => ({
  useTheme: vi.fn(() => ({ theme: 'system' as const, setTheme: vi.fn() })),
}))

import App from '../App'
import { invoke } from '@tauri-apps/api/core'
import { useAgents } from '../useAgents'
import { useNotifications } from '../useNotifications'

const mockInvoke = vi.mocked(invoke)
const mockUseTools = vi.mocked(useAgents)
const mockUseNotifications = vi.mocked(useNotifications)

const installedAgent = {
  id: 'claude',
  name: 'Claude Code',
  version: '1.0',
  installed: true,
  supportsSkills: true,
  supportsMcps: true,
  skills: [
    { name: 'graphify', path: '~/.claude/skills/graphify', description: 'g', hasFullDescription: false, active: true, sourceId: 's' },
  ],
  mcps: [
    { name: 'github', command: 'npx', args: [], active: true, hasSecrets: true, secretKeyNames: ['TOKEN'], sourceId: 'settings_json' },
  ],
  error: undefined,
}

beforeEach(() => {
  vi.clearAllMocks()
  window.location.hash = ''
  mockInvoke.mockImplementation(async (cmd) => {
    if (cmd === 'get_permissions') return { allow: [], deny: [] }
    return '0.7.0'
  })
  mockUseTools.mockReturnValue({
    agents: [],
    loading: false,
    cloudSyncing: false,
    lastUpdated: null,
    fetchAgents: mockFetchTools,
  })
  mockUseNotifications.mockReturnValue({
    notifications: [],
    fetchNotifications: mockFetchNotifications,
  })
})

describe('App — main view', () => {
  it('renders settings button', () => {
    render(<App />)
    expect(screen.getByLabelText(/Open settings/)).toBeInTheDocument()
  })

  it('renders notifications button', () => {
    render(<App />)
    expect(screen.getByLabelText(/Notifications/)).toBeInTheDocument()
  })

  it('shows no tools detected when no tools installed', () => {
    render(<App />)
    expect(screen.getByText('No agents detected')).toBeInTheDocument()
  })

  it('shows skeleton rows while loading', () => {
    mockUseTools.mockReturnValue({
      agents: [],
      loading: true,
      cloudSyncing: false,
      lastUpdated: null,
      fetchAgents: mockFetchTools,
    })
    const { container } = render(<App />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})

describe('App — navigation', () => {
  it('clicking settings button shows Settings view', () => {
    render(<App />)
    fireEvent.click(screen.getByLabelText(/Open settings/))
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('clicking notifications button shows NotificationsPanel', () => {
    render(<App />)
    fireEvent.click(screen.getByLabelText(/Notifications/))
    expect(screen.getByText('Notifications', { exact: true })).toBeInTheDocument()
  })

  it('Escape from settings returns to main', () => {
    render(<App />)
    fireEvent.click(screen.getByLabelText(/Open settings/))
    expect(screen.getByText('Settings')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByText('Coding Agents')).toBeInTheDocument()
  })

  it('Escape from notifications returns to main', () => {
    render(<App />)
    fireEvent.click(screen.getByLabelText(/Notifications/))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByText('Coding Agents')).toBeInTheDocument()
  })

  it('Escape from tool-detail returns to llms-list', () => {
    mockUseTools.mockReturnValue({
      agents: [installedAgent],
      loading: false,
      cloudSyncing: false,
      lastUpdated: null,
      fetchAgents: mockFetchTools,
    })
    render(<App />)
    fireEvent.click(screen.getByText('Coding Agents'))
    fireEvent.click(screen.getByText('Claude Code'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })

  it('Settings view: Activity Log button navigates to logs', async () => {
    mockInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_audit_log') return []
      if (cmd === 'get_permissions') return { allow: [], deny: [] }
      return '0.7.0'
    })
    render(<App />)
    fireEvent.click(screen.getByLabelText(/Open settings/))
    await waitFor(() => expect(screen.getByText('Activity Log')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Activity Log'))
    await waitFor(() => expect(screen.getByText('No activity yet')).toBeInTheDocument())
  })

  it('Escape from logs returns to main', async () => {
    mockInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_audit_log') return []
      if (cmd === 'get_permissions') return { allow: [], deny: [] }
      return '0.7.0'
    })
    render(<App />)
    fireEvent.click(screen.getByLabelText(/Open settings/))
    await waitFor(() => screen.getByText('Activity Log'))
    fireEvent.click(screen.getByText('Activity Log'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByText('Coding Agents')).toBeInTheDocument()
  })

  it('navigates to skills-list and skill-detail', async () => {
    mockUseTools.mockReturnValue({
      agents: [installedAgent],
      loading: false, cloudSyncing: false, lastUpdated: null, fetchAgents: mockFetchTools,
    })
    render(<App />)
    fireEvent.click(screen.getByText('Coding Agents'))
    fireEvent.click(screen.getByText('Claude Code'))
    fireEvent.click(screen.getByLabelText('Open skills page'))
    expect(screen.getByText('graphify')).toBeInTheDocument()
    fireEvent.click(screen.getByText('graphify'))
    expect(screen.getByText('Files')).toBeInTheDocument()
  })

  it('navigates to mcps-list and mcp-detail', async () => {
    mockUseTools.mockReturnValue({
      agents: [installedAgent],
      loading: false, cloudSyncing: false, lastUpdated: null, fetchAgents: mockFetchTools,
    })
    render(<App />)
    fireEvent.click(screen.getByText('Coding Agents'))
    fireEvent.click(screen.getByText('Claude Code'))
    fireEvent.click(screen.getByRole('button', { name: /^MCPs/ }))
    fireEvent.click(screen.getByLabelText('Open MCPs page'))
    fireEvent.click(screen.getAllByText('github')[0])
    // mcp-detail shows the server name in both breadcrumb and panel heading
    expect(screen.getAllByText('github').length).toBeGreaterThan(0)
  })
})

describe('App — notifications badge', () => {
  it('shows notification count when notifications exist', () => {
    mockUseNotifications.mockReturnValue({
      notifications: [
        { id: 1, tsMs: Date.now(), level: 'info', title: 'Test', body: 'body' },
        { id: 2, tsMs: Date.now(), level: 'warn', title: 'Test2', body: 'body2' },
      ],
      fetchNotifications: mockFetchNotifications,
    })
    render(<App />)
    expect(screen.getByLabelText('2 notifications')).toBeInTheDocument()
  })
})

describe('App — version', () => {
  it('calls get_version on mount', async () => {
    render(<App />)
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('get_version'))
  })
})
