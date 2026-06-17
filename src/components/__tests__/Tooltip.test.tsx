import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Tooltip from '../Tooltip'

describe('Tooltip', () => {
  it('renders children', () => {
    render(<Tooltip content="tip text"><span>hover me</span></Tooltip>)
    expect(screen.getByText('hover me')).toBeInTheDocument()
  })

  it('tooltip not visible by default', () => {
    render(<Tooltip content="tip text"><span>hover me</span></Tooltip>)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows tooltip on mouse enter', () => {
    render(<Tooltip content="tip text"><span>hover me</span></Tooltip>)
    fireEvent.mouseEnter(screen.getByText('hover me').parentElement!)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    expect(screen.getByText('tip text')).toBeInTheDocument()
  })

  it('hides tooltip on mouse leave', () => {
    render(<Tooltip content="tip text"><span>hover me</span></Tooltip>)
    const container = screen.getByText('hover me').parentElement!
    fireEvent.mouseEnter(container)
    fireEvent.mouseLeave(container)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('renders ReactNode content in tooltip', () => {
    render(
      <Tooltip content={<strong>bold tip</strong>}>
        <span>trigger</span>
      </Tooltip>
    )
    fireEvent.mouseEnter(screen.getByText('trigger').parentElement!)
    expect(screen.getByText('bold tip')).toBeInTheDocument()
  })
})
