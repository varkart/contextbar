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
    const firstTip = screen.getByText(/take a small break|rest ur eyes|stretch ur back|have a sip|breathe/)
    expect(firstTip).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(2200) })
    const anyTip = screen.getByText(/take a small break|rest ur eyes|stretch ur back|have a sip|breathe/)
    expect(anyTip).toBeInTheDocument()
  })
})
