import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import SkillRow from '../SkillRow'
import type { Skill } from '../../types'

const activeSkill: Skill = {
  name: 'impeccable',
  path: '~/.claude/skills/impeccable',
  description: 'Polish frontend UI',
  active: true,
  sourceId: 'skills_dir',
}

const disabledSkill: Skill = {
  ...activeSkill,
  path: '~/.claude/skills/.disabled/impeccable',
  active: false,
}

describe('SkillRow', () => {
  it('renders skill name', () => {
    render(<SkillRow skill={activeSkill} />)
    expect(screen.getByText('impeccable')).toBeInTheDocument()
  })

  it('no toggle button — enable/disable only from detail page', () => {
    render(<SkillRow skill={activeSkill} />)
    expect(screen.queryByRole('button', { name: /enable|disable/i })).toBeNull()
  })

  it('disabled skill row has reduced opacity', () => {
    const { container } = render(<SkillRow skill={disabledSkill} />)
    expect(container.querySelector('.opacity-40')).toBeInTheDocument()
  })

  it('active skill row has no opacity reduction', () => {
    const { container } = render(<SkillRow skill={activeSkill} />)
    expect(container.querySelector('.opacity-40')).toBeNull()
  })

  it('shows chevron when onSelect provided', () => {
    const { container } = render(<SkillRow skill={activeSkill} onSelect={vi.fn()} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('calls onSelect when row clicked', () => {
    const onSelect = vi.fn()
    render(<SkillRow skill={activeSkill} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('impeccable'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
