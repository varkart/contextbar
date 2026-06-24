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

  it('hides loading dots when backend ready and animation cycle is done', () => {
    const { container } = render(<SplashScreen backendReady={true} onDismiss={vi.fn()} />)
    // Initially, cycleDone is false, so it shows the dots
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(3)

    // Advance timers long enough to cycle through the tips and complete the animation
    act(() => {
      vi.advanceTimersByTime(20000) // 20s is plenty to cycle through all tips
    })

    // Now dots should be gone
    expect(container.querySelectorAll('.animate-pulse').length).toBe(0)
  })

  it('automatically calls onDismiss after backend is ready and animation cycle is done', () => {
    const onDismiss = vi.fn()
    render(<SplashScreen backendReady={true} onDismiss={onDismiss} />)

    // Not called immediately
    expect(onDismiss).not.toHaveBeenCalled()

    // Cycle through animation
    act(() => {
      vi.advanceTimersByTime(20000)
    })

    // Advance 300ms more for the dismiss timeout
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not call onDismiss if backend is not ready even if animation cycle is done', () => {
    const onDismiss = vi.fn()
    render(<SplashScreen backendReady={false} onDismiss={onDismiss} />)

    // Cycle through animation
    act(() => {
      vi.advanceTimersByTime(25000)
    })

    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('cycles through wellness tips via typewriter effect', () => {
    render(<SplashScreen backendReady={false} onDismiss={vi.fn()} />)

    // At start, it's typing the first tip character by character
    // Let's advance by 1500ms to finish typing the first tip
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.getByText('take a small break')).toBeInTheDocument()

    // Advance to cycle to the next tip:
    // pause (1500ms) + delete (18 * 30 = 540ms) + delay (500ms) + type "rest ur eyes" (13 * 70 = 910ms) = ~3450ms
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.getByText('rest ur eyes')).toBeInTheDocument()
  })
})
