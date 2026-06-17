import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import SearchBar from '../SearchBar'

describe('SearchBar', () => {
  it('renders input with placeholder', () => {
    render(<SearchBar value="" onChange={vi.fn()} />)
    expect(screen.getByPlaceholderText(/search tools/i)).toBeInTheDocument()
  })

  it('input reflects value prop', () => {
    render(<SearchBar value="claude" onChange={vi.fn()} />)
    expect(screen.getByDisplayValue('claude')).toBeInTheDocument()
  })

  it('calls onChange with new value when typing', () => {
    const onChange = vi.fn()
    render(<SearchBar value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'cursor' } })
    expect(onChange).toHaveBeenCalledWith('cursor')
  })

  it('clear button is hidden when value is empty', () => {
    render(<SearchBar value="" onChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /clear search/i })).not.toBeInTheDocument()
  })

  it('clear button appears when value is non-empty', () => {
    render(<SearchBar value="abc" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /clear search/i })).toBeInTheDocument()
  })

  it('clicking clear button calls onChange with empty string', () => {
    const onChange = vi.fn()
    render(<SearchBar value="hello" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /clear search/i }))
    expect(onChange).toHaveBeenCalledWith('')
  })
})
