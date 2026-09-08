import { useState, useMemo, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { Agent, McpServer } from '../../types'
import AgentChips from '../AgentChips'
import AgentMultiSelect from '../AgentMultiSelect'
import AgentToggleChips from '../AgentToggleChips'
import AgentActivePill from '../AgentActivePill'
import BulkToggleBar, { type BulkDescribe, type BulkMode } from '../BulkToggleBar'
import SearchInput from '../SearchInput'
import SortToggleButton from '../SortToggleButton'
import StatusFilterControl, { type StatusFilterValue } from '../StatusFilterControl'
import ZoneLabel from '../ZoneLabel'
import RemoveEverywhereBanner from '../RemoveEverywhereBanner'
import { useAgentFilter } from '../../hooks/useAgentFilter'
import { AGENT_SELECTOR_DROPDOWN_THRESHOLD } from '../../constants/filters'
import { useEnabledSort } from '../../hooks/useEnabledSort'
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
  /** Lower-cased names of MCP servers called at least once in the usage window. */
  usedNames?: Set<string>
  /** Sessions analyzed for the usage window; 0 means "no data" — the unused review is hidden. */
  usageAnalyzed?: number
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

export default function AllMcpsView({ agents, onSelectMcp, onAddMcp, onInstalled, compact, usedNames, usageAnalyzed = 0 }: Props) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all')
  const [togglingKey, setTogglingKey] = useState<{ name: string; toolId: string } | null>(null)
  const [pendingRemoveGroup, setPendingRemoveGroup] = useState<string | null>(null)
  const [removingGroup, setRemovingGroup] = useState<string | null>(null)
  const [removeGroupError, setRemoveGroupError] = useState<Record<string, string>>({})
  const [reviewMode, setReviewMode] = useState(false)
  const [reviewSel, setReviewSel] = useState<Set<string>>(new Set())
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const { installedAgents, selectedTools, toggleTool, toggleToolCheckbox, selectAll, allSelected } = useAgentFilter(agents)
  const groups = useMemo(() => buildMcpGroups(agents), [agents])
  const agentMcpCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const tool of installedAgents) counts[tool.id] = tool.mcps.length
    return counts
  }, [installedAgents])

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

  const handleRemoveGroupEverywhere = async (group: McpGroup) => {
    setRemovingGroup(group.name)
    setRemoveGroupError(prev => ({ ...prev, [group.name]: '' }))
    try {
      for (const v of group.variants) {
        await invoke('remove_mcp', {
          agentId: v.toolId,
          mcpName: v.name,
          sourceId: v.sourceId,
          command: v.command || null,
          args: v.args,
          url: v.url ?? null,
        })
        capture('mcp_removed', { tool_id: v.toolId, mcp_name: v.name })
      }
      capture('mcp_removed_everywhere', { mcp_name: group.name, agent_count: group.variants.length })
    } catch (e) {
      setRemoveGroupError(prev => ({ ...prev, [group.name]: String(e) }))
      captureException(e)
      setRemovingGroup(null)
      return
    }
    await onInstalled?.()
    setRemovingGroup(null)
    setPendingRemoveGroup(null)
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
    if (statusFilter !== 'all') {
      const wantActive = statusFilter === 'active'
      result = result.filter(g => g.variants.some(v => v.active) === wantActive)
    }
    return result
  }, [groups, query, selectedTools, allSelected, statusFilter])

  const { sortMode, setSortMode, sorted } = useEnabledSort(filtered)

  // "Active on Claude Code, no recorded calls in the usage window" — cleanup
  // candidates. Scoped to Claude: it's the only agent whose MCP calls we track,
  // so an MCP active only on another agent must not be flagged. Hidden when
  // there's no usage data (else everything looks unused).
  const unusedGroups = useMemo(() => {
    if (!usedNames || usageAnalyzed === 0) return []
    return groups.filter(g =>
      g.variants.some(v => v.active && v.toolId === 'claude')
      && !usedNames.has(g.name.toLowerCase()),
    )
  }, [groups, usedNames, usageAnalyzed])
  const listGroups = reviewMode ? unusedGroups : sorted

  const exitReview = () => { setReviewMode(false); setReviewSel(new Set()); setBulkDeleteConfirm(false) }
  useEffect(() => {
    if (reviewMode && unusedGroups.length === 0) exitReview()
  }, [reviewMode, unusedGroups.length])

  const toggleSel = (name: string) => setReviewSel(prev => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name); else next.add(name)
    return next
  })
  const allSel = unusedGroups.length > 0 && unusedGroups.every(g => reviewSel.has(g.name))
  const someSel = unusedGroups.some(g => reviewSel.has(g.name))
  const toggleSelAll = () => setReviewSel(allSel ? new Set() : new Set(unusedGroups.map(g => g.name)))

  // Both bulk actions touch ONLY the Claude variant — the one the review judged.
  const disableSelected = async () => {
    setBulkBusy(true)
    for (const g of unusedGroups) {
      if (!reviewSel.has(g.name)) continue
      for (const v of g.variants) {
        if (!v.active || v.toolId !== 'claude') continue
        try {
          await invoke('set_mcp_active', { agentId: v.toolId, mcpName: v.name, sourceId: v.sourceId, active: false, extensionName: v.extensionName ?? null })
          capture('mcp_toggled', { tool_id: v.toolId, mcp_name: v.name, active: false })
        } catch (e) { captureException(e) }
      }
    }
    setReviewSel(new Set())
    setBulkBusy(false)
    await onInstalled?.()
  }
  const deleteSelected = async () => {
    setBulkBusy(true)
    const targets = unusedGroups.filter(g => reviewSel.has(g.name))
    for (const g of targets) {
      for (const v of g.variants) {
        if (v.toolId !== 'claude') continue
        try {
          await invoke('remove_mcp', { agentId: v.toolId, mcpName: v.name, sourceId: v.sourceId, command: v.command || null, args: v.args, url: v.url ?? null })
          capture('mcp_removed', { tool_id: v.toolId, mcp_name: v.name })
        } catch (e) { captureException(e) }
      }
      capture('mcp_removed_everywhere', { mcp_name: g.name, agent_count: g.variants.length })
    }
    setReviewSel(new Set())
    setBulkDeleteConfirm(false)
    setBulkBusy(false)
    await onInstalled?.()
  }

  const totalMcps = groups.length
  const installedAgentCount = installedAgents.length
  const isFiltered = filtered.length !== totalMcps
  const countLabel = isFiltered
    ? `${filtered.length} of ${totalMcps} MCPs`
    : `${totalMcps} MCPs · ${installedAgentCount} providers`

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)]">
      {/* ACTIONS row — changes state; amber left rail + bolt mark it as such */}
      <div className="border-l-2 border-l-amber-500/60 border-b border-[var(--c-border)] flex-shrink-0 flex items-center gap-2 px-3 py-1.5 flex-wrap">
        <ZoneLabel kind="actions" />
        <span className="flex-1" />
        {onAddMcp && (
          <button
            onClick={onAddMcp}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md border border-violet-500/40 text-violet-400 hover:bg-violet-500/10 transition-colors font-semibold flex-shrink-0 ${compact ? 'text-[12px]' : 'text-[13px]'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className="w-3 h-3">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add MCP
          </button>
        )}
        <BulkToggleBar variant="inline" noun="MCP" agentName={agentName} describeBulk={describeBulk} applyBulk={applyBulk} />
      </div>

      {/* FILTER band — narrows what the list shows */}
      <div className="bg-violet-500/[0.04] border-b border-[var(--c-border)] flex-shrink-0">
        <div className="px-3 pt-1.5 pb-1"><ZoneLabel kind="filter" /></div>
        <div className="px-3 pb-1.5">
          <SearchInput value={query} onChange={setQuery} placeholder="Search MCPs…" accentColor="violet" />
        </div>
        <div className="flex items-center justify-between gap-2 px-3 pb-2 flex-wrap">
          {installedAgents.length >= AGENT_SELECTOR_DROPDOWN_THRESHOLD ? (
            <AgentMultiSelect
              installedAgents={installedAgents}
              selectedTools={selectedTools}
              allSelected={allSelected}
              onToggle={toggleToolCheckbox}
              onSelectAll={selectAll}
              counts={agentMcpCounts}
              compact={compact}
            />
          ) : (
            <AgentChips installedAgents={installedAgents} selectedTools={selectedTools} onToggle={toggleTool} />
          )}
          <StatusFilterControl value={statusFilter} onChange={setStatusFilter} compact={compact} />
        </div>
      </div>

      {unusedGroups.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-500/[0.08] border-b border-amber-500/20 flex-shrink-0 text-[12px] text-amber-300">
          <span className="flex-1 min-w-0">
            {reviewMode
              ? `Reviewing ${unusedGroups.length} Claude Code MCP${unusedGroups.length > 1 ? 's' : ''} with no recorded calls in the last 30 days.`
              : `${unusedGroups.length} active Claude Code MCP${unusedGroups.length > 1 ? 's' : ''} — no recorded calls in the last 30 days.`}
          </span>
          <button
            onClick={() => reviewMode ? exitReview() : setReviewMode(true)}
            className="flex-shrink-0 px-2 py-0.5 rounded-md border border-amber-500/40 hover:bg-amber-500/10 font-semibold transition-colors"
          >
            {reviewMode ? 'Exit review' : 'Review'}
          </button>
        </div>
      )}

      {reviewMode ? (
        <div className="flex items-center gap-3 px-4 py-1.5 border-b border-[var(--c-border-sub)] flex-shrink-0">
          <button
            onClick={toggleSelAll}
            aria-label="Select all"
            className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] transition-colors ${allSel || someSel ? 'bg-[var(--c-accent)] border-[var(--c-accent)] text-white' : 'border-[var(--c-text-3)]'}`}
          >
            {allSel ? '✓' : someSel ? '–' : ''}
          </button>
          <span className={`font-semibold uppercase tracking-wider text-[var(--c-text-3)] ${compact ? 'text-[9.5px]' : 'text-[11px]'}`}>Claude Code · no calls in 30 days</span>
        </div>
      ) : (
        <div className="flex items-center px-4 py-1.5 border-b border-[var(--c-border-sub)] flex-shrink-0">
          <SortToggleButton
            sortMode={sortMode}
            onToggle={() => setSortMode(m => m === 'name' ? 'enabled' : 'name')}
            compact={compact}
          />
          <span className={`font-semibold uppercase tracking-wider text-[var(--c-text-3)] ${compact ? 'text-[9.5px]' : 'text-[11px]'}`}>Agents</span>
          <span className="w-[18px]" />
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {listGroups.length === 0 && (
          <p className={`text-[var(--c-text-3)] px-4 py-6 text-center ${compact ? 'text-[13px]' : 'text-[14px]'}`}>
            {reviewMode ? 'No unused active MCPs' : query ? 'No MCPs match' : 'No MCPs found'}
          </p>
        )}
        {listGroups.map(group => {
          const activeCount = group.variants.filter(v => v.active).length
          const allOff = activeCount === 0
          const hasSecrets = group.variants.some(v => v.hasSecrets)
          return (
            <div key={group.name} className="border-b border-[var(--c-border-sub)] last:border-0">
              <div className={`w-full flex items-center gap-3 px-4 py-2 hover:bg-[var(--c-hover)] transition-colors ${reviewMode && reviewSel.has(group.name) ? 'bg-[var(--c-accent)]/[0.06]' : ''}`}>
                {reviewMode && (
                  <button
                    onClick={() => toggleSel(group.name)}
                    aria-label={`Select ${group.name}`}
                    className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] flex-shrink-0 transition-colors ${reviewSel.has(group.name) ? 'bg-[var(--c-accent)] border-[var(--c-accent)] text-white' : 'border-[var(--c-text-3)]'}`}
                  >
                    {reviewSel.has(group.name) ? '✓' : ''}
                  </button>
                )}
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
                <button
                  onClick={() => setPendingRemoveGroup(group.name)}
                  aria-label={`Remove ${group.name} from all agents`}
                  className="p-0.5 text-[var(--c-text-3)] hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="w-3.5 h-3.5">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                  </svg>
                </button>
                <span className="w-[18px] flex justify-end flex-shrink-0" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    className="w-3 h-3 text-[var(--c-text-3)]">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </span>
              </div>
              {pendingRemoveGroup === group.name && (
                <div className="px-4 pb-3">
                  <RemoveEverywhereBanner
                    noun="MCP"
                    name={group.name}
                    agentNames={group.variants.map(v => v.toolName)}
                    running={removingGroup === group.name}
                    error={removeGroupError[group.name]}
                    onCancel={() => { setPendingRemoveGroup(null); setRemoveGroupError(prev => ({ ...prev, [group.name]: '' })) }}
                    onConfirm={() => handleRemoveGroupEverywhere(group)}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {reviewMode && (
        <div className="flex items-center gap-2 px-4 py-2 border-t border-[var(--c-border)] bg-[var(--c-surface)] flex-shrink-0 flex-wrap">
          {bulkDeleteConfirm ? (
            <>
              <span className="flex-1 text-[11.5px] text-rose-400">Remove {reviewSel.size} MCP{reviewSel.size === 1 ? '' : 's'} from Claude Code? Other agents keep their config.</span>
              <button disabled={bulkBusy} onClick={deleteSelected} className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-rose-500 text-white hover:opacity-90 disabled:opacity-50">
                {bulkBusy ? 'Removing…' : 'Confirm remove'}
              </button>
              <button disabled={bulkBusy} onClick={() => setBulkDeleteConfirm(false)} className="text-[11px] px-2.5 py-1 rounded-md bg-[var(--c-surface-2)] text-[var(--c-text-2)] hover:opacity-80">Cancel</button>
            </>
          ) : (
            <>
              <span className="flex-1 text-[11px] text-[var(--c-text-3)]">{reviewSel.size} selected · action applies to Claude Code only</span>
              <button disabled={!reviewSel.size || bulkBusy} onClick={disableSelected} className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-[var(--c-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-40">
                {bulkBusy ? 'Working…' : 'Disable selected'}
              </button>
              <button disabled={!reviewSel.size || bulkBusy} onClick={() => setBulkDeleteConfirm(true)} className="text-[11px] font-medium px-2 py-1 rounded-md text-rose-400/80 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-40">
                Remove
              </button>
            </>
          )}
        </div>
      )}

      <div className="px-4 py-1.5 border-t border-[var(--c-border)] flex-shrink-0">
        <span className={`text-[var(--c-text-3)] ${compact ? 'text-[11px]' : 'text-[12px]'}`}>{countLabel}</span>
      </div>
    </div>
  )
}
