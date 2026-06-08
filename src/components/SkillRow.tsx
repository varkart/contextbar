import Tooltip from './Tooltip';
import Highlight from './Highlight';
import type { Skill } from '../types';

interface SkillRowProps {
  skill: Skill;
  query?: string;
  onSelect?: () => void;
  onToggle?: (active: boolean) => void;
  toggling?: boolean;
}

function SkillTooltipContent({ skill }: { skill: Skill }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold">{skill.name}</p>
      {skill.description && (
        <p className="text-[11px] opacity-70 leading-relaxed">{skill.description}</p>
      )}
      <p className="text-[10px] opacity-50 font-mono break-all leading-relaxed">{skill.path}</p>
    </div>
  );
}

function Toggle({ active, toggling, onChange }: { active: boolean; toggling: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); if (!toggling) onChange(!active); }}
      disabled={toggling}
      aria-label={active ? 'Disable skill' : 'Enable skill'}
      className={`relative flex-shrink-0 w-7 h-4 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-40 ${
        active ? 'bg-indigo-500' : 'bg-[var(--c-border)]'
      }`}
    >
      <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform duration-200 ${
        active ? 'translate-x-3' : 'translate-x-0'
      }`} />
    </button>
  );
}

export default function SkillRow({ skill, query = '', onSelect, onToggle, toggling = false }: SkillRowProps) {
  return (
    <Tooltip content={<SkillTooltipContent skill={skill} />}>
      <div
        onClick={onSelect}
        className={`group flex items-center gap-2 py-[3px] pl-[18px] pr-2 rounded-sm w-full border-l-2 border-transparent hover:border-indigo-400/50 hover:bg-[var(--c-hover)] hover:translate-x-[1px] transition-all duration-150 ease-out ${onSelect ? 'cursor-pointer' : 'cursor-default'} ${!skill.active ? 'opacity-40' : ''}`}
      >
        <span className="w-[3px] h-[3px] rounded-full bg-indigo-400/60 flex-shrink-0" aria-hidden="true" />
        <Highlight text={skill.name} query={query} className="text-[12px] font-mono text-[var(--c-text-2)] truncate leading-5" />
        <span className="flex-1" />
        {onToggle ? (
          <Toggle active={skill.active} toggling={toggling} onChange={onToggle} />
        ) : onSelect ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="w-3 h-3 text-[var(--c-text-3)] opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        ) : null}
      </div>
    </Tooltip>
  );
}
