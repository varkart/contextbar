import { useState, useRef, useCallback } from 'react'
import type React from 'react'
import type { Agent, Skill } from '../types'
import { useRovingFocus } from '../useRovingFocus'

interface SkillsListPanelProps {
  agent: Agent
  onBack: () => void
  onSelectSkill: (skill: Skill) => void
  onAddSkill: () => void
}

export default function SkillsListPanel({ agent, onSelectSkill, onAddSkill }: SkillsListPanelProps) {
  const [q, setQ] = useState('')
  const filterInputRef = useRef<HTMLInputElement | null>(null)
  const filtered = q
    ? agent.skills.filter(s => s.name.toLowerCase().includes(q.toLowerCase()))
    : agent.skills

  const { getItemProps, setFocusedIndex } = useRovingFocus({
    count: filtered.length,
    onSelect: (index) => {
      const skill = filtered[index]
      if (skill) onSelectSkill(skill)
    },
  })

  const handleFilterKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && !e.shiftKey && filtered.length > 0) {
      e.preventDefault()
      setFocusedIndex(0)
      document.querySelector<HTMLElement>('[data-skill-item="0"]')?.focus()
    }
  }, [filtered.length, setFocusedIndex])

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
      <div className="flex items-center justify-end gap-1.5 px-4 py-2 border-b border-[var(--c-border)] flex-shrink-0">
        <span className="text-[12px] text-[var(--c-text-3)] tabular-nums">{filtered.length}</span>
        <button
          onClick={onAddSkill}
          aria-label="Add Skill"
          className="p-0.5 rounded transition-colors text-[var(--c-text-3)] hover:text-indigo-400"
          title="Add Skill"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="w-3.5 h-3.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      <div className="px-3 py-1.5 border-b border-[var(--c-border)] flex-shrink-0">
          <input
            ref={filterInputRef}
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={handleFilterKeyDown}
            placeholder="Filter skills…"
            className="w-full bg-[var(--c-hover)] text-[13px] text-[var(--c-text)] placeholder-[var(--c-text-3)] rounded px-2.5 py-1 outline-none focus:ring-1 focus:ring-indigo-400/40"
          />
        </div>

      <div className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-[var(--c-text-3)]">
            {q ? `No skills matching "${q}"` : 'No skills'}
          </p>
        ) : (
          filtered.map((skill, idx) => {
            const itemProps = getItemProps(idx)
            return (
              <button
                key={skill.path}
                ref={(el) => {
                  itemProps.ref(el)
                  if (el) el.setAttribute('data-skill-item', String(idx))
                }}
                tabIndex={itemProps.tabIndex}
                onKeyDown={itemProps.onKeyDown as React.KeyboardEventHandler<HTMLButtonElement>}
                onFocus={itemProps.onFocus}
                onClick={() => onSelectSkill(skill)}
                className={`group w-full flex items-center gap-2 py-[3px] pl-[18px] pr-2 border-l-2 border-transparent hover:border-indigo-400/50 hover:bg-[var(--c-hover)] focus-visible:border-indigo-400/50 focus-visible:bg-[var(--c-hover)] focus-visible:outline-none hover:translate-x-[1px] focus-visible:translate-x-[1px] transition-all duration-150 ease-out text-left ${!skill.active ? 'opacity-40' : ''}`}
              >
                <span className="w-[3px] h-[3px] rounded-full bg-indigo-400/60 flex-shrink-0" aria-hidden="true" />
                <span className="text-[14px] font-mono text-[var(--c-text-2)] truncate flex-1 leading-5">{skill.name}</span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className="w-3 h-3 text-[var(--c-text-3)] flex-shrink-0">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
