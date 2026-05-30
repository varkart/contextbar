import Tooltip from './Tooltip';
import type { Skill } from '../types';

interface SkillRowProps {
  skill: Skill;
}

function SkillTooltipContent({ skill }: { skill: Skill }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold text-zinc-200">{skill.name}</p>
      {skill.description && (
        <p className="text-[11px] text-zinc-400 leading-relaxed">{skill.description}</p>
      )}
      <p className="text-[10px] text-zinc-600 font-mono break-all leading-relaxed">
        {skill.path}
      </p>
    </div>
  );
}

export default function SkillRow({ skill }: SkillRowProps) {
  return (
    <Tooltip content={<SkillTooltipContent skill={skill} />}>
      <div className="flex items-center gap-2 py-[3px] px-2 rounded-sm hover:bg-white/[0.03] w-full cursor-default transition-colors">
        <span className="w-[3px] h-[3px] rounded-full bg-indigo-500/50 flex-shrink-0" aria-hidden="true" />
        <span className="text-[12px] text-zinc-400 truncate leading-5">{skill.name}</span>
      </div>
    </Tooltip>
  );
}
