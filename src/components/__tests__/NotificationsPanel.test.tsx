import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks'
import NotificationsPanel from '../NotificationsPanel'
import type { Notification } from '../../types'

const makeNotif = (overrides: Partial<Notification> = {}): Notification => ({
  id: 1,
  tsMs: Date.now(),
  level: 'warn',
  title: 'Binary not found',
  body: 'Command foo is missing from PATH.',
  ...overrides,
})

const defaultProps = {
  notifications: [],
  onBack: vi.fn(),
  onChanged: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  clearMocks()
})

describe('NotificationsPanel', () => {
  // ── empty state ────────────────────────────────────────────────────────────

  it('shows empty state when no notifications', () => {
    render(<NotificationsPanel {...defaultProps} />)
    expect(screen.getByText('No notifications')).toBeInTheDocument()
  })

  it('does not show Clear all button when empty', () => {
    render(<NotificationsPanel {...defaultProps} />)
    expect(screen.queryByText('Clear all')).not.toBeInTheDocument()
  })

  // ── rendering ──────────────────────────────────────────────────────────────

  it('renders notification title and body', () => {
    render(<NotificationsPanel {...defaultProps} notifications={[makeNotif()]} />)
    expect(screen.getByText('Binary not found')).toBeInTheDocument()
    expect(screen.getByText('Command foo is missing from PATH.')).toBeInTheDocument()
  })

  it('renders warn level badge', () => {
    render(<NotificationsPanel {...defaultProps} notifications={[makeNotif({ level: 'warn' })]} />)
    expect(screen.getByText('warn')).toBeInTheDocument()
  })

  it('renders error level badge', () => {
    render(<NotificationsPanel {...defaultProps} notifications={[makeNotif({ level: 'error', title: 'Error' })]} />)
    expect(screen.getByText('error')).toBeInTheDocument()
  })

  it('renders info level badge', () => {
    render(<NotificationsPanel {...defaultProps} notifications={[makeNotif({ level: 'info', title: 'Info' })]} />)
    expect(screen.getByText('info')).toBeInTheDocument()
  })

  it('renders multiple notifications', () => {
    const notifs = [
      makeNotif({ id: 1, title: 'First' }),
      makeNotif({ id: 2, title: 'Second' }),
    ]
    render(<NotificationsPanel {...defaultProps} notifications={notifs} />)
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
  })

  it('shows Clear all button when notifications present', () => {
    render(<NotificationsPanel {...defaultProps} notifications={[makeNotif()]} />)
    expect(screen.getByText('Clear all')).toBeInTheDocument()
  })

  // ── back button ───────────────────────────────────────────────────────────

  // ── dismiss individual ────────────────────────────────────────────────────

  it('dismiss button calls dismiss_notification with correct id', async () => {
    const invoked: unknown[] = []
    mockIPC((cmd, args) => {
      if (cmd === 'dismiss_notification') { invoked.push(args); return null }
    })
    render(<NotificationsPanel {...defaultProps} notifications={[makeNotif({ id: 42 })]} />)

    // Dismiss button is opacity-0 until hover; fire click directly via aria-label
    fireEvent.click(screen.getByLabelText('Dismiss'))

    await waitFor(() => expect(invoked).toHaveLength(1))
    expect(invoked[0]).toMatchObject({ id: 42 })
  })

  it('calls onChanged after dismiss', async () => {
    mockIPC((cmd) => { if (cmd === 'dismiss_notification') return null })
    render(<NotificationsPanel {...defaultProps} notifications={[makeNotif({ id: 1 })]} />)

    fireEvent.click(screen.getByLabelText('Dismiss'))

    await waitFor(() => expect(defaultProps.onChanged).toHaveBeenCalledTimes(1))
  })

  // ── dismiss all ───────────────────────────────────────────────────────────

  it('Clear all calls dismiss_all_notifications', async () => {
    const invoked: string[] = []
    mockIPC((cmd) => {
      if (cmd === 'dismiss_all_notifications') { invoked.push(cmd); return null }
    })
    render(<NotificationsPanel {...defaultProps} notifications={[makeNotif()]} />)

    fireEvent.click(screen.getByText('Clear all'))

    await waitFor(() => expect(invoked).toHaveLength(1))
  })

  it('calls onChanged after clear all', async () => {
    mockIPC((cmd) => { if (cmd === 'dismiss_all_notifications') return null })
    render(<NotificationsPanel {...defaultProps} notifications={[makeNotif()]} />)

    fireEvent.click(screen.getByText('Clear all'))

    await waitFor(() => expect(defaultProps.onChanged).toHaveBeenCalledTimes(1))
  })

})
