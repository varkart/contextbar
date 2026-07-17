import { render, screen, renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useToasts, ToastStack } from '../Toast'

describe('useToasts', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('starts empty', () => {
    const { result } = renderHook(() => useToasts())
    expect(result.current.toasts).toEqual([])
  })

  it('adds a toast on showToast', () => {
    const { result } = renderHook(() => useToasts())
    act(() => result.current.showToast('success', 'Saved'))
    expect(result.current.toasts).toHaveLength(1)
    expect(result.current.toasts[0]).toMatchObject({ type: 'success', message: 'Saved' })
  })

  it('assigns increasing ids to distinguish concurrent toasts', () => {
    const { result } = renderHook(() => useToasts())
    act(() => {
      result.current.showToast('success', 'One')
      result.current.showToast('error', 'Two')
    })
    expect(result.current.toasts).toHaveLength(2)
    expect(result.current.toasts[0].id).not.toBe(result.current.toasts[1].id)
  })

  it('auto-dismisses after the timeout', () => {
    const { result } = renderHook(() => useToasts())
    act(() => result.current.showToast('error', 'Oops'))
    expect(result.current.toasts).toHaveLength(1)
    act(() => vi.advanceTimersByTime(3500))
    expect(result.current.toasts).toHaveLength(0)
  })

  it('dismissToast removes a specific toast immediately', () => {
    const { result } = renderHook(() => useToasts())
    act(() => {
      result.current.showToast('success', 'One')
      result.current.showToast('success', 'Two')
    })
    const idToRemove = result.current.toasts[0].id
    act(() => result.current.dismissToast(idToRemove))
    expect(result.current.toasts).toHaveLength(1)
    expect(result.current.toasts[0].message).toBe('Two')
  })
})

describe('ToastStack', () => {
  it('renders nothing when there are no toasts', () => {
    const { container } = render(<ToastStack toasts={[]} onDismiss={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a message per toast', () => {
    render(
      <ToastStack
        toasts={[
          { id: 1, type: 'success', message: 'Saved successfully' },
          { id: 2, type: 'error', message: 'Something broke' },
        ]}
        onDismiss={vi.fn()}
      />
    )
    expect(screen.getByText('Saved successfully')).toBeInTheDocument()
    expect(screen.getByText('Something broke')).toBeInTheDocument()
  })

  it('calls onDismiss with the right id when dismissed', () => {
    const onDismiss = vi.fn()
    render(
      <ToastStack toasts={[{ id: 7, type: 'success', message: 'Hi' }]} onDismiss={onDismiss} />
    )
    screen.getByLabelText('Dismiss').click()
    expect(onDismiss).toHaveBeenCalledWith(7)
  })
})
