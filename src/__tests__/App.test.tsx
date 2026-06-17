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

vi.mock('../useTools', () => ({
  useTools: vi.fn(() => ({
    tools: [],
    loading: false,
    cloudSyncing: false,
    lastUpdated: null,
    fetchTools: mockFetchTools,
  })),
}))

vi.mock('../useNotifications', () => ({
  useNotifications: vi.fn(() => ({
    notifications: [],
    fetchNotifications: mockFetchNotifications,
  })),
}))

vi.mock('../useUpdateCheck', () => ({ useUpdateCheck: vi.fn(() => null) }))
vi.mock('../useToolsDiff', () => ({ useToolsDiff: vi.fn() }))
vi.mock('../useTheme', () => ({
  useTheme: vi.fn(() => ({ theme: 'system' as const, setTheme: vi.fn() })),
}))

import App from '../App'
import { invoke } from '@tauri-apps/api/core'
import { useTools } from '../useTools'
import { useNotifications } from '../useNotifications'

const mockInvoke = vi.mocked(invoke)
const mockUseTools = vi.mocked(useTools)
const mockUseNotifications = vi.mocked(useNotifications)

const installedTool = {
  id: 'claude',
  name: 'Claude Code',
  version: '1.0',
  installed: true,
  skills: [
    { name: 'graphify', path: '~/.claude/skills/graphify', description: 'g', active: true, sourceId: 's' },
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
    tools: [],
    loading: false,
    cloudSyncing: false,
    lastUpdated: null,
    fetchTools: mockFetchTools,
  })
  mockUseNotifications.mockReturnValue({
    notifications: [],
    fetchNotifications: mockFetchNotifications,
  })
})

describe('App — main view', () => {
  it('renders search bar', () => {
    render(<App />)
    expect(screen.getByPlaceholderText(/Search tools/)).toBeInTheDocument()
  })

  it('renders settings button', () => {
    render(<App />)
    expect(screen.getByLabelText(/Open settings/)).toBeInTheDocument()
  })

  it('renders notifications button', () => {
    render(<App />)
    expect(screen.getByLabelText(/Notifications/)).toBeInTheDocument()
  })

  it('shows empty state when no tools installed', () => {
    render(<App />)
    expect(screen.getByText('No AI tools detected')).toBeInTheDocument()
  })

  it('shows skeleton rows while loading', () => {
    mockUseTools.mockReturnValue({
      tools: [],
      loading: true,
      cloudSyncing: false,
      lastUpdated: null,
      fetchTools: mockFetchTools,
    })
    const { container } = render(<App />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('shows tool rows when tools installed', () => {
    mockUseTools.mockReturnValue({
      tools: [installedTool],
      loading: false,
      cloudSyncing: false,
      lastUpdated: null,
      fetchTools: mockFetchTools,
    })
    render(<App />)
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })

  it('shows no-results message when search has no match', () => {
    mockUseTools.mockReturnValue({
      tools: [installedTool],
      loading: false,
      cloudSyncing: false,
      lastUpdated: null,
      fetchTools: mockFetchTools,
    })
    render(<App />)
    fireEvent.change(screen.getByPlaceholderText(/Search tools/), { target: { value: 'zzznomatch' } })
    expect(screen.getByText(/No results for/)).toBeInTheDocument()
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

  it('clicking tool row navigates to tool-detail', () => {
    mockUseTools.mockReturnValue({
      tools: [installedTool],
      loading: false,
      cloudSyncing: false,
      lastUpdated: null,
      fetchTools: mockFetchTools,
    })
    render(<App />)
    fireEvent.click(screen.getByText('Claude Code'))
    expect(screen.getAllByText('Claude Code').length).toBeGreaterThan(0)
  })

  it('Escape from settings returns to main', () => {
    render(<App />)
    fireEvent.click(screen.getByLabelText(/Open settings/))
    expect(screen.getByText('Settings')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByPlaceholderText(/Search tools/)).toBeInTheDocument()
  })

  it('Escape from notifications returns to main', () => {
    render(<App />)
    fireEvent.click(screen.getByLabelText(/Notifications/))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByPlaceholderText(/Search tools/)).toBeInTheDocument()
  })

  it('Escape from tool-detail returns to main', () => {
    mockUseTools.mockReturnValue({
      tools: [installedTool],
      loading: false,
      cloudSyncing: false,
      lastUpdated: null,
      fetchTools: mockFetchTools,
    })
    render(<App />)
    fireEvent.click(screen.getByText('Claude Code'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByPlaceholderText(/Search tools/)).toBeInTheDocument()
  })

  it('Settings view: Activity Log button navigates to logs', async () => {
    render(<App />)
    fireEvent.click(screen.getByLabelText(/Open settings/))
    await waitFor(() => expect(screen.getByText('Settings')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Activity Log'))
    expect(screen.getByText('Activity Log')).toBeInTheDocument()
  })

  it('Escape from logs returns to main', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_audit_log') return Promise.resolve([])
      return Promise.resolve('0.7.0')
    })
    render(<App />)
    fireEvent.click(screen.getByLabelText(/Open settings/))
    await waitFor(() => screen.getByText('Activity Log'))
    fireEvent.click(screen.getByText('Activity Log'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByPlaceholderText(/Search tools/)).toBeInTheDocument()
  })

  it('navigates to skills-list and skill-detail', async () => {
    mockUseTools.mockReturnValue({
      tools: [installedTool],
      loading: false, cloudSyncing: false, lastUpdated: null, fetchTools: mockFetchTools,
    })
    render(<App />)
    fireEvent.click(screen.getByText('Claude Code'))
    fireEvent.click(screen.getByLabelText('Open skills page'))
    // Should be in skills list (header text is just "Skills")
    expect(screen.getByRole('button', { name: 'Claude Code' })).toBeInTheDocument()
    expect(screen.getByText('Skills')).toBeInTheDocument()
    // Click specific skill
    fireEvent.click(screen.getByText('graphify'))
    // Should be in skill-detail
    expect(screen.getByText('Files')).toBeInTheDocument()
  })

  it('navigates to mcps-list and mcp-detail', async () => {
    mockUseTools.mockReturnValue({
      tools: [installedTool],
      loading: false, cloudSyncing: false, lastUpdated: null, fetchTools: mockFetchTools,
    })
    render(<App />)
    fireEvent.click(screen.getByText('Claude Code'))
    fireEvent.click(screen.getByLabelText('Open MCPs page'))
    // Should be in mcps list
    expect(screen.getByRole('button', { name: 'Claude Code' })).toBeInTheDocument()
    expect(screen.getByText('MCPs')).toBeInTheDocument()
    // Click specific mcp
    fireEvent.click(screen.getByText('github'))
    // Should be in mcp-detail
    expect(screen.getByText('github')).toBeInTheDocument()
  })

  it('navigates to permissions-detail', async () => {
    mockUseTools.mockReturnValue({
      tools: [installedTool],
      loading: false, cloudSyncing: false, lastUpdated: null, fetchTools: mockFetchTools,
    })
    render(<App />)
    fireEvent.click(screen.getByText('Claude Code'))
    // Wait for the mock get_permissions to resolve so the button appears
    await waitFor(() => expect(screen.getByLabelText('Open permissions')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Open permissions'))
    // Should be in permissions-detail
    expect(screen.getByText('Permissions')).toBeInTheDocument()
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
