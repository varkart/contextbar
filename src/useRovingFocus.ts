import { useState, useCallback, useRef, type KeyboardEvent, type RefCallback } from 'react'

interface UseRovingFocusOptions {
  count: number
  onSelect?: (index: number) => void
  horizontal?: boolean
}

interface ItemProps {
  tabIndex: number
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void
  ref: RefCallback<HTMLElement>
  onFocus: () => void
}

interface UseRovingFocusResult {
  focusedIndex: number
  setFocusedIndex: (index: number) => void
  getItemProps: (index: number) => ItemProps
}

export function useRovingFocus({ count, onSelect, horizontal = false }: UseRovingFocusOptions): UseRovingFocusResult {
  const [focusedIndex, setFocusedIndex] = useState(0)
  const itemRefs = useRef<(HTMLElement | null)[]>([])

  const focusItem = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, count - 1))
    setFocusedIndex(clamped)
    itemRefs.current[clamped]?.focus()
    itemRefs.current[clamped]?.scrollIntoView({ block: 'nearest' })
  }, [count])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLElement>, index: number) => {
    if (count === 0) return
    const prev = horizontal ? 'ArrowLeft' : 'ArrowUp'
    const next = horizontal ? 'ArrowRight' : 'ArrowDown'
    switch (e.key) {
      case next:
        e.preventDefault()
        focusItem(index < count - 1 ? index + 1 : 0)
        break
      case prev:
        e.preventDefault()
        focusItem(index > 0 ? index - 1 : count - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        onSelect?.(index)
        break
    }
  }, [count, focusItem, onSelect, horizontal])

  const getItemProps = useCallback((index: number): ItemProps => ({
    tabIndex: focusedIndex === index ? 0 : -1,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => handleKeyDown(e, index),
    ref: (el: HTMLElement | null) => { itemRefs.current[index] = el },
    onFocus: () => setFocusedIndex(index),
  }), [focusedIndex, handleKeyDown])

  return { focusedIndex, setFocusedIndex, getItemProps }
}
