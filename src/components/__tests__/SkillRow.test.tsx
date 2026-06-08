import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import SkillRow from '../SkillRow'
import type { Skill } from '../../types'

const activeSkill: Skill = {
  name: 'impeccable',
  path: '~/.claude/skills/impeccable',
  description: 'Polish frontend UI',
  active: true,
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

  it('tooltip includes description when present', () => {
    render(<SkillRow skill={activeSkill} />)
    const container = screen.getByText('impeccable').closest('[class*="relative"]') as HTMLElement
    fireEvent.mouseEnter(container)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Polish frontend UI')
  })

  it('tooltip includes path when no description', () => {
    render(<SkillRow skill={{ ...activeSkill, description: undefined }} />)
    const container = screen.getByText('impeccable').closest('[class*="relative"]') as HTMLElement
    fireEvent.mouseEnter(container)
    expect(screen.getByRole('tooltip')).toHaveTextContent('~/.claude/skills/impeccable')
  })

  // ── toggle ──────────────────────────────────────────────────────────────────

  it('no toggle rendered without onToggle prop', () => {
    render(<SkillRow skill={activeSkill} />)
    expect(screen.queryByRole('button', { name: /disable skill/i })).toBeNull()
  })

  it('toggle renders when onToggle provided', () => {
    render(<SkillRow skill={activeSkill} onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: /disable skill/i })).toBeInTheDocument()
  })

  it('toggle label is "Enable skill" when skill is disabled', () => {
    render(<SkillRow skill={disabledSkill} onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: /enable skill/i })).toBeInTheDocument()
  })

  it('clicking active toggle calls onToggle(false)', () => {
    const onToggle = vi.fn()
    render(<SkillRow skill={activeSkill} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /disable skill/i }))
    expect(onToggle).toHaveBeenCalledWith(false)
  })

  it('clicking disabled toggle calls onToggle(true)', () => {
    const onToggle = vi.fn()
    render(<SkillRow skill={disabledSkill} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /enable skill/i }))
    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it('toggling=true disables the toggle button', () => {
    render(<SkillRow skill={activeSkill} onToggle={vi.fn()} toggling={true} />)
    expect(screen.getByRole('button', { name: /disable skill/i })).toBeDisabled()
  })

  it('disabled skill row has reduced opacity class', () => {
    const { container } = render(<SkillRow skill={disabledSkill} onToggle={vi.fn()} />)
    expect(container.querySelector('.opacity-40')).toBeInTheDocument()
  })

  it('active skill row has no opacity reduction', () => {
    const { container } = render(<SkillRow skill={activeSkill} onToggle={vi.fn()} />)
    expect(container.querySelector('.opacity-40')).toBeNull()
  })
})
