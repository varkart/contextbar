import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { computeWeekendDayFlags, applyDayScope } from '../MyWorkSection'

// This project's tsconfig has no Node types (browser/Vite-only) — declare
// just enough of `process` for the TZ pin below, rather than pulling in
// `@types/node` project-wide for one test file.
declare const process: { env: Record<string, string | undefined> }

// Pinned so the DST-transition test below is deterministic regardless of
// the machine/CI runner's own local timezone. Restored after this file so
// it can't leak into other test files.
const ORIGINAL_TZ = process.env.TZ
beforeAll(() => { process.env.TZ = 'America/New_York' })
afterAll(() => { process.env.TZ = ORIGINAL_TZ })

describe('computeWeekendDayFlags', () => {
  it('classifies a plain week correctly', () => {
    // Mon Mar 2 2026 through Sun Mar 8 2026 (before that year's US DST
    // transition, which lands on Mar 8).
    const start = new Date(2026, 2, 2).getTime()
    expect(computeWeekendDayFlags(start, 7)).toEqual([
      false, false, false, false, false, true, true, // Mon..Fri, Sat, Sun
    ])
  })

  it('stays correct across a real DST fall-back transition', () => {
    // US Eastern clocks fall back 1 hour at 2am on Sun Nov 1, 2026. A naive
    // `start + idx * DAY` (raw milliseconds) walk drifts an hour behind
    // local midnight once it crosses that transition, which can land back
    // in the *previous* calendar day — verified directly: for this exact
    // window, idx 3 (should be Monday) computes as "Sunday 23:00" under the
    // old raw-ms approach instead of Monday 00:00, misclassifying a weekday
    // as a weekend. computeWeekendDayFlags steps calendar days via
    // setDate(), which the OS/ICU handles correctly across the transition.
    const start = new Date(2026, 9, 30).getTime() // Fri Oct 30, local midnight
    expect(computeWeekendDayFlags(start, 5)).toEqual([
      false, // Fri Oct 30
      true, // Sat Oct 31
      true, // Sun Nov 1 (the transition day itself)
      false, // Mon Nov 2 — the case a raw-ms walk gets wrong
      false, // Tue Nov 3
    ])
  })
})

describe('applyDayScope', () => {
  const flags = [false, true, true, false, false] // Mon..Fri-shaped: weekday, weekend, weekend, weekday, weekday
  const values = [10, 20, 30, 40, 50]

  it('passes values through unchanged for "all", dividing by the full window', () => {
    const result = applyDayScope(values, 'all', flags)
    expect(result.values).toEqual(values)
    expect(result.daysDivisor).toBe(5)
    expect(result.weekDivisor).toBeCloseTo(5 / 7)
  })

  it('zeroes weekend days for "weekdays", dividing by the weekday count', () => {
    const result = applyDayScope(values, 'weekdays', flags)
    expect(result.values).toEqual([10, 0, 0, 40, 50])
    expect(result.daysDivisor).toBe(3)
    expect(result.weekDivisor).toBeCloseTo(3 / 5)
  })

  it('zeroes weekdays for "weekends", dividing by the weekend count', () => {
    const result = applyDayScope(values, 'weekends', flags)
    expect(result.values).toEqual([0, 20, 30, 0, 0])
    expect(result.daysDivisor).toBe(2)
    expect(result.weekDivisor).toBeCloseTo(2 / 2)
  })

  it('falls back divisors to 1 instead of 0 when a scope has no matching days', () => {
    const allWeekdays = [false, false, false, false, false]
    const result = applyDayScope(values, 'weekends', allWeekdays)
    expect(result.values).toEqual([0, 0, 0, 0, 0])
    expect(result.daysDivisor).toBe(1)
    expect(result.weekDivisor).toBe(0.5)
  })
})
