import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import Toggle from '../Toggle'

describe('Toggle', () => {
  it('shows Disable label when active', () => {
    render(<Toggle active={true} toggling={false} onChange={vi.fn()} activeColor="bg-indigo-500" entityLabel="skill" />)
    expect(screen.getByLabelText('Disable skill')).toBeInTheDocument()
  })

  it('shows Enable label when inactive', () => {
    render(<Toggle active={false} toggling={false} onChange={vi.fn()} activeColor="bg-indigo-500" entityLabel="skill" />)
    expect(screen.getByLabelText('Enable skill')).toBeInTheDocument()
  })

  it('calls onChange with toggled value when clicked', () => {
    const onChange = vi.fn()
    render(<Toggle active={false} toggling={false} onChange={onChange} activeColor="bg-indigo-500" entityLabel="skill" />)
    fireEvent.click(screen.getByRole('button'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('does not call onChange when toggling in progress', () => {
    const onChange = vi.fn()
    render(<Toggle active={true} toggling={true} onChange={onChange} activeColor="bg-indigo-500" entityLabel="skill" />)
    fireEvent.click(screen.getByRole('button'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('is disabled when toggling', () => {
    render(<Toggle active={true} toggling={true} onChange={vi.fn()} activeColor="bg-indigo-500" entityLabel="skill" />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('applies activeColor class when active', () => {
    render(<Toggle active={true} toggling={false} onChange={vi.fn()} activeColor="bg-indigo-500" entityLabel="skill" />)
    expect(screen.getByRole('button')).toHaveClass('bg-indigo-500')
  })

  it('stops propagation on click', () => {
    const parentClick = vi.fn()
    const { container } = render(
      <div onClick={parentClick}>
        <Toggle active={false} toggling={false} onChange={vi.fn()} activeColor="bg-indigo-500" entityLabel="skill" />
      </div>
    )
    fireEvent.click(container.querySelector('button')!)
    expect(parentClick).not.toHaveBeenCalled()
  })
})
