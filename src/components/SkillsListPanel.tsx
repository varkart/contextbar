import type { AiTool, Skill } from '../types'

interface SkillsListPanelProps {
  tool: AiTool
  onBack: () => void
  onSelectSkill: (skill: Skill) => void
  query?: string
}

export default function SkillsListPanel({ tool, onBack, onSelectSkill, query }: SkillsListPanelProps) {
  const skills = query
    ? tool.skills.filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
    : tool.skills

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--c-border)] flex-shrink-0">
        <button
          onClick={onBack}
          className="text-[var(--c-text-2)] hover:text-[var(--c-text)] transition-colors p-0.5 -ml-0.5 rounded"
          aria-label="Back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="w-3.5 h-3.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <button
          onClick={onBack}
          className="text-[13px] text-[var(--c-text-3)] truncate max-w-[80px] hover:text-[var(--c-text-2)] transition-colors"
        >
          {tool.name}
        </button>
        <span className="text-[12px] text-[var(--c-text-3)]">›</span>
        <span className="text-[15px] font-semibold text-[var(--c-text)] tracking-[-0.01em]">Skills</span>
        <span className="ml-auto text-[12px] text-[var(--c-text-3)] tabular-nums flex-shrink-0">{skills.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {skills.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-[var(--c-text-3)]">No skills</p>
        ) : (
          skills.map(skill => (
            <button
              key={skill.path}
              onClick={() => onSelectSkill(skill)}
              className={`group w-full flex items-center gap-2 py-[3px] pl-[18px] pr-2 border-l-2 border-transparent hover:border-indigo-400/50 hover:bg-[var(--c-hover)] hover:translate-x-[1px] transition-all duration-150 ease-out text-left ${!skill.active ? 'opacity-40' : ''}`}
            >
              <span className="w-[3px] h-[3px] rounded-full bg-indigo-400/60 flex-shrink-0" aria-hidden="true" />
              <span className="text-[14px] font-mono text-[var(--c-text-2)] truncate flex-1 leading-5">{skill.name}</span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="w-3 h-3 text-[var(--c-text-3)] flex-shrink-0">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
