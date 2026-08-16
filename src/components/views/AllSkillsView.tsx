import { useState, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { Agent, Skill } from '../../types'
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
  onSelectSkill: (skill: Skill) => void
  onAddSkill?: () => void
  /** Refreshes agent data after a toggle write — required to reflect the change. */
  onInstalled?: () => Promise<void>
  /** Popover (small window): render agents as a hover-to-expand pill instead of always-visible chips. */
  compact?: boolean
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

type SortMode = 'name' | 'enabled'

/** Fully-enabled groups first, partially-enabled next, fully-disabled last;
 *  alphabetical within each tier. */
function enabledRank(g: SkillGroup): number {
  const activeCount = g.variants.filter(v => v.active).length
  if (activeCount === 0) return 2
  if (activeCount === g.variants.length) return 0
  return 1
}

export default function AllSkillsView({ agents, onSelectSkill, onAddSkill, onInstalled, compact }: Props) {
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('name')
  const [togglingKey, setTogglingKey] = useState<{ name: string; toolId: string } | null>(null)
  const { installedAgents, selectedTools, toggleTool, allSelected } = useAgentFilter(agents)
  const groups = useMemo(() => buildGroups(agents), [agents])

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
    return result
  }, [groups, query, selectedTools, allSelected])

  const sorted = useMemo(() => {
    if (sortMode === 'name') return filtered
    return [...filtered].sort((a, b) => enabledRank(a) - enabledRank(b) || a.name.localeCompare(b.name))
  }, [filtered, sortMode])

  const totalSkills = groups.length
  const totalInstances = groups.reduce((n, g) => n + g.variants.length, 0)
  const isFiltered = filtered.length !== totalSkills
  const countLabel = isFiltered
    ? `${filtered.length} of ${totalSkills} skills`
    : `${totalSkills} skills · ${totalInstances} installs`

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--c-border)] flex-shrink-0">
        <div className="flex-1 min-w-0">
          <SearchInput value={query} onChange={setQuery} placeholder="Search skills…" accentColor="indigo" />
        </div>
        {onAddSkill && (
          <button
            onClick={onAddSkill}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10 transition-colors font-semibold flex-shrink-0 ${compact ? 'text-[12px]' : 'text-[13px]'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className="w-3 h-3">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add skill
          </button>
        )}
      </div>

      <AgentChips installedAgents={installedAgents} selectedTools={selectedTools} onToggle={toggleTool} />

      <BulkToggleBar noun="skill" agentName={agentName} describeBulk={describeBulk} applyBulk={applyBulk} />

      <div className="flex items-center px-4 py-1.5 border-b border-[var(--c-border-sub)] flex-shrink-0">
        <button
          onClick={() => setSortMode(m => m === 'name' ? 'enabled' : 'name')}
          title={sortMode === 'name' ? 'Sorted by name — click to sort by enabled status' : 'Sorted by enabled status — click to sort by name'}
          className={`flex-1 flex items-center gap-1 font-semibold uppercase tracking-wider text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors ${compact ? 'text-[9.5px]' : 'text-[11px]'}`}
        >
          {sortMode === 'name' ? 'Name' : 'Enabled first'}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="w-2.5 h-2.5 flex-shrink-0">
            <polyline points="8 9 12 5 16 9"/><polyline points="16 15 12 19 8 15"/>
          </svg>
        </button>
        <span className={`font-semibold uppercase tracking-wider text-[var(--c-text-3)] ${compact ? 'text-[9.5px]' : 'text-[11px]'}`}>Agents</span>
        <span className="w-[18px]" />
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className={`text-[var(--c-text-3)] px-4 py-6 text-center ${compact ? 'text-[13px]' : 'text-[14px]'}`}>
            {query ? 'No skills match' : 'No skills found'}
          </p>
        )}
        {sorted.map(group => {
          const activeCount = group.variants.filter(v => v.active).length
          const allOff = activeCount === 0
          return (
            <div
              key={group.name}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-[var(--c-hover)] transition-colors border-b border-[var(--c-border-sub)] last:border-0"
            >
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
