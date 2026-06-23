import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import SearchInput from '../SearchInput'

describe('SearchInput', () => {
  it('renders input with given placeholder', () => {
    render(<SearchInput value="" onChange={vi.fn()} placeholder="Search skills…" />)
    expect(screen.getByPlaceholderText('Search skills…')).toBeInTheDocument()
  })

  it('calls onChange when user types', () => {
    const onChange = vi.fn()
    render(<SearchInput value="" onChange={onChange} placeholder="Search skills…" />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test' } })
    expect(onChange).toHaveBeenCalledWith('test')
  })

  it('placeholder is present when value is empty initially', () => {
    render(<SearchInput value="" onChange={vi.fn()} placeholder="Search MCPs…" />)
    expect(screen.getByPlaceholderText('Search MCPs…')).toBeInTheDocument()
  })

  it('has focus:border-indigo class when accentColor is indigo', () => {
    render(<SearchInput value="" onChange={vi.fn()} placeholder="Search…" accentColor="indigo" />)
    const input = screen.getByRole('textbox')
    expect(input.className).toContain('focus:border-indigo-500/50')
  })

  it('has focus:border-violet class when accentColor is violet', () => {
    render(<SearchInput value="" onChange={vi.fn()} placeholder="Search…" accentColor="violet" />)
    const input = screen.getByRole('textbox')
    expect(input.className).toContain('focus:border-violet-500/50')
  })
})
