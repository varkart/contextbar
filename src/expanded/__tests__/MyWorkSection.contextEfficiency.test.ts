import { describe, it, expect } from 'vitest'
import { selectContextEfficiency } from '../MyWorkSection'
import type { ContextEfficiency, AgentContextEfficiency } from '../../types'

function agent(name: string): AgentContextEfficiency {
  return { agent: name, sessions: 1, inputTokens: 100, outputTokens: 50, coarse: false, score: 90, topDrivers: [] }
}

const data: ContextEfficiency = {
  sessionsAnalyzed: 3,
  excludedAgents: ['kiro', 'agy'],
  overall: agent('all'),
  perAgent: [agent('claude'), agent('opencode')],
}

describe('selectContextEfficiency', () => {
  it('returns null when no data has loaded yet', () => {
    expect(selectContextEfficiency(null, 'all')).toBeNull()
  })

  it('returns overall when the filter is "all"', () => {
    expect(selectContextEfficiency(data, 'all')).toBe(data.overall)
  })

  it('returns the matching per-agent entry when filtered to a known agent', () => {
    expect(selectContextEfficiency(data, 'opencode')).toBe(data.perAgent[1])
  })

  it('falls back to overall when the filter names an agent no longer in the response', () => {
    expect(selectContextEfficiency(data, 'codex')).toBe(data.overall)
  })
})
