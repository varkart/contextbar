import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Settings from '../Settings'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('../../analytics', () => ({ capture: vi.fn(), captureException: vi.fn() }))

import { invoke } from '@tauri-apps/api/core'
const mockInvoke = vi.mocked(invoke)

const defaultProps = {
  onBack: vi.fn(),
  theme: 'system' as const,
  onThemeChange: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockImplementation((cmd: string) => {
    switch (cmd) {
      case 'get_autostart': return Promise.resolve(false)
      case 'get_version':   return Promise.resolve('0.7.0')
      case 'get_shortcut':  return Promise.resolve('CommandOrControl+Shift+Space')
      case 'get_vibrancy':  return Promise.resolve(true)
      default:              return Promise.resolve(null)
    }
  })
})

describe('Settings', () => {
  it('renders Settings heading', () => {
    render(<Settings {...defaultProps} />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('back button calls onBack', () => {
    render(<Settings {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Back'))
    expect(defaultProps.onBack).toHaveBeenCalledTimes(1)
  })

  it('shows version after load', async () => {
    render(<Settings {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('v0.7.0')).toBeInTheDocument())
  })

  it('renders General section', () => {
    render(<Settings {...defaultProps} />)
    expect(screen.getByText('General')).toBeInTheDocument()
    expect(screen.getByText('Launch at login')).toBeInTheDocument()
    expect(screen.getByText('Global shortcut')).toBeInTheDocument()
  })

  it('renders Appearance section', () => {
    render(<Settings {...defaultProps} />)
    expect(screen.getByText('Appearance')).toBeInTheDocument()
  })

  it('renders About section', () => {
    render(<Settings {...defaultProps} />)
    expect(screen.getByText('About')).toBeInTheDocument()
  })

  it('autostart toggle starts disabled while loading', () => {
    render(<Settings {...defaultProps} />)
    const toggle = screen.getByRole('switch', { name: /launch at login/i })
    expect(toggle).toBeDisabled()
  })

  it('autostart toggle enabled after load', async () => {
    render(<Settings {...defaultProps} />)
    await waitFor(() => {
      const toggle = screen.getByRole('switch', { name: /launch at login/i })
      expect(toggle).not.toBeDisabled()
    })
  })

  it('autostart toggle reflects false state', async () => {
    render(<Settings {...defaultProps} />)
    await waitFor(() => {
      const toggle = screen.getByRole('switch', { name: /launch at login/i })
      expect(toggle).toHaveAttribute('aria-checked', 'false')
    })
  })

  it('autostart toggle reflects true when enabled', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_autostart') return Promise.resolve(true)
      if (cmd === 'get_version')   return Promise.resolve('0.7.0')
      if (cmd === 'get_shortcut')  return Promise.resolve('CommandOrControl+Shift+Space')
      if (cmd === 'get_vibrancy')  return Promise.resolve(true)
      return Promise.resolve(null)
    })
    render(<Settings {...defaultProps} />)
    await waitFor(() => {
      const toggle = screen.getByRole('switch', { name: /launch at login/i })
      expect(toggle).toHaveAttribute('aria-checked', 'true')
    })
  })

  it('toggling autostart calls set_autostart', async () => {
    render(<Settings {...defaultProps} />)
    await waitFor(() => expect(screen.getByRole('switch', { name: /launch at login/i })).not.toBeDisabled())

    mockInvoke.mockResolvedValue(null)
    fireEvent.click(screen.getByRole('switch', { name: /launch at login/i }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('set_autostart', { enabled: true })
    })
  })

  it('reverts autostart if IPC fails', async () => {
    render(<Settings {...defaultProps} />)
    await waitFor(() => expect(screen.getByRole('switch', { name: /launch at login/i })).not.toBeDisabled())

    mockInvoke.mockRejectedValue(new Error('failed'))
    fireEvent.click(screen.getByRole('switch', { name: /launch at login/i }))

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /launch at login/i })).toHaveAttribute('aria-checked', 'false')
    })
  })

  it('shows update info when provided', async () => {
    render(<Settings {...defaultProps} updateInfo={{ latestVersion: '1.0.0', releaseUrl: 'https://example.com' }} />)
    await waitFor(() => expect(screen.getByText(/1\.0\.0 available/)).toBeInTheDocument())
  })

  it('does not show update row when updateInfo is null', async () => {
    render(<Settings {...defaultProps} updateInfo={null} />)
    await waitFor(() => expect(screen.queryByText(/available/)).not.toBeInTheDocument())
  })

  it('shows Activity Log button when onOpenLogs provided', () => {
    render(<Settings {...defaultProps} onOpenLogs={vi.fn()} />)
    expect(screen.getByText('Activity Log')).toBeInTheDocument()
  })

  it('does not show Activity Log when onOpenLogs omitted', () => {
    render(<Settings {...defaultProps} />)
    expect(screen.queryByText('Activity Log')).not.toBeInTheDocument()
  })

  it('clicking Activity Log calls onOpenLogs', () => {
    const onOpenLogs = vi.fn()
    render(<Settings {...defaultProps} onOpenLogs={onOpenLogs} />)
    fireEvent.click(screen.getByText('Activity Log'))
    expect(onOpenLogs).toHaveBeenCalledTimes(1)
  })

  it('shows Developer section when onOpenLogs provided', () => {
    render(<Settings {...defaultProps} onOpenLogs={vi.fn()} />)
    expect(screen.getByText('Developer')).toBeInTheDocument()
  })
})
