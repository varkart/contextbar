import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import SplashScreen from '../SplashScreen'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('SplashScreen', () => {
  it('renders logo image', () => {
    render(<SplashScreen backendReady={false} onDismiss={vi.fn()} />)
    expect(screen.getAllByAltText('Context Bar').length).toBeGreaterThanOrEqual(1)
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

  it('cycles through wellness tips', async () => {
    render(<SplashScreen backendReady={false} onDismiss={vi.fn()} />)

    // Advance mock time in small chunks to allow React state updates and useEffect loops to process
    for (let i = 0; i < 240; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50)
      })
    }

    expect(screen.getByText('take a small break')).toBeInTheDocument()
    expect(screen.getByText('rest ur eyes')).toBeInTheDocument()
    expect(screen.getByText('stretch ur back')).toBeInTheDocument()
    expect(screen.getByText('have a sip of water')).toBeInTheDocument()
  })
})
