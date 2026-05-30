import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import StatusDot from '../StatusDot'

describe('StatusDot', () => {
  it('installed → has bg-indigo-400 class', () => {
    render(<StatusDot state="installed" />)
    const dot = screen.getByLabelText('installed')
    expect(dot).toHaveClass('bg-indigo-400')
  })

  it('not-installed → has bg-zinc-700 class', () => {
    render(<StatusDot state="not-installed" />)
    const dot = screen.getByLabelText('not installed')
    expect(dot).toHaveClass('bg-zinc-700')
  })

  it('error → has bg-red-400 class', () => {
    render(<StatusDot state="error" />)
    const dot = screen.getByLabelText('error')
    expect(dot).toHaveClass('bg-red-400')
  })

  it('no-config → renders without error', () => {
    render(<StatusDot state="no-config" />)
    const dot = screen.getByLabelText('no config found')
    expect(dot).toBeInTheDocument()
  })
})
