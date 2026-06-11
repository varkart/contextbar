import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import Header from '../Header'

describe('Header', () => {
  it('renders app name', () => {
    render(<Header onSettingsClick={vi.fn()} />)
    expect(screen.getByText('LLM Manager')).toBeInTheDocument()
  })

  it('renders settings button', () => {
    render(<Header onSettingsClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: /open settings/i })).toBeInTheDocument()
  })

  it('clicking settings calls onSettingsClick', () => {
    const onSettingsClick = vi.fn()
    render(<Header onSettingsClick={onSettingsClick} />)
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }))
    expect(onSettingsClick).toHaveBeenCalledTimes(1)
  })

  it('no update badge when updateAvailable is false', () => {
    const { container } = render(<Header onSettingsClick={vi.fn()} updateAvailable={false} />)
    // Badge is a small span — aria-hidden, check it's absent
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument()
  })

  it('shows update badge when updateAvailable is true', () => {
    const { container } = render(<Header onSettingsClick={vi.fn()} updateAvailable={true} />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })

  it('aria-label mentions update when updateAvailable=true', () => {
    render(<Header onSettingsClick={vi.fn()} updateAvailable={true} />)
    expect(screen.getByRole('button', { name: /update available/i })).toBeInTheDocument()
  })

  it('aria-label is plain when no update', () => {
    render(<Header onSettingsClick={vi.fn()} updateAvailable={false} />)
    expect(screen.getByRole('button', { name: 'Open settings' })).toBeInTheDocument()
  })
})
