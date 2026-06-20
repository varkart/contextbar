import { useState, useMemo } from 'react'
import type { AiTool, Skill } from '../../types'
import { TOOL_COLORS } from '../../constants/toolColors'

interface Props {
  tools: AiTool[]
  onBack: () => void
  onSelectSkill: (skill: Skill) => void
}

interface SkillGroup {
  name: string
  primary: Skill           // first installed variant, used as representative
  variants: Skill[]        // all instances across tools (with toolId/toolName set)
  hasVariants: boolean     // true when hashes differ across tools
}

function buildGroups(tools: AiTool[]): SkillGroup[] {
  const map = new Map<string, Skill[]>()
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
    const hashes = new Set(variants.map(v => v.contentHash).filter(Boolean))
    const hasVariants = hashes.size > 1
    groups.push({ name: primary.name, primary, variants, hasVariants })
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

export default function AllSkillsView({ tools, onSelectSkill }: Props) {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => buildGroups(tools), [tools])

  const filtered = query.trim()
    ? groups.filter(g =>
        g.name.toLowerCase().includes(query.toLowerCase()) ||
        g.primary.description?.toLowerCase().includes(query.toLowerCase())
      )
    : groups

  const totalSkills = groups.length
  const totalInstances = groups.reduce((n, g) => n + g.variants.length, 0)

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)]">
      <div className="flex items-center justify-end px-4 py-2 border-b border-[var(--c-border)] flex-shrink-0">
        <span className="text-[12px] text-[var(--c-text-3)]">
          {totalSkills} unique · {totalInstances} installed
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
            placeholder="Search skills…"
            className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-md pl-8 pr-3 py-1.5 text-[13px] text-[var(--c-text)] placeholder:text-[var(--c-text-3)] focus:outline-none focus:border-indigo-500/50"
          />
        </div>
      </div>

      {/* List */}
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
            className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-[var(--c-hover)] transition-colors border-b border-[var(--c-border-sub)] last:border-0"
          >
            {/* tool dots column */}
            <div className="flex flex-col gap-0.5 mt-0.5 flex-shrink-0">
              {group.variants.map(v => (
                <ToolDot key={v.toolId + v.path} toolId={v.toolId!} />
              ))}
            </div>

            {/* name + desc */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] font-medium text-[var(--c-text)] truncate font-mono">
                  {group.name}
                </span>
                {group.hasVariants && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 flex-shrink-0">
                    {group.variants.length} variants
                  </span>
                )}
              </div>
              {group.primary.description && (
                <p className="text-[12px] text-[var(--c-text-3)] leading-relaxed mt-0.5 line-clamp-2">
                  {group.primary.description}
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
