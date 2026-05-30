import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import SkillRow from '../SkillRow'
import type { Skill } from '../../types'

const baseSkill: Skill = {
  name: 'impeccable',
  path: '~/.claude/skills/impeccable',
  description: 'Polish frontend UI',
  active: true,
}

describe('SkillRow', () => {
  it('renders skill name', () => {
    render(<SkillRow skill={baseSkill} />)
    expect(screen.getByText('impeccable')).toBeInTheDocument()
  })

  it('renders without error when active=false', () => {
    render(<SkillRow skill={{ ...baseSkill, active: false }} />)
    expect(screen.getByText('impeccable')).toBeInTheDocument()
  })

  it('tooltip content includes description when present', async () => {
    render(<SkillRow skill={baseSkill} />)
    const container = screen.getByText('impeccable').closest('[class*="relative"]') as HTMLElement
    fireEvent.mouseEnter(container)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Polish frontend UI')
  })

  it('tooltip content includes path when no description', async () => {
    const skillNoDesc: Skill = { ...baseSkill, description: undefined }
    render(<SkillRow skill={skillNoDesc} />)
    const container = screen.getByText('impeccable').closest('[class*="relative"]') as HTMLElement
    fireEvent.mouseEnter(container)
    expect(screen.getByRole('tooltip')).toHaveTextContent('~/.claude/skills/impeccable')
  })
})
