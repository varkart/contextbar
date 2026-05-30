import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import StatusDot from '../StatusDot'

describe('StatusDot', () => {
  it('installed → has bg-green-500 class', () => {
    render(<StatusDot state="installed" />)
    const dot = screen.getByLabelText('installed')
    expect(dot).toHaveClass('bg-green-500')
  })

  it('not-installed → has bg-zinc-600 class', () => {
    render(<StatusDot state="not-installed" />)
    const dot = screen.getByLabelText('not-installed')
    expect(dot).toHaveClass('bg-zinc-600')
  })

  it('error → has bg-red-500 class', () => {
    render(<StatusDot state="error" />)
    const dot = screen.getByLabelText('error')
    expect(dot).toHaveClass('bg-red-500')
  })

  it('no-config → has bg-yellow-500 class', () => {
    render(<StatusDot state="no-config" />)
    const dot = screen.getByLabelText('no-config')
    expect(dot).toHaveClass('bg-yellow-500')
  })
})
