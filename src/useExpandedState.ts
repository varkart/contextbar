import { useState, useEffect } from 'react'

const STORAGE_KEY = 'contextbar:expandedTools'

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function saveExpanded(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch {}
}

export function useExpandedState() {
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded)

  useEffect(() => {
    saveExpanded(expanded)
  }, [expanded])

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return { expanded, toggle }
}
