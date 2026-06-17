import Highlight from './Highlight';
import type { Skill } from '../types';

interface SkillRowProps {
  skill: Skill;
  query?: string;
  onSelect?: () => void;
}

export default function SkillRow({ skill, query = '', onSelect }: SkillRowProps) {
  return (
    <div
      onClick={onSelect}
      className={`group flex items-center gap-2 py-[3px] pl-[18px] pr-2 rounded-sm w-full border-l-2 border-transparent hover:border-indigo-400/50 hover:bg-[var(--c-hover)] hover:translate-x-[1px] transition-all duration-150 ease-out ${onSelect ? 'cursor-pointer' : 'cursor-default'} ${!skill.active ? 'opacity-40' : ''}`}
    >
      <span className="w-[3px] h-[3px] rounded-full bg-indigo-400/60 flex-shrink-0" aria-hidden="true" />
      <Highlight text={skill.name} query={query} className="text-[14px] font-mono text-[var(--c-text-2)] truncate leading-5" />
      <span className="flex-1" />
      {onSelect && (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="w-3 h-3 text-[var(--c-text-3)] flex-shrink-0">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      )}
    </div>
  );
}
