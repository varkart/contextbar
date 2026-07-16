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
      case 'get_terminal':  return Promise.resolve('Terminal')
      case 'list_terminals': return Promise.resolve(['Terminal', 'iTerm2', 'Warp'])
      default:              return Promise.resolve(null)
    }
  })
})

describe('Settings', () => {
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
    await waitFor(() => expect(screen.getByRole('button', { name: /Install 1\.0\.0/ })).toBeInTheDocument())
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

describe('Settings — ThemeSelector', () => {
  it('clicking Light calls onThemeChange with light', () => {
    render(<Settings {...defaultProps} theme="system" />)
    fireEvent.click(screen.getByText('Light').closest('button')!)
    expect(defaultProps.onThemeChange).toHaveBeenCalledWith('light')
  })

  it('clicking Dark calls onThemeChange with dark', () => {
    render(<Settings {...defaultProps} theme="system" />)
    fireEvent.click(screen.getByText('Dark').closest('button')!)
    expect(defaultProps.onThemeChange).toHaveBeenCalledWith('dark')
  })

  it('clicking System calls onThemeChange with system', () => {
    render(<Settings {...defaultProps} theme="light" />)
    fireEvent.click(screen.getByText('System').closest('button')!)
    expect(defaultProps.onThemeChange).toHaveBeenCalledWith('system')
  })

  it('active theme button has aria-pressed true', () => {
    render(<Settings {...defaultProps} theme="dark" />)
    expect(screen.getByText('Dark').closest('button')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Light').closest('button')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('System').closest('button')).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('Settings — vibrancy toggle', () => {
  it('toggles vibrancy and calls set_vibrancy', async () => {
    render(<Settings {...defaultProps} />)
    await waitFor(() => {
      const switches = screen.getAllByRole('switch')
      expect(switches).toHaveLength(2)
      expect(switches[1]).not.toBeDisabled()
    })

    mockInvoke.mockResolvedValue(null)
    fireEvent.click(screen.getAllByRole('switch')[1])

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('set_vibrancy', { enabled: false })
    })
  })

  it('reverts vibrancy on IPC failure', async () => {
    render(<Settings {...defaultProps} />)
    await waitFor(() => expect(screen.getAllByRole('switch')[1]).not.toBeDisabled())

    mockInvoke.mockRejectedValue(new Error('failed'))
    fireEvent.click(screen.getAllByRole('switch')[1])

    await waitFor(() => {
      expect(screen.getAllByRole('switch')[1]).toHaveAttribute('aria-checked', 'true')
    })
  })
})

describe('Settings — ShortcutRecorder', () => {
  it('shows formatted shortcut after load', async () => {
    render(<Settings {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('⌘⇧Space')).toBeInTheDocument())
  })

  it('click enters recording state', async () => {
    render(<Settings {...defaultProps} />)
    await waitFor(() => expect(screen.getByTitle('Click to record new shortcut')).toBeInTheDocument())
    fireEvent.click(screen.getByTitle('Click to record new shortcut'))
    expect(screen.getByText('Press keys…')).toBeInTheDocument()
  })

  it('Escape cancels recording', async () => {
    render(<Settings {...defaultProps} />)
    await waitFor(() => expect(screen.getByTitle('Click to record new shortcut')).toBeInTheDocument())
    const recorder = screen.getByTitle('Click to record new shortcut')
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'Escape' })
    expect(screen.queryByText('Press keys…')).not.toBeInTheDocument()
    expect(screen.getByText('⌘⇧Space')).toBeInTheDocument()
  })

  it('blur cancels recording', async () => {
    render(<Settings {...defaultProps} />)
    await waitFor(() => expect(screen.getByTitle('Click to record new shortcut')).toBeInTheDocument())
    const recorder = screen.getByTitle('Click to record new shortcut')
    fireEvent.click(recorder)
    fireEvent.blur(recorder)
    expect(screen.queryByText('Press keys…')).not.toBeInTheDocument()
  })

  it('keydown with modifier shows pending shortcut', async () => {
    render(<Settings {...defaultProps} />)
    await waitFor(() => expect(screen.getByTitle('Click to record new shortcut')).toBeInTheDocument())
    const recorder = screen.getByTitle('Click to record new shortcut')
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'A', metaKey: true })
    expect(screen.getByText('⌘A')).toBeInTheDocument()
  })

  it('keydown without modifier does not set pending', async () => {
    render(<Settings {...defaultProps} />)
    await waitFor(() => expect(screen.getByTitle('Click to record new shortcut')).toBeInTheDocument())
    const recorder = screen.getByTitle('Click to record new shortcut')
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'A' })
    expect(screen.getByText('Press keys…')).toBeInTheDocument()
  })

  it('keyup with pending calls onChange and set_shortcut', async () => {
    render(<Settings {...defaultProps} />)
    await waitFor(() => expect(screen.getByTitle('Click to record new shortcut')).toBeInTheDocument())
    const recorder = screen.getByTitle('Click to record new shortcut')
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'K', metaKey: true })
    mockInvoke.mockResolvedValue(null)
    fireEvent.keyUp(recorder)
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('set_shortcut', { shortcut: 'CommandOrControl+K' }))
  })

  it('reverts shortcut if set_shortcut fails', async () => {
    render(<Settings {...defaultProps} />)
    await waitFor(() => expect(screen.getByTitle('Click to record new shortcut')).toBeInTheDocument())
    const recorder = screen.getByTitle('Click to record new shortcut')
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'K', metaKey: true })
    mockInvoke.mockRejectedValue(new Error('failed'))
    fireEvent.keyUp(recorder)
    await waitFor(() => expect(screen.getByText('⌘⇧Space')).toBeInTheDocument())
  })

  it('modifier-only keydown is ignored', async () => {
    render(<Settings {...defaultProps} />)
    await waitFor(() => expect(screen.getByTitle('Click to record new shortcut')).toBeInTheDocument())
    const recorder = screen.getByTitle('Click to record new shortcut')
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'Meta', metaKey: true })
    expect(screen.getByText('Press keys…')).toBeInTheDocument()
  })

  it('lists all detected terminals including Warp', async () => {
    render(<Settings {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('Resume terminal')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Terminal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'iTerm2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Warp' })).toBeInTheDocument()
  })

  it('selecting Warp persists the preference', async () => {
    render(<Settings {...defaultProps} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Warp' })).toBeInTheDocument())
    mockInvoke.mockResolvedValue(null)
    fireEvent.click(screen.getByRole('button', { name: 'Warp' }))
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('set_terminal', { terminal: 'Warp' })
    )
  })

  it('reverts terminal selection if set_terminal fails', async () => {
    render(<Settings {...defaultProps} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Warp' })).toBeInTheDocument())
    mockInvoke.mockRejectedValue(new Error('failed'))
    fireEvent.click(screen.getByRole('button', { name: 'Warp' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Terminal' })).toHaveClass('border-indigo-400/60')
    )
  })
})
