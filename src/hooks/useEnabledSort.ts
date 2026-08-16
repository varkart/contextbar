import { useMemo, useRef, useState } from 'react'

export type EnabledSortMode = 'name' | 'enabled'

interface HasVariants {
  name: string
  variants: { active: boolean }[]
}

/** Fully-enabled groups first, partially-enabled next, fully-disabled last. */
function enabledRank(g: HasVariants): number {
  const activeCount = g.variants.filter(v => v.active).length
  if (activeCount === 0) return 2
  if (activeCount === g.variants.length) return 0
  return 1
}

/**
 * Sort a group list by name (default) or by enabled status (fully-enabled
 * first, partial next, fully-disabled last, alpha within tier).
 *
 * While in "enabled" mode, row order is frozen across re-renders that only
 * flip active flags on an already-present set of items — e.g. the user
 * toggling a row — so a click doesn't reshuffle rows out from under a fast
 * follow-up click. Order re-locks whenever the sort mode changes or the
 * item set itself changes (search/filter/agent list).
 */
export function useEnabledSort<T extends HasVariants>(items: T[]) {
  const [sortMode, setSortMode] = useState<EnabledSortMode>('name')
  const prevSortModeRef = useRef<EnabledSortMode>('name')
  const orderRef = useRef<string[]>([])

  const sorted = useMemo(() => {
    const modeChanged = prevSortModeRef.current !== sortMode
    prevSortModeRef.current = sortMode
    if (sortMode === 'name') return items

    const byName = new Map(items.map(g => [g.name, g]))
    const sameSet = !modeChanged
      && orderRef.current.length === items.length
      && orderRef.current.every(name => byName.has(name))
    if (sameSet) {
      return orderRef.current.map(name => byName.get(name)!)
    }

    const fresh = [...items].sort((a, b) => enabledRank(a) - enabledRank(b) || a.name.localeCompare(b.name))
    orderRef.current = fresh.map(g => g.name)
    return fresh
  }, [items, sortMode])

  return { sortMode, setSortMode, sorted }
}
