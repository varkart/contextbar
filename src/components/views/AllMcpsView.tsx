import { useState, useMemo } from 'react'
import type { Agent, McpServer } from '../../types'
import AgentDot from '../AgentDot'
import AgentChips from '../AgentChips'
import SearchInput from '../SearchInput'
import { useAgentFilter } from '../../hooks/useAgentFilter'

interface Props {
  agents: Agent[]
  onBack: () => void
  onSelectMcp: (mcp: McpServer) => void
  onAddMcp?: () => void
}

interface McpVariant extends McpServer {
  toolId: string
  toolName: string
}

interface McpGroup {
  name: string
  primary: McpVariant
  variants: McpVariant[]
}

function buildMcpGroups(agents: Agent[]): McpGroup[] {
  const map = new Map<string, McpVariant[]>()
  for (const tool of agents) {
    if (!tool.installed) continue
    for (const mcp of tool.mcps) {
      const key = mcp.name.toLowerCase()
      const entry = map.get(key) ?? []
      entry.push({ ...mcp, toolId: tool.id, toolName: tool.name })
      map.set(key, entry)
    }
  }
  const groups: McpGroup[] = []
  for (const [, variants] of map) {
    const primary = variants[0]
    groups.push({ name: primary.name, primary, variants })
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name))
}

export default function AllMcpsView({ agents, onSelectMcp, onAddMcp }: Props) {
  const [query, setQuery] = useState('')
  const { installedAgents, selectedTools, toggleTool, allSelected } = useAgentFilter(agents)
  const groups = useMemo(() => buildMcpGroups(agents), [agents])

  const filtered = useMemo(() => {
    let result = query.trim()
      ? groups.filter(g => g.name.toLowerCase().includes(query.toLowerCase()))
      : groups
    if (!allSelected) {
      result = result.filter(g => g.variants.some(v => selectedTools.has(v.toolId)))
    }
    return result
  }, [groups, query, selectedTools, allSelected])

  const totalMcps = groups.length
  const installedAgentCount = installedAgents.length
  const isFiltered = filtered.length !== totalMcps
  const countLabel = isFiltered
    ? `${filtered.length} of ${totalMcps} MCPs`
    : `${totalMcps} MCPs · ${installedAgentCount} providers`

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--c-border)] flex-shrink-0">
        <div className="flex-1 min-w-0">
          <SearchInput value={query} onChange={setQuery} placeholder="Search MCPs…" accentColor="violet" />
        </div>
        {onAddMcp && (
          <button
            onClick={onAddMcp}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-violet-500 text-white hover:bg-violet-400 transition-colors text-[12px] font-semibold flex-shrink-0 shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className="w-3 h-3">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add MCP
          </button>
        )}
      </div>

      <AgentChips installedAgents={installedAgents} selectedTools={selectedTools} onToggle={toggleTool} />

      <div className="flex items-center px-4 py-1.5 border-b border-[var(--c-border-sub)] flex-shrink-0">
        <span className="flex-1 text-[9.5px] font-semibold uppercase tracking-wider text-[var(--c-text-3)]">Name</span>
        <span className="w-[72px] text-[9.5px] font-semibold uppercase tracking-wider text-[var(--c-text-3)]">Agents</span>
        <span className="w-[52px] text-right text-[9.5px] font-semibold uppercase tracking-wider text-[var(--c-text-3)]">Active</span>
        <span className="w-[18px]" />
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-[13px] text-[var(--c-text-3)] px-4 py-6 text-center">
            {query ? 'No MCPs match' : 'No MCPs found'}
          </p>
        )}
        {filtered.map(group => {
          const activeCount = group.variants.filter(v => v.active).length
          const allOff = activeCount === 0
          const hasSecrets = group.variants.some(v => v.hasSecrets)
          return (
            <button
              key={group.name}
              onClick={() => onSelectMcp(group.primary)}
              title={group.primary.url ?? group.primary.command ?? undefined}
              className="w-full flex items-center px-4 py-2 text-left hover:bg-[var(--c-hover)] transition-colors border-b border-[var(--c-border-sub)] last:border-0"
            >
              <span className={`flex-1 min-w-0 flex items-center gap-1.5 text-[13px] font-medium font-mono ${allOff ? 'text-[var(--c-text-3)]' : 'text-[var(--c-text)]'}`}>
                <span className="truncate">{group.name}</span>
                {hasSecrets && (
                  <svg className="w-2.5 h-2.5 flex-shrink-0 text-[var(--c-text-3)]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Uses secret env vars">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                )}
              </span>
              <span className={`w-[72px] flex gap-1 ${allOff ? 'opacity-50' : ''}`}>
                {group.variants.map(v => (
                  <AgentDot key={v.toolId + v.name} toolId={v.toolId} toolName={v.toolName} />
                ))}
              </span>
              <span className={`w-[52px] text-right text-[11px] tabular-nums ${allOff ? 'text-[var(--c-text-3)]' : 'text-emerald-400'}`}>
                {allOff ? 'off' : `${activeCount}/${group.variants.length} on`}
              </span>
              <span className="w-[18px] flex justify-end">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  className="w-3 h-3 text-[var(--c-text-3)]">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </span>
            </button>
          )
        })}
      </div>

      <div className="px-4 py-1.5 border-t border-[var(--c-border)] flex-shrink-0">
        <span className="text-[11px] text-[var(--c-text-3)]">{countLabel}</span>
      </div>
    </div>
  )
}
