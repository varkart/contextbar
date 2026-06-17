import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import SkillSection from '../SkillSection'
import type { Skill } from '../../types'

const skill = (name: string, active = true): Skill => ({
  name,
  path: `/skills/${name}`,
  description: undefined,
  active,
  sourceId: 'skills_dir',
})

const manySkills = Array.from({ length: 8 }, (_, i) => skill(`skill-${i + 1}`))

function getSectionHeader(container: HTMLElement) {
  return container.querySelector('button[aria-expanded]') as HTMLElement
}

describe('SkillSection', () => {
  it('renders Skills header', () => {
    render(<SkillSection skills={[skill('impeccable')]} />)
    expect(screen.getByText('Skills')).toBeInTheDocument()
  })

  it('shows count of visible skills', () => {
    const { container } = render(<SkillSection skills={[skill('a'), skill('b')]} />)
    expect(getSectionHeader(container).textContent).toContain('2')
  })

  it('renders skill names', () => {
    render(<SkillSection skills={[skill('impeccable'), skill('graphify')]} />)
    expect(screen.getByText('impeccable')).toBeInTheDocument()
    expect(screen.getByText('graphify')).toBeInTheDocument()
  })

  it('shows "None detected" when skills list is empty', () => {
    render(<SkillSection skills={[]} />)
    expect(screen.getByText(/none detected/i)).toBeInTheDocument()
  })

  it('truncates to 5 skills when no query', () => {
    render(<SkillSection skills={manySkills} />)
    expect(screen.getByText('skill-1')).toBeInTheDocument()
    expect(screen.queryByText('skill-6')).not.toBeInTheDocument()
  })

  it('shows "+N more" button when there are more than 5 skills', () => {
    render(<SkillSection skills={manySkills} />)
    expect(screen.getByText(/\+3 more/)).toBeInTheDocument()
  })

  it('expanding reveals all skills', () => {
    render(<SkillSection skills={manySkills} />)
    fireEvent.click(screen.getByText(/\+3 more/))
    expect(screen.getByText('skill-6')).toBeInTheDocument()
    expect(screen.getByText('skill-8')).toBeInTheDocument()
  })

  it('shows "Show less" after expanding', () => {
    render(<SkillSection skills={manySkills} />)
    fireEvent.click(screen.getByText(/\+3 more/))
    expect(screen.getByText(/show less/i)).toBeInTheDocument()
  })

  it('"Show less" collapses back to 5', () => {
    render(<SkillSection skills={manySkills} />)
    fireEvent.click(screen.getByText(/\+3 more/))
    fireEvent.click(screen.getByText(/show less/i))
    expect(screen.queryByText('skill-6')).not.toBeInTheDocument()
  })

  it('no truncation when query is active — all skills visible', () => {
    const { container } = render(<SkillSection skills={manySkills} query="skill" />)
    // Highlight splits matched text into spans; check raw text content instead
    expect(container.textContent).toContain('skill-8')
    expect(screen.queryByText(/\+\d+ more/)).not.toBeInTheDocument()
  })

  it('collapses section on header click', () => {
    const { container } = render(<SkillSection skills={[skill('impeccable')]} />)
    fireEvent.click(getSectionHeader(container))
    expect(screen.queryByText('impeccable')).not.toBeInTheDocument()
  })

  it('aria-expanded reflects open state', () => {
    const { container } = render(<SkillSection skills={[skill('impeccable')]} />)
    const header = getSectionHeader(container)
    expect(header).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
  })

  it('filters by matchedPaths', () => {
    render(<SkillSection skills={[skill('a'), skill('b')]} matchedPaths={new Set(['/skills/a'])} />)
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.queryByText('b')).not.toBeInTheDocument()
  })

  it('calls onSelectSkill when row is clicked', () => {
    const onSelectSkill = vi.fn()
    render(<SkillSection skills={[skill('impeccable')]} onSelectSkill={onSelectSkill} />)
    fireEvent.click(screen.getByText('impeccable'))
    expect(onSelectSkill).toHaveBeenCalledWith(expect.objectContaining({ name: 'impeccable' }))
  })
})
