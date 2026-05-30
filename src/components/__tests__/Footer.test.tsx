import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import Footer from '../Footer'

describe('Footer', () => {
  it('renders "Never" when lastUpdated is null', () => {
    render(<Footer lastUpdated={null} onRefresh={vi.fn()} loading={false} />)
    expect(screen.getByText('Never')).toBeInTheDocument()
  })

  it('renders "Updated Ns ago" when lastUpdated is recent', () => {
    const now = new Date()
    render(<Footer lastUpdated={now} onRefresh={vi.fn()} loading={false} />)
    expect(screen.getByText(/Updated \d+s ago/)).toBeInTheDocument()
  })

  it('refresh button triggers onRefresh callback', () => {
    const onRefresh = vi.fn()
    render(<Footer lastUpdated={null} onRefresh={onRefresh} loading={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})
