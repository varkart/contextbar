import { render, screen, renderHook, act, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCoachmark, Coachmark } from '../Coachmark'

describe('useCoachmark', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('is hidden until the delay elapses', () => {
    const { result } = renderHook(() => useCoachmark('test-key', 600))
    expect(result.current.visible).toBe(false)
    act(() => vi.advanceTimersByTime(600))
    expect(result.current.visible).toBe(true)
  })

  it('never shows if the key was already dismissed previously', () => {
    localStorage.setItem('test-key', '1')
    const { result } = renderHook(() => useCoachmark('test-key', 600))
    act(() => vi.advanceTimersByTime(600))
    expect(result.current.visible).toBe(false)
  })

  it('dismiss hides it and persists to localStorage', () => {
    const { result } = renderHook(() => useCoachmark('test-key', 600))
    act(() => vi.advanceTimersByTime(600))
    expect(result.current.visible).toBe(true)
    act(() => result.current.dismiss())
    expect(result.current.visible).toBe(false)
    expect(localStorage.getItem('test-key')).toBe('1')
  })
})

describe('Coachmark component', () => {
  it('renders title and content', () => {
    render(<Coachmark title="Try this" onDismiss={vi.fn()}>Some helpful text</Coachmark>)
    expect(screen.getByText('Try this')).toBeInTheDocument()
    expect(screen.getByText('Some helpful text')).toBeInTheDocument()
  })

  it('calls onDismiss when the close button is clicked', () => {
    const onDismiss = vi.fn()
    render(<Coachmark title="Try this" onDismiss={onDismiss}>Some helpful text</Coachmark>)
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(onDismiss).toHaveBeenCalled()
  })
})
