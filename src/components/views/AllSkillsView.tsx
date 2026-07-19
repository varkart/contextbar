import { useState, useMemo } from 'react'
import type { Agent, Skill } from '../../types'
import AgentDot from '../AgentDot'
import AgentChips from '../AgentChips'
import SearchInput from '../SearchInput'
import { useAgentFilter } from '../../hooks/useAgentFilter'

interface Props {
  agents: Agent[]
  onBack: () => void
  onSelectSkill: (skill: Skill) => void
  onAddSkill?: () => void
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

export default function AllSkillsView({ agents, onSelectSkill, onAddSkill }: Props) {
  const [query, setQuery] = useState('')
  const { installedAgents, selectedTools, toggleTool, allSelected } = useAgentFilter(agents)
  const groups = useMemo(() => buildGroups(agents), [agents])

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
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-indigo-500 text-white hover:bg-indigo-400 transition-colors text-[12px] font-semibold flex-shrink-0 shadow-sm"
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

      <div className="flex items-center px-4 py-1.5 border-b border-[var(--c-border-sub)] flex-shrink-0">
        <span className="flex-1 text-[9.5px] font-semibold uppercase tracking-wider text-[var(--c-text-3)]">Name</span>
        <span className="w-[72px] text-[9.5px] font-semibold uppercase tracking-wider text-[var(--c-text-3)]">Agents</span>
        <span className="w-[52px] text-right text-[9.5px] font-semibold uppercase tracking-wider text-[var(--c-text-3)]">Active</span>
        <span className="w-[18px]" />
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-[13px] text-[var(--c-text-3)] px-4 py-6 text-center">
            {query ? 'No skills match' : 'No skills found'}
          </p>
        )}
        {filtered.map(group => {
          const activeCount = group.variants.filter(v => v.active).length
          const allOff = activeCount === 0
          return (
            <button
              key={group.name}
              onClick={() => onSelectSkill(group.primary)}
              title={group.primary.description}
              className="w-full flex items-center px-4 py-2 text-left hover:bg-[var(--c-hover)] transition-colors border-b border-[var(--c-border-sub)] last:border-0"
            >
              <span className={`flex-1 min-w-0 text-[13px] font-medium truncate font-mono ${allOff ? 'text-[var(--c-text-3)]' : 'text-[var(--c-text)]'}`}>
                {group.name}
              </span>
              <span className={`w-[72px] flex gap-1 ${allOff ? 'opacity-50' : ''}`}>
                {group.variants.map(v => (
                  <AgentDot key={v.toolId + v.path} toolId={v.toolId} toolName={v.toolName} />
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
