import { useState, useMemo } from 'react'
import type { Agent } from '../types'

export function useAgentFilter(tools: Agent[]) {
  const installedAgents = useMemo(() => tools.filter(t => t.installed), [tools])
  // null = no explicit narrowing yet → always "all selected", however many
  // agents have loaded so far. Agents arrive async from the backend, so a
  // Set captured at mount (before they load) would otherwise lock in as
  // empty forever and silently filter out everything.
  const [selectedTools, setSelectedTools] = useState<Set<string> | null>(null)

  // Clicking a bubble while everything is selected solos that agent (a
  // narrowing gesture — "just this one"). From there, clicking a different
  // bubble adds it to the selection instead of swapping, so multiple agents
  // can be picked; clicking an already-selected bubble removes it, and
  // removing the last one falls back to "all selected" rather than showing
  // nothing.
  const toggleTool = (id: string) => {
    setSelectedTools(prev => {
      if (prev === null) return new Set([id])
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next.size === 0 ? null : next
    })
  }

  const allSelected = selectedTools === null || selectedTools.size === installedAgents.length
  const effectiveSelected = selectedTools ?? new Set(installedAgents.map(t => t.id))

  return { installedAgents, selectedTools: effectiveSelected, toggleTool, allSelected }
}
