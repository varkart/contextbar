import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AgentStackedBars, RankedAgentBars } from '../InsightWidgets'

const DAY = 86_400_000

describe('AgentStackedBars', () => {
  it('sums only the active agents into each bar, ignoring filtered-out agents', () => {
    const seriesByDay = [
      { claude: 10, codex: 5 },
      { claude: 0, codex: 20 },
    ]
    const { container } = render(
      <AgentStackedBars
        seriesByDay={seriesByDay}
        activeAgents={['claude']}
        colorFor={() => '#f97316'}
        start={Date.now() - DAY}
        formatValue={v => `${v}tok`}
      />
    )
    // y-axis max should reflect only claude's values (10, 0) -> max 10, not 20.
    expect(screen.getAllByText('10tok').length).toBeGreaterThan(0)
    expect(screen.queryByText('20tok')).not.toBeInTheDocument()
    // Only one color segment should render per non-empty bar when a single
    // agent is active (no stacking needed).
    const segments = container.querySelectorAll('[style*="background: rgb(249, 115, 22)"]')
    expect(segments.length).toBe(1)
  })

  it('stacks every active agent into one bar when all are selected', () => {
    const seriesByDay = [{ claude: 10, codex: 5 }]
    const colorFor = (a: string) => (a === 'claude' ? '#f97316' : '#10b981')
    render(
      <AgentStackedBars
        seriesByDay={seriesByDay}
        activeAgents={['claude', 'codex']}
        colorFor={colorFor}
        start={Date.now()}
        formatValue={v => `${v}tok`}
      />
    )
    // Total (15) is what the hover tooltip and y-axis max should show.
    expect(screen.getAllByText('15tok').length).toBeGreaterThan(0)
  })

  it('renders a zero-height placeholder bar for a day with no data at all', () => {
    const { container } = render(
      <AgentStackedBars
        seriesByDay={[{ claude: 0 }]}
        activeAgents={['claude']}
        colorFor={() => '#f97316'}
        start={Date.now()}
        formatValue={v => `${v}`}
      />
    )
    expect(container.querySelector('[style*="var(--c-surface-2)"]')).toBeTruthy()
  })
})

describe('RankedAgentBars', () => {
  it('sizes the leading bar at full width relative to the largest value', () => {
    const { container } = render(
      <RankedAgentBars
        items={[
          { agent: 'claude', label: 'Claude', color: '#f97316', value: 100, formatted: '100', pct: 67 },
          { agent: 'codex', label: 'Codex', color: '#10b981', value: 50, formatted: '50', pct: 33 },
        ]}
      />
    )
    const fills = container.querySelectorAll('.rounded-full.h-full')
    expect((fills[0] as HTMLElement).style.width).toBe('100%')
    expect((fills[1] as HTMLElement).style.width).toBe('50%')
  })

  it('shows label, formatted value, and percentage for each agent', () => {
    render(
      <RankedAgentBars
        items={[{ agent: 'claude', label: 'Claude', color: '#f97316', value: 42, formatted: '42k', pct: 100 }]}
      />
    )
    expect(screen.getByText('Claude')).toBeInTheDocument()
    expect(screen.getByText('42k · 100%')).toBeInTheDocument()
  })
})
