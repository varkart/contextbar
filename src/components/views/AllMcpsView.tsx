import { useState, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { Agent, McpServer } from '../../types'
import AgentChips from '../AgentChips'
import AgentToggleChips from '../AgentToggleChips'
import AgentActivePill from '../AgentActivePill'
import BulkToggleBar, { type BulkDescribe, type BulkMode } from '../BulkToggleBar'
import SearchInput from '../SearchInput'
import { useAgentFilter } from '../../hooks/useAgentFilter'
import { capture, captureException } from '../../analytics'

interface Props {
  agents: Agent[]
  onBack: () => void
  onSelectMcp: (mcp: McpServer) => void
  onAddMcp?: () => void
  /** Refreshes agent data after a toggle write — required to reflect the change. */
  onInstalled?: () => Promise<void>
  /** Popover (small window): render agents as a hover-to-expand pill instead of always-visible chips. */
  compact?: boolean
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

function computeBulkChanges(groups: McpGroup[], mode: BulkMode) {
  const target = mode === 'enable'
  const changed: McpVariant[] = []
  const allAgentIds = new Set<string>()
  for (const g of groups) {
    for (const v of g.variants) {
      allAgentIds.add(v.toolId)
      if (v.active !== target) changed.push(v)
    }
  }
  const changedAgentIds = [...new Set(changed.map(v => v.toolId))]
  const untouchedAgentIds = [...allAgentIds].filter(id => !changedAgentIds.includes(id))
  return { changed, changedAgentIds, untouchedAgentIds }
}

export default function AllMcpsView({ agents, onSelectMcp, onAddMcp, onInstalled, compact }: Props) {
  const [query, setQuery] = useState('')
  const [togglingKey, setTogglingKey] = useState<{ name: string; toolId: string } | null>(null)
  const { installedAgents, selectedTools, toggleTool, allSelected } = useAgentFilter(agents)
  const groups = useMemo(() => buildMcpGroups(agents), [agents])

  const agentName = (toolId: string) => agents.find(a => a.id === toolId)?.name ?? toolId

  const toggleVariant = async (v: McpVariant) => {
    setTogglingKey({ name: v.name, toolId: v.toolId })
    try {
      await invoke('set_mcp_active', {
        agentId: v.toolId,
        mcpName: v.name,
        sourceId: v.sourceId,
        active: !v.active,
        extensionName: v.extensionName ?? null,
      })
      capture('mcp_toggled', { tool_id: v.toolId, mcp_name: v.name, active: !v.active })
    } catch (e) {
      captureException(e)
    } finally {
      await onInstalled?.()
      setTogglingKey(null)
    }
  }

  const describeBulk = (mode: BulkMode): BulkDescribe => {
    const { changed, changedAgentIds, untouchedAgentIds } = computeBulkChanges(groups, mode)
    return { changeCount: changed.length, changedAgentIds, untouchedAgentIds, singleName: changed.length === 1 ? changed[0].name : undefined }
  }

  const applyBulk = async (mode: BulkMode): Promise<BulkDescribe> => {
    const { changed, changedAgentIds, untouchedAgentIds } = computeBulkChanges(groups, mode)
    const target = mode === 'enable'
    for (const v of changed) {
      try {
        await invoke('set_mcp_active', {
          agentId: v.toolId,
          mcpName: v.name,
          sourceId: v.sourceId,
          active: target,
          extensionName: v.extensionName ?? null,
        })
        capture('mcp_toggled', { tool_id: v.toolId, mcp_name: v.name, active: target })
      } catch (e) {
        captureException(e)
      }
    }
    await onInstalled?.()
    return { changeCount: changed.length, changedAgentIds, untouchedAgentIds, singleName: changed.length === 1 ? changed[0].name : undefined }
  }

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
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-violet-500/40 text-violet-400 hover:bg-violet-500/10 transition-colors font-semibold flex-shrink-0 ${compact ? 'text-[12px]' : 'text-[13px]'}`}
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

      <BulkToggleBar noun="MCP" agentName={agentName} describeBulk={describeBulk} applyBulk={applyBulk} />

      <div className="flex items-center px-4 py-1.5 border-b border-[var(--c-border-sub)] flex-shrink-0">
        <span className={`flex-1 font-semibold uppercase tracking-wider text-[var(--c-text-3)] ${compact ? 'text-[9.5px]' : 'text-[11px]'}`}>Name</span>
        <span className={`font-semibold uppercase tracking-wider text-[var(--c-text-3)] ${compact ? 'text-[9.5px]' : 'text-[11px]'}`}>Agents</span>
        <span className="w-[18px]" />
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className={`text-[var(--c-text-3)] px-4 py-6 text-center ${compact ? 'text-[13px]' : 'text-[14px]'}`}>
            {query ? 'No MCPs match' : 'No MCPs found'}
          </p>
        )}
        {filtered.map(group => {
          const activeCount = group.variants.filter(v => v.active).length
          const allOff = activeCount === 0
          const hasSecrets = group.variants.some(v => v.hasSecrets)
          return (
            <div
              key={group.name}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-[var(--c-hover)] transition-colors border-b border-[var(--c-border-sub)] last:border-0"
            >
              <button onClick={() => onSelectMcp(group.primary)} className="flex-1 min-w-0 text-left">
                <span className={`flex items-center gap-1.5 font-medium font-mono ${allOff ? 'text-[var(--c-text-3)]' : 'text-[var(--c-text)]'} ${compact ? 'text-[13px]' : 'text-[14px]'}`}>
                  <span className="truncate">{group.name}</span>
                  {hasSecrets && (
                    <svg className="w-2.5 h-2.5 flex-shrink-0 text-[var(--c-text-3)]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Uses secret env vars">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  )}
                </span>
                {(group.primary.url ?? group.primary.command) && (
                  <span className={`block font-mono text-[var(--c-text-3)] truncate mt-0.5 ${compact ? 'text-[10.5px]' : 'text-[11.5px]'}`}>
                    {group.primary.url ?? group.primary.command}
                  </span>
                )}
              </button>
              {compact ? (
                <AgentActivePill
                  items={group.variants.map(v => ({ toolId: v.toolId, active: v.active }))}
                  itemName={group.name}
                  togglingId={togglingKey?.name === group.name ? togglingKey.toolId : null}
                  onToggle={toolId => {
                    const v = group.variants.find(variant => variant.toolId === toolId)
                    if (v) toggleVariant(v)
                  }}
                />
              ) : (
                <AgentToggleChips
                  items={group.variants.map(v => ({ toolId: v.toolId, active: v.active }))}
                  itemName={group.name}
                  togglingId={togglingKey?.name === group.name ? togglingKey.toolId : null}
                  onToggle={toolId => {
                    const v = group.variants.find(variant => variant.toolId === toolId)
                    if (v) toggleVariant(v)
                  }}
                />
              )}
              <span className="w-[18px] flex justify-end flex-shrink-0" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  className="w-3 h-3 text-[var(--c-text-3)]">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </span>
            </div>
          )
        })}
      </div>

      <div className="px-4 py-1.5 border-t border-[var(--c-border)] flex-shrink-0">
        <span className={`text-[var(--c-text-3)] ${compact ? 'text-[11px]' : 'text-[12px]'}`}>{countLabel}</span>
      </div>
    </div>
  )
}
