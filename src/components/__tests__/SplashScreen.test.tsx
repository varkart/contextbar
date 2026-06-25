import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import SplashScreen from '../SplashScreen'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('SplashScreen', () => {
  it('renders logo image', () => {
    render(<SplashScreen backendReady={false} onDismiss={vi.fn()} />)
    expect(screen.getByAltText('Context Bar')).toBeInTheDocument()
  })

  it('renders app name', () => {
    render(<SplashScreen backendReady={false} onDismiss={vi.fn()} />)
    expect(screen.getByText('Context Bar')).toBeInTheDocument()
  })

  it('shows loading dots when backend not ready', () => {
    const { container } = render(<SplashScreen backendReady={false} onDismiss={vi.fn()} />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(3)
  })

  it('hides loading dots when backend ready', () => {
    const { container } = render(<SplashScreen backendReady={true} onDismiss={vi.fn()} />)
    expect(container.querySelectorAll('.animate-pulse').length).toBe(0)
  })

  it('cycles through wellness tips', () => {
    render(<SplashScreen backendReady={false} onDismiss={vi.fn()} />)
    // t=1500ms: first tip fully typed + 240ms into pause — text visible
    act(() => { vi.advanceTimersByTime(1500) })
    expect(screen.getByText(/take a small break|rest ur eyes|stretch ur back|have a sip/)).toBeInTheDocument()
    // t=5000ms: past delete+pause cycle, second tip fully typed and visible
    act(() => { vi.advanceTimersByTime(3500) })
    expect(screen.getByText(/take a small break|rest ur eyes|stretch ur back|have a sip/)).toBeInTheDocument()
  })
})
