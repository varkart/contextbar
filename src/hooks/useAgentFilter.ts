import { useState, useMemo } from 'react'
import type { Agent } from '../types'

export function useAgentFilter(tools: Agent[]) {
  const installedAgents = useMemo(() => tools.filter(t => t.installed), [tools])
  // null = no explicit narrowing yet → always "all selected", however many
  // agents have loaded so far. Agents arrive async from the backend, so a
  // Set captured at mount (before they load) would otherwise lock in as
  // empty forever and silently filter out everything.
  const [selectedTools, setSelectedTools] = useState<Set<string> | null>(null)

  const toggleTool = (id: string) => {
    setSelectedTools(prev => {
      const base = prev ?? new Set(installedAgents.map(t => t.id))
      const next = new Set(base)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = selectedTools === null || selectedTools.size === installedAgents.length
  const effectiveSelected = selectedTools ?? new Set(installedAgents.map(t => t.id))

  return { installedAgents, selectedTools: effectiveSelected, toggleTool, allSelected }
}
