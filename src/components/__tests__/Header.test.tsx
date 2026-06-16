import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import Header from '../Header'

describe('Header', () => {
  it('renders app name', () => {
    render(<Header onSettingsClick={vi.fn()} onNotificationsClick={vi.fn()} />)
    expect(screen.getByText('LLM Manager')).toBeInTheDocument()
  })

  it('renders settings button', () => {
    render(<Header onSettingsClick={vi.fn()} onNotificationsClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: /open settings/i })).toBeInTheDocument()
  })

  it('clicking settings calls onSettingsClick', () => {
    const onSettingsClick = vi.fn()
    render(<Header onSettingsClick={onSettingsClick} onNotificationsClick={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    expect(onSettingsClick).toHaveBeenCalledTimes(1)
  })

  it('no update badge when updateAvailable is false', () => {
    const { container } = render(<Header onSettingsClick={vi.fn()} onNotificationsClick={vi.fn()} updateAvailable={false} />)
    // Badge is a small span — aria-hidden, check it's absent
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument()
  })

  it('shows update badge when updateAvailable is true', () => {
    const { container } = render(<Header onSettingsClick={vi.fn()} onNotificationsClick={vi.fn()} updateAvailable={true} />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })

  it('aria-label mentions update when updateAvailable=true', () => {
    render(<Header onSettingsClick={vi.fn()} onNotificationsClick={vi.fn()} updateAvailable={true} />)
    expect(screen.getByRole('button', { name: /update available/i })).toBeInTheDocument()
  })

  it('aria-label is plain when no update', () => {
    render(<Header onSettingsClick={vi.fn()} onNotificationsClick={vi.fn()} updateAvailable={false} />)
    expect(screen.getByRole('button', { name: 'Open settings' })).toBeInTheDocument()
  })

  // ── notification bell ─────────────────────────────────────────────────────

  it('renders notification bell button', () => {
    render(<Header onSettingsClick={vi.fn()} onNotificationsClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument()
  })

  it('clicking bell calls onNotificationsClick', () => {
    const onNotificationsClick = vi.fn()
    render(<Header onSettingsClick={vi.fn()} onNotificationsClick={onNotificationsClick} />)
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
    expect(onNotificationsClick).toHaveBeenCalledTimes(1)
  })

  it('no notification badge when count is 0', () => {
    render(<Header onSettingsClick={vi.fn()} onNotificationsClick={vi.fn()} notificationCount={0} />)
    const bell = screen.getByRole('button', { name: /^Notifications$/ })
    expect(bell.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument()
  })

  it('no notification badge when notificationCount is undefined', () => {
    render(<Header onSettingsClick={vi.fn()} onNotificationsClick={vi.fn()} />)
    const bell = screen.getByRole('button', { name: /^Notifications$/ })
    expect(bell.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument()
  })

  it('shows notification badge when count > 0', () => {
    render(
      <Header onSettingsClick={vi.fn()} onNotificationsClick={vi.fn()} notificationCount={3} />
    )
    const bell = screen.getByRole('button', { name: /3 notifications/i })
    expect(bell.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })

  it('bell aria-label includes count when > 0', () => {
    render(
      <Header onSettingsClick={vi.fn()} onNotificationsClick={vi.fn()} notificationCount={5} />
    )
    expect(screen.getByRole('button', { name: '5 notifications' })).toBeInTheDocument()
  })

  it('bell aria-label is generic when count is 0', () => {
    render(
      <Header onSettingsClick={vi.fn()} onNotificationsClick={vi.fn()} notificationCount={0} />
    )
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
  })
})
