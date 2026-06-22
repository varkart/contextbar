import { useState, useMemo } from 'react'
import type { AiTool, McpServer } from '../../types'
import { TOOL_COLORS } from '../../constants/toolColors'

interface Props {
  tools: AiTool[]
  onBack: () => void
  onSelectMcp: (mcp: McpServer) => void
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

function buildMcpGroups(tools: AiTool[]): McpGroup[] {
  const map = new Map<string, McpVariant[]>()
  for (const tool of tools) {
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

function ToolDot({ toolId }: { toolId: string }) {
  const colors = TOOL_COLORS[toolId] ?? { bg: 'bg-zinc-500/15', text: 'text-zinc-400' }
  return (
    <span className={`inline-flex w-3.5 h-3.5 rounded-sm text-[9px] font-bold items-center justify-center flex-shrink-0 ${colors.bg} ${colors.text}`}>
      {toolId[0].toUpperCase()}
    </span>
  )
}

export default function AllMcpsView({ tools, onSelectMcp }: Props) {
  const [query, setQuery] = useState('')
  const installedTools = useMemo(() => tools.filter(t => t.installed), [tools])
  const [selectedTools, setSelectedTools] = useState<Set<string>>(
    () => new Set(tools.filter(t => t.installed).map(t => t.id))
  )
  const groups = useMemo(() => buildMcpGroups(tools), [tools])

  const toggleTool = (id: string) => {
    setSelectedTools(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const allSelected = selectedTools.size === installedTools.length

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
  const installedToolCount = installedTools.length
  const isFiltered = filtered.length !== totalMcps
  const countLabel = isFiltered
    ? `${filtered.length} of ${totalMcps} MCPs`
    : `${totalMcps} MCPs · ${installedToolCount} providers`

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)]">
      <div className="flex items-center justify-end px-4 py-2 border-b border-[var(--c-border)] flex-shrink-0">
        <span className="text-[12px] text-[var(--c-text-3)]">
          {countLabel}
        </span>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-[var(--c-border)] flex-shrink-0">
        <div className="relative">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--c-text-3)]">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search MCPs…"
            className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-md pl-8 pr-3 py-1.5 text-[13px] text-[var(--c-text)] placeholder:text-[var(--c-text-3)] focus:outline-none focus:border-violet-500/50"
          />
        </div>
      </div>

      {/* Provider filter chips */}
      {installedTools.length > 1 && (
        <div className="px-3 py-1.5 border-b border-[var(--c-border)] flex gap-1.5 flex-wrap flex-shrink-0">
          {installedTools.map(tool => {
            const colors = TOOL_COLORS[tool.id] ?? { bg: 'bg-zinc-500/15', text: 'text-zinc-400' }
            const selected = selectedTools.has(tool.id)
            return (
              <button
                key={tool.id}
                onClick={() => toggleTool(tool.id)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all ${
                  selected
                    ? `${colors.bg} ${colors.text} border-transparent`
                    : 'bg-transparent border-[var(--c-border)] text-[var(--c-text-3)] opacity-50'
                }`}
              >
                <span>{tool.name[0].toUpperCase()}</span>
                <span>{tool.name}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-[13px] text-[var(--c-text-3)] px-4 py-6 text-center">
            {query ? 'No MCPs match' : 'No MCPs found'}
          </p>
        )}
        {filtered.map(group => (
          <button
            key={group.name}
            onClick={() => onSelectMcp(group.primary)}
            className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-[var(--c-hover)] transition-colors border-b border-[var(--c-border-sub)] last:border-0"
          >
            {/* tool dots column */}
            <div className="flex flex-col gap-0.5 mt-0.5 flex-shrink-0">
              {group.variants.map(v => (
                <ToolDot key={v.toolId + v.name} toolId={v.toolId} />
              ))}
            </div>

            {/* name + command */}
            <div className="flex-1 min-w-0">
              <span className="text-[14px] font-medium text-[var(--c-text)] truncate font-mono block">
                {group.name}
              </span>
              {group.primary.command && (
                <p className="text-[12px] text-[var(--c-text-3)] leading-relaxed mt-0.5 truncate">
                  {group.primary.command}
                </p>
              )}
            </div>

            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className="w-3 h-3 text-[var(--c-text-3)] flex-shrink-0 mt-1">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}
