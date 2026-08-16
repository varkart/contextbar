import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useEnabledSort } from '../useEnabledSort'

interface Item {
  name: string
  variants: { active: boolean }[]
}

function item(name: string, active: boolean): Item {
  return { name, variants: [{ active }] }
}

describe('useEnabledSort', () => {
  it('defaults to the input order (alphabetical, unchanged)', () => {
    const items = [item('alpha-disabled', false), item('zeta-enabled', true)]
    const { result } = renderHook(({ items }) => useEnabledSort(items), { initialProps: { items } })
    expect(result.current.sorted.map(g => g.name)).toEqual(['alpha-disabled', 'zeta-enabled'])
  })

  it('switching to enabled mode ranks active items first', () => {
    const items = [item('alpha-disabled', false), item('zeta-enabled', true)]
    const { result, rerender } = renderHook(({ items }) => useEnabledSort(items), { initialProps: { items } })
    act(() => result.current.setSortMode('enabled'))
    rerender({ items })
    expect(result.current.sorted.map(g => g.name)).toEqual(['zeta-enabled', 'alpha-disabled'])
  })

  it('does not reshuffle rows when only an active flag flips on an already-present item', () => {
    // Regression: toggling a row while sorted "enabled first" must not move
    // rows under the user's cursor mid-interaction.
    const items = [item('alpha-disabled', false), item('zeta-enabled', true)]
    const { result, rerender } = renderHook(({ items }) => useEnabledSort(items), { initialProps: { items } })
    act(() => result.current.setSortMode('enabled'))
    rerender({ items })
    expect(result.current.sorted.map(g => g.name)).toEqual(['zeta-enabled', 'alpha-disabled'])

    // Now enable alpha-disabled too — same two names, both active. Order
    // must stay frozen at the previous render's position, not jump.
    const updated = [item('alpha-disabled', true), item('zeta-enabled', true)]
    rerender({ items: updated })
    expect(result.current.sorted.map(g => g.name)).toEqual(['zeta-enabled', 'alpha-disabled'])
    // But the fresh active state is still reflected in the returned objects.
    expect(result.current.sorted.find(g => g.name === 'alpha-disabled')!.variants[0].active).toBe(true)
  })

  it('re-sorts once the item set itself changes (search/filter)', () => {
    const items = [item('alpha-disabled', false), item('zeta-enabled', true)]
    const { result, rerender } = renderHook(({ items }) => useEnabledSort(items), { initialProps: { items } })
    act(() => result.current.setSortMode('enabled'))
    rerender({ items })
    expect(result.current.sorted.map(g => g.name)).toEqual(['zeta-enabled', 'alpha-disabled'])

    // A new item appears (e.g. search cleared) — the frozen name-set no
    // longer matches, so it re-sorts fresh.
    const withNewItem = [...items, item('beta-enabled', true)]
    rerender({ items: withNewItem })
    expect(result.current.sorted.map(g => g.name)).toEqual(['beta-enabled', 'zeta-enabled', 'alpha-disabled'])
  })

  it('re-sorts when switching back to enabled mode after toggles happened in name mode', () => {
    const items = [item('alpha-disabled', false), item('zeta-enabled', true)]
    const { result, rerender } = renderHook(({ items }) => useEnabledSort(items), { initialProps: { items } })
    act(() => result.current.setSortMode('enabled'))
    rerender({ items })
    act(() => result.current.setSortMode('name'))
    rerender({ items })

    // Everything got enabled while sort mode was 'name'.
    const allEnabled = [item('alpha-disabled', true), item('zeta-enabled', true)]
    rerender({ items: allEnabled })
    act(() => result.current.setSortMode('enabled'))
    rerender({ items: allEnabled })
    // Both fully enabled now — alphabetical tiebreak applies, not a stale snapshot.
    expect(result.current.sorted.map(g => g.name)).toEqual(['alpha-disabled', 'zeta-enabled'])
  })
})
