import { useState, useMemo } from 'react'
import type { AiTool } from '../types'

export function useProviderFilter(tools: AiTool[]) {
  const installedTools = useMemo(() => tools.filter(t => t.installed), [tools])
  const [selectedTools, setSelectedTools] = useState<Set<string>>(
    () => new Set(tools.filter(t => t.installed).map(t => t.id))
  )

  const toggleTool = (id: string) => {
    setSelectedTools(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = selectedTools.size === installedTools.length

  return { installedTools, selectedTools, toggleTool, allSelected }
}
