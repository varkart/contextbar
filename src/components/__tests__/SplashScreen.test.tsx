import { render, screen, act, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import SplashScreen from '../SplashScreen'

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
})
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

  it('cycles through wellness tips on first launch of the day', async () => {
    render(<SplashScreen backendReady={false} onDismiss={vi.fn()} />)

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

  it('skips tips when already launched today', () => {
    localStorage.setItem('splash_tips_date', new Date().toDateString())
    render(<SplashScreen backendReady={false} onDismiss={vi.fn()} />)
    expect(screen.queryByText(/note from the sloth/)).not.toBeInTheDocument()
  })

  it('dismisses shortly after backend ready when tips are skipped', async () => {
    localStorage.setItem('splash_tips_date', new Date().toDateString())
    const onDismiss = vi.fn()
    render(<SplashScreen backendReady={true} onDismiss={onDismiss} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not dismiss before backend is ready', async () => {
    localStorage.setItem('splash_tips_date', new Date().toDateString())
    const onDismiss = vi.fn()
    render(<SplashScreen backendReady={false} onDismiss={onDismiss} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('shows Continue during tips once backend is ready, and it dismisses', async () => {
    const onDismiss = vi.fn()
    render(<SplashScreen backendReady={true} onDismiss={onDismiss} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    const btn = screen.getByRole('button', { name: /continue/i })
    fireEvent.click(btn)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('auto-dismisses after tips complete when backend is ready', async () => {
    const onDismiss = vi.fn()
    render(<SplashScreen backendReady={true} onDismiss={onDismiss} />)

    for (let i = 0; i < 240; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50)
      })
    }
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
