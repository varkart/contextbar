import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import Header from '../Header'

const defaultProps = {
  view: 'main' as const,
  selectedAgent: null,
  selectedSkill: null,
  selectedMcp: null,
  skillBackView: 'agent-detail' as const,
  mcpBackView: 'agent-detail' as const,
  allSkillsBackView: 'agent-detail' as const,
  allMcpsBackView: 'agent-detail' as const,
  goTo: vi.fn(),
  openAgentsList: vi.fn(),
  onSettingsClick: vi.fn(),
  onNotificationsClick: vi.fn(),
}

describe('Header', () => {
  it('shows Context Bar branding on main view', () => {
    render(<Header {...defaultProps} />)
    expect(screen.getByText('Context Bar')).toBeInTheDocument()
    expect(screen.queryByText('Home')).not.toBeInTheDocument()
  })

  it('shows breadcrumb for settings view', () => {
    render(<Header {...defaultProps} view="settings" />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders settings button', () => {
    render(<Header {...defaultProps} />)
    expect(screen.getByRole('button', { name: /open settings/i })).toBeInTheDocument()
  })

  it('clicking settings calls onSettingsClick', () => {
    const onSettingsClick = vi.fn()
    render(<Header {...defaultProps} onSettingsClick={onSettingsClick} />)
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    expect(onSettingsClick).toHaveBeenCalledTimes(1)
  })

  it('no update badge when updateAvailable is false', () => {
    render(<Header {...defaultProps} updateAvailable={false} />)
    const gear = screen.getByRole('button', { name: /open settings/i })
    expect(gear.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument()
  })

  it('shows update badge when updateAvailable is true', () => {
    render(<Header {...defaultProps} updateAvailable={true} />)
    const gear = screen.getByRole('button', { name: /update available/i })
    expect(gear.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })

  it('aria-label mentions update when updateAvailable=true', () => {
    render(<Header {...defaultProps} updateAvailable={true} />)
    expect(screen.getByRole('button', { name: /update available/i })).toBeInTheDocument()
  })

  it('aria-label is plain when no update', () => {
    render(<Header {...defaultProps} updateAvailable={false} />)
    expect(screen.getByRole('button', { name: 'Open settings' })).toBeInTheDocument()
  })

  it('renders notification bell button', () => {
    render(<Header {...defaultProps} />)
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument()
  })

  it('clicking bell calls onNotificationsClick', () => {
    const onNotificationsClick = vi.fn()
    render(<Header {...defaultProps} onNotificationsClick={onNotificationsClick} />)
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
    expect(onNotificationsClick).toHaveBeenCalledTimes(1)
  })

  it('no notification badge when count is 0', () => {
    render(<Header {...defaultProps} notificationCount={0} />)
    const bell = screen.getByRole('button', { name: /^Notifications$/ })
    expect(bell.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument()
  })

  it('no notification badge when notificationCount is undefined', () => {
    render(<Header {...defaultProps} />)
    const bell = screen.getByRole('button', { name: /^Notifications$/ })
    expect(bell.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument()
  })

  it('shows notification badge when count > 0', () => {
    render(<Header {...defaultProps} notificationCount={3} />)
    const bell = screen.getByRole('button', { name: /3 notifications/i })
    expect(bell.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })

  it('bell aria-label includes count when > 0', () => {
    render(<Header {...defaultProps} notificationCount={5} />)
    expect(screen.getByRole('button', { name: '5 notifications' })).toBeInTheDocument()
  })

  it('bell aria-label is generic when count is 0', () => {
    render(<Header {...defaultProps} notificationCount={0} />)
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
  })
})
