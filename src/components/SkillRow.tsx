import Tooltip from './Tooltip';
import Highlight from './Highlight';
import type { Skill } from '../types';

interface SkillRowProps {
  skill: Skill;
  query?: string;
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

export default function SkillRow({ skill, query = '' }: SkillRowProps) {
  return (
    <Tooltip content={<SkillTooltipContent skill={skill} />}>
      <div className="flex items-center gap-2 py-[3px] px-2 rounded-sm hover:bg-[var(--c-hover)] w-full cursor-default transition-colors">
        <span className="w-[3px] h-[3px] rounded-full bg-indigo-400/60 flex-shrink-0" aria-hidden="true" />
        <Highlight text={skill.name} query={query} className="text-[12px] text-[var(--c-text-2)] truncate leading-5" />
      </div>
    </Tooltip>
  );
}
