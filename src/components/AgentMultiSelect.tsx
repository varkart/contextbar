import { useEffect, useRef, useState } from 'react'
import type { Agent } from '../types'
import { agentColor } from '../constants/agentColors'

interface Props {
  installedAgents: Agent[]
  selectedTools: Set<string>
  allSelected: boolean
  onToggle: (id: string) => void
  onSelectAll: () => void
  /** Per-agent item count shown at the right of each row (e.g. skill count). */
  counts?: Record<string, number>
  compact?: boolean
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${
        checked ? 'bg-[var(--c-accent)] border-[var(--c-accent)]' : 'border-[var(--c-border)]'
      }`}
    >
      {checked && (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white"
          strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-2 h-2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </span>
  )
}

/** Agent filter as a checkbox-list dropdown instead of always-visible
 *  chips — used once there are enough installed agents that chips would
 *  wrap onto a second row (see the >=3 threshold where views pick this
 *  over AgentChips). Unlike the chips' solo-on-first-click, unchecking one
 *  agent here just deselects that one (see useAgentFilter's
 *  toggleToolCheckbox), matching how a checkbox list is expected to behave. */
export default function AgentMultiSelect({ installedAgents, selectedTools, allSelected, onToggle, onSelectAll, counts, compact }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  if (installedAgents.length <= 1) return null

  const label = allSelected ? 'All agents' : `${selectedTools.size} of ${installedAgents.length} agents`

  return (
    <div className="relative flex-shrink-0" ref={ref} data-testid="agent-filter-dropdown">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-2)] hover:border-indigo-500/30 hover:text-[var(--c-text)] transition-colors ${
          compact ? 'text-[11px] px-1.5 py-1' : 'text-[12px] px-2.5 py-1'
        }`}
      >
        <span>{label}</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-[calc(100%+4px)] left-0 w-[220px] bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg shadow-lg p-1.5 z-30">
          <button
            onClick={onSelectAll}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--c-hover)] transition-colors text-[12.5px] text-left"
          >
            <Checkbox checked={allSelected} />
            <span>All agents</span>
          </button>
          <div className="h-px bg-[var(--c-border-sub)] my-1 mx-0.5" />
          {installedAgents.map(tool => {
            const colors = agentColor(tool.id)
            const checked = selectedTools.has(tool.id)
            return (
              <button
                key={tool.id}
                onClick={() => onToggle(tool.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--c-hover)] transition-colors text-[12.5px] text-left"
              >
                <Checkbox checked={checked} />
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colors.hex }} />
                <span className="flex-1 truncate">{tool.name}</span>
                {counts && <span className="text-[var(--c-text-3)] text-[11px]">{counts[tool.id] ?? 0}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
