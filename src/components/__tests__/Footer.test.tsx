import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import Footer from '../Footer'

describe('Footer', () => {
  it('renders "Never synced" when lastUpdated is null', () => {
    render(<Footer lastUpdated={null} onRefresh={vi.fn()} loading={false} onFeedbackClick={vi.fn()} />)
    expect(screen.getByText('Never synced')).toBeInTheDocument()
  })

  it('renders time ago when lastUpdated is recent', () => {
    const now = new Date()
    render(<Footer lastUpdated={now} onRefresh={vi.fn()} loading={false} onFeedbackClick={vi.fn()} />)
    // "Just now" for very recent, or "Ns ago"
    expect(screen.getByText(/ago|Just now/)).toBeInTheDocument()
  })

  it('refresh button triggers onRefresh callback', () => {
    const onRefresh = vi.fn()
    render(<Footer lastUpdated={null} onRefresh={onRefresh} loading={false} onFeedbackClick={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh tools' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})
