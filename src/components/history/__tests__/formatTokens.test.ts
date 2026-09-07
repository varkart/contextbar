import { describe, it, expect } from 'vitest'
import { formatTokens } from '../SessionStats'

describe('formatTokens', () => {
  it('leaves small counts as-is', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(42)).toBe('42')
    expect(formatTokens(999)).toBe('999')
  })

  it('scales through k / M / B / T', () => {
    expect(formatTokens(4_400)).toBe('4.4k')
    expect(formatTokens(1_500_000)).toBe('1.5M')
    expect(formatTokens(62_200_000)).toBe('62.2M')
    expect(formatTokens(237_200_000)).toBe('237.2M')
    expect(formatTokens(1_000_000_000)).toBe('1B')
    expect(formatTokens(4_800_000_000)).toBe('4.8B')
    expect(formatTokens(2_500_000_000_000)).toBe('2.5T')
  })

  it('rolls to the next unit instead of showing four integer digits', () => {
    expect(formatTokens(999_900_000)).toBe('999.9M')
    expect(formatTokens(1_000_000_000)).toBe('1B')
    expect(formatTokens(1_000_000_000_000)).toBe('1T')
  })

  it('strips a trailing .0', () => {
    expect(formatTokens(150_000_000)).toBe('150M')
    expect(formatTokens(5_000)).toBe('5k')
  })
})
