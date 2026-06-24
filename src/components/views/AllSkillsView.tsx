import { useMemo } from 'react'
import type { AiTool, Skill } from '../../types'
import ToolDot from '../ToolDot'
import ProviderChips from '../ProviderChips'
import SearchInput from '../SearchInput'
import { useProviderFilter } from '../../hooks/useProviderFilter'

interface Props {
  tools: AiTool[]
  onBack: () => void
  onSelectSkill: (skill: Skill) => void
  query: string
  setQuery: (q: string) => void
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

function buildGroups(tools: AiTool[]): SkillGroup[] {
  const map = new Map<string, SkillVariant[]>()
  for (const tool of tools) {
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

export default function AllSkillsView({ tools, onSelectSkill, query = '', setQuery = () => {} }: Props) {
  const { installedTools, selectedTools, toggleTool, allSelected } = useProviderFilter(tools)
  const groups = useMemo(() => buildGroups(tools), [tools])

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
      <div className="flex items-center justify-end px-4 py-2 border-b border-[var(--c-border)] flex-shrink-0">
        <span className="text-[12px] text-[var(--c-text-3)]">{countLabel}</span>
      </div>

      <div className="px-3 py-2 border-b border-[var(--c-border)] flex-shrink-0">
        <SearchInput value={query} onChange={setQuery} placeholder="Search skills…" accentColor="indigo" />
      </div>

      <ProviderChips installedTools={installedTools} selectedTools={selectedTools} onToggle={toggleTool} />

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-[13px] text-[var(--c-text-3)] px-4 py-6 text-center">
            {query ? 'No skills match' : 'No skills found'}
          </p>
        )}
        {filtered.map(group => (
          <button
            key={group.name}
            onClick={() => onSelectSkill(group.primary)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--c-hover)] transition-colors border-b border-[var(--c-border-sub)] last:border-0"
          >
            <div className="flex-1 min-w-0">
              <span className="text-[14px] font-medium text-[var(--c-text)] truncate font-mono block">
                {group.name}
              </span>
              {group.primary.description && (
                <p className="text-[12px] text-[var(--c-text-3)] leading-relaxed mt-0.5 line-clamp-1">
                  {group.primary.description}
                </p>
              )}
              <div className="flex gap-1 mt-1">
                {group.variants.map(v => (
                  <ToolDot key={v.toolId + v.path} toolId={v.toolId} toolName={v.toolName} />
                ))}
              </div>
            </div>

            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className="w-3 h-3 text-[var(--c-text-3)] flex-shrink-0">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}
