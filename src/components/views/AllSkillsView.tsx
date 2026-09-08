import { useState, useMemo, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { Agent, Skill } from '../../types'
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
  onSelectSkill: (skill: Skill) => void
  onAddSkill?: () => void
  /** Refreshes agent data after a toggle write — required to reflect the change. */
  onInstalled?: () => Promise<void>
  /** Popover (small window): render agents as a hover-to-expand pill instead of always-visible chips. */
  compact?: boolean
  /** Lower-cased names of skills invoked at least once in the usage window. */
  usedNames?: Set<string>
  /** Sessions analyzed for the usage window; 0 means "no data" — the unused review is hidden. */
  usageAnalyzed?: number
}

interface SkillVariant extends Skill {
  toolId: string
  toolName: string
}

interface SkillGroup {
  name: string
  primary: SkillVariant
  variants: SkillVariant[]
}

function buildGroups(agents: Agent[]): SkillGroup[] {
  const map = new Map<string, SkillVariant[]>()
  for (const tool of agents) {
    if (!tool.installed) continue
    for (const skill of tool.skills) {
      const key = skill.name.toLowerCase()
      const entry = map.get(key) ?? []
      entry.push({ ...skill, toolId: tool.id, toolName: tool.name })
      map.set(key, entry)
    }
  }
  const groups: SkillGroup[] = []
  for (const [, variants] of map) {
    const primary = variants.find(v => v.active) ?? variants[0]
    groups.push({ name: primary.name, primary, variants })
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name))
}

function computeBulkChanges(groups: SkillGroup[], mode: BulkMode) {
  const target = mode === 'enable'
  const changed: SkillVariant[] = []
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

export default function AllSkillsView({ agents, onSelectSkill, onAddSkill, onInstalled, compact, usedNames, usageAnalyzed = 0 }: Props) {
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
  const groups = useMemo(() => buildGroups(agents), [agents])
  const agentSkillCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const tool of installedAgents) counts[tool.id] = tool.skills.length
    return counts
  }, [installedAgents])

  const agentName = (toolId: string) => agents.find(a => a.id === toolId)?.name ?? toolId

  const toggleVariant = async (v: SkillVariant) => {
    setTogglingKey({ name: v.name, toolId: v.toolId })
    try {
      await invoke('set_skill_active', {
        agentId: v.toolId,
        skillName: v.name,
        skillPath: v.path,
        sourceId: v.sourceId,
        active: !v.active,
      })
      capture('skill_toggled', { tool_id: v.toolId, skill_name: v.name, active: !v.active })
    } catch (e) {
      captureException(e)
    } finally {
      await onInstalled?.()
      setTogglingKey(null)
    }
  }

  const handleRemoveGroupEverywhere = async (group: SkillGroup) => {
    setRemovingGroup(group.name)
    setRemoveGroupError(prev => ({ ...prev, [group.name]: '' }))
    try {
      for (const v of group.variants) {
        await invoke('remove_skill', { agentId: v.toolId, skillName: v.name, skillPath: v.path })
        capture('skill_deleted', { tool_id: v.toolId, skill_name: v.name })
      }
      capture('skill_removed_everywhere', { skill_name: group.name, agent_count: group.variants.length })
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
        await invoke('set_skill_active', {
          agentId: v.toolId,
          skillName: v.name,
          skillPath: v.path,
          sourceId: v.sourceId,
          active: target,
        })
        capture('skill_toggled', { tool_id: v.toolId, skill_name: v.name, active: target })
      } catch (e) {
        captureException(e)
      }
    }
    await onInstalled?.()
    return { changeCount: changed.length, changedAgentIds, untouchedAgentIds, singleName: changed.length === 1 ? changed[0].name : undefined }
  }

  const filtered = useMemo(() => {
    let result = query.trim()
      ? groups.filter(g =>
          g.name.toLowerCase().includes(query.toLowerCase()) ||
          g.primary.description?.toLowerCase().includes(query.toLowerCase())
        )
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

  // "Active on Claude Code, no recorded runs in the usage window" — candidates
  // for cleanup. Deliberately scoped to Claude: it's the only agent whose skill
  // invocations we track today, so a skill active only on Codex / Gemini / etc.
  // must NOT be flagged (we can't see whether it ran there). Hidden entirely
  // when there's no usage data, since then everything would look unused.
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

  // Both bulk actions touch ONLY the Claude variant — that's the one the review
  // judged as unused. A copy of the same skill on another agent is left alone.
  const disableSelected = async () => {
    setBulkBusy(true)
    for (const g of unusedGroups) {
      if (!reviewSel.has(g.name)) continue
      for (const v of g.variants) {
        if (!v.active || v.toolId !== 'claude') continue
        try {
          await invoke('set_skill_active', { agentId: v.toolId, skillName: v.name, skillPath: v.path, sourceId: v.sourceId, active: false })
          capture('skill_toggled', { tool_id: v.toolId, skill_name: v.name, active: false })
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
          await invoke('remove_skill', { agentId: v.toolId, skillName: v.name, skillPath: v.path })
          capture('skill_deleted', { tool_id: v.toolId, skill_name: v.name })
        } catch (e) { captureException(e) }
      }
    }
    setReviewSel(new Set())
    setBulkDeleteConfirm(false)
    setBulkBusy(false)
    await onInstalled?.()
  }

  const totalSkills = groups.length
  const totalInstances = groups.reduce((n, g) => n + g.variants.length, 0)
  const isFiltered = filtered.length !== totalSkills
  const countLabel = isFiltered
    ? `${filtered.length} of ${totalSkills} skills`
    : `${totalSkills} skills · ${totalInstances} installs`

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)]">
      {/* ACTIONS row — changes state; amber left rail + bolt mark it as such */}
      <div className="border-l-2 border-l-amber-500/60 border-b border-[var(--c-border)] flex-shrink-0 flex items-center gap-2 px-3 py-1.5 flex-wrap">
        <ZoneLabel kind="actions" />
        <span className="flex-1" />
        {onAddSkill && (
          <button
            onClick={onAddSkill}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md border border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10 transition-colors font-semibold flex-shrink-0 ${compact ? 'text-[12px]' : 'text-[13px]'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className="w-3 h-3">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add skill
          </button>
        )}
        <BulkToggleBar variant="inline" noun="skill" agentName={agentName} describeBulk={describeBulk} applyBulk={applyBulk} />
      </div>

      {/* FILTER band — narrows what the list shows */}
      <div className="bg-[var(--c-accent)]/[0.04] border-b border-[var(--c-border)] flex-shrink-0">
        <div className="px-3 pt-1.5 pb-1"><ZoneLabel kind="filter" /></div>
        <div className="px-3 pb-1.5">
          <SearchInput value={query} onChange={setQuery} placeholder="Search skills…" accentColor="indigo" />
        </div>
        <div className="flex items-center justify-between gap-2 px-3 pb-2 flex-wrap">
          {installedAgents.length >= AGENT_SELECTOR_DROPDOWN_THRESHOLD ? (
            <AgentMultiSelect
              installedAgents={installedAgents}
              selectedTools={selectedTools}
              allSelected={allSelected}
              onToggle={toggleToolCheckbox}
              onSelectAll={selectAll}
              counts={agentSkillCounts}
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
              ? `Reviewing ${unusedGroups.length} Claude Code skill${unusedGroups.length > 1 ? 's' : ''} with no recorded runs in the last 30 days.`
              : `${unusedGroups.length} active Claude Code skill${unusedGroups.length > 1 ? 's' : ''} — no recorded runs in the last 30 days.`}
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
          <span className={`font-semibold uppercase tracking-wider text-[var(--c-text-3)] ${compact ? 'text-[9.5px]' : 'text-[11px]'}`}>Claude Code · no runs in 30 days</span>
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
            {reviewMode ? 'No unused active skills' : query ? 'No skills match' : 'No skills found'}
          </p>
        )}
        {listGroups.map(group => {
          const activeCount = group.variants.filter(v => v.active).length
          const allOff = activeCount === 0
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
                <button onClick={() => onSelectSkill(group.primary)} className="flex-1 min-w-0 text-left">
                  <span className={`block font-medium truncate font-mono ${allOff ? 'text-[var(--c-text-3)]' : 'text-[var(--c-text)]'} ${compact ? 'text-[13px]' : 'text-[14px]'}`}>
                    {group.name}
                  </span>
                  {group.primary.description && (
                    <span className={`block text-[var(--c-text-3)] truncate mt-0.5 ${compact ? 'text-[10.5px]' : 'text-[11.5px]'}`}>
                      {group.primary.description}
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
                    noun="skill"
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
              <span className="flex-1 text-[11.5px] text-rose-400">Delete {reviewSel.size} skill{reviewSel.size === 1 ? '' : 's'} from Claude Code? This removes the file{reviewSel.size === 1 ? '' : 's'} — other agents keep their copy.</span>
              <button disabled={bulkBusy} onClick={deleteSelected} className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-rose-500 text-white hover:opacity-90 disabled:opacity-50">
                {bulkBusy ? 'Deleting…' : 'Confirm delete'}
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
                Delete
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
