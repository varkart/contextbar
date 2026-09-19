import { describe, it, expect } from 'vitest'
import { computeDailyConcurrency, computeDailyMaxConcurrency } from '../MyWorkSection'

const DAY = 86_400_000
const start = Date.UTC(2026, 0, 1) // day 0 = Jan 1

describe('computeDailyConcurrency', () => {
  it('gives a full day of one open session a concurrency of exactly 1.0', () => {
    const activity = [{ tsMs: start + DAY, agent: 'claude', minutes: 24 * 60 }]
    const days = computeDailyConcurrency(activity, start, 1)
    expect(days[0].claude).toBeCloseTo(1.0, 5)
  })

  it('sums two fully-overlapping sessions of the same agent to 2.0', () => {
    const activity = [
      { tsMs: start + DAY, agent: 'claude', minutes: 24 * 60 },
      { tsMs: start + DAY, agent: 'claude', minutes: 24 * 60 },
    ]
    const days = computeDailyConcurrency(activity, start, 1)
    expect(days[0].claude).toBeCloseTo(2.0, 5)
  })

  it('gives a half-day session a concurrency of 0.5', () => {
    const activity = [{ tsMs: start + DAY, agent: 'claude', minutes: 12 * 60 }]
    const days = computeDailyConcurrency(activity, start, 1)
    expect(days[0].claude).toBeCloseTo(0.5, 5)
  })

  it('keeps agents separate — concurrency is per-agent, summed by the caller for "All"', () => {
    const activity = [
      { tsMs: start + DAY, agent: 'claude', minutes: 24 * 60 },
      { tsMs: start + DAY, agent: 'codex', minutes: 24 * 60 },
    ]
    const days = computeDailyConcurrency(activity, start, 1)
    expect(days[0].claude).toBeCloseTo(1.0, 5)
    expect(days[0].codex).toBeCloseTo(1.0, 5)
    expect((days[0].claude ?? 0) + (days[0].codex ?? 0)).toBeCloseTo(2.0, 5)
  })

  it('splits a session spanning two days proportionally to each day', () => {
    // Starts 12h before day 1 begins, runs 24h — 12h in day 0, 12h in day 1.
    const activity = [{ tsMs: start + DAY + 12 * 60 * 60 * 1000, agent: 'claude', minutes: 24 * 60 }]
    const days = computeDailyConcurrency(activity, start, 2)
    expect(days[0].claude).toBeCloseTo(0.5, 5)
    expect(days[1].claude).toBeCloseTo(0.5, 5)
  })

  it('ignores a zero/unknown-duration session instead of dividing by zero', () => {
    const activity = [{ tsMs: start + DAY, agent: 'claude', minutes: 0 }]
    const days = computeDailyConcurrency(activity, start, 1)
    expect(days[0].claude).toBeUndefined()
  })

  it('drops overlap outside the requested window instead of throwing', () => {
    // Starts well before the window and ends well after it.
    const activity = [{ tsMs: start + 10 * DAY, agent: 'claude', minutes: 20 * 24 * 60 }]
    const days = computeDailyConcurrency(activity, start, 3)
    expect(days).toHaveLength(3)
    expect(days[0].claude).toBeCloseTo(1.0, 5)
    expect(days[2].claude).toBeCloseTo(1.0, 5)
  })
})

describe('computeDailyMaxConcurrency', () => {
  it('reports 1 for a single session, however long it runs', () => {
    const activity = [{ tsMs: start + DAY, agent: 'claude', minutes: 24 * 60 }]
    expect(computeDailyMaxConcurrency(activity, start, 1)).toEqual([1])
  })

  it('reports 2 when two sessions truly overlap, regardless of how briefly', () => {
    // Session A: hour 0-2. Session B: hour 1-3. They overlap during hour 1-2.
    const dayStart = start
    const activity = [
      { tsMs: dayStart + 2 * 3600_000, agent: 'claude', minutes: 120 },
      { tsMs: dayStart + 3 * 3600_000, agent: 'codex', minutes: 120 },
    ]
    expect(computeDailyMaxConcurrency(activity, start, 1)).toEqual([2])
  })

  it('reports 1 when two sessions are sequential, not overlapping', () => {
    // Session A: hour 0-2. Session B: hour 2-4 — touches but doesn't overlap.
    const activity = [
      { tsMs: start + 2 * 3600_000, agent: 'claude', minutes: 120 },
      { tsMs: start + 4 * 3600_000, agent: 'codex', minutes: 120 },
    ]
    expect(computeDailyMaxConcurrency(activity, start, 1)).toEqual([1])
  })

  it('is not additive across agents — two agents peaking at different times of day stay at 1, not 2', () => {
    const activity = [
      { tsMs: start + 2 * 3600_000, agent: 'claude', minutes: 60 }, // hour 1-2
      { tsMs: start + 20 * 3600_000, agent: 'codex', minutes: 60 }, // hour 19-20, no overlap with claude
    ]
    expect(computeDailyMaxConcurrency(activity, start, 1)).toEqual([1])
  })

  it('counts a true three-way overlap correctly', () => {
    const activity = [
      { tsMs: start + 3 * 3600_000, agent: 'claude', minutes: 180 }, // hour 0-3
      { tsMs: start + 3 * 3600_000, agent: 'codex', minutes: 180 },  // hour 0-3
      { tsMs: start + 3 * 3600_000, agent: 'opencode', minutes: 180 }, // hour 0-3
    ]
    expect(computeDailyMaxConcurrency(activity, start, 1)).toEqual([3])
  })

  it('scopes the peak to each day independently', () => {
    const activity = [
      { tsMs: start + 2 * 3600_000, agent: 'claude', minutes: 120 }, // hour 0-2
      { tsMs: start + 3 * 3600_000, agent: 'codex', minutes: 120 },  // hour 1-3, overlaps hour 1-2
      { tsMs: start + DAY + 5 * 3600_000, agent: 'claude', minutes: 60 }, // day 1, alone
    ]
    expect(computeDailyMaxConcurrency(activity, start, 2)).toEqual([2, 1])
  })

  it('returns all zeros for an empty window', () => {
    expect(computeDailyMaxConcurrency([], start, 3)).toEqual([0, 0, 0])
  })
})
