import Tooltip from './Tooltip';
import type { Skill } from '../types';

interface SkillRowProps {
  skill: Skill;
}

function SkillTooltipContent({ skill }: { skill: Skill }) {
  return (
    <div className="space-y-1">
      <p className="font-medium text-zinc-100">{skill.name}</p>
      {skill.description && <p className="text-zinc-300">{skill.description}</p>}
      <p className="text-zinc-400 break-all">{skill.path}</p>
    </div>
  );
}

export default function SkillRow({ skill }: SkillRowProps) {
  return (
    <Tooltip content={<SkillTooltipContent skill={skill} />}>
      <div className="flex items-center gap-2 py-1 px-2 rounded hover:bg-zinc-800/50 w-full cursor-default">
        <span className="text-xs text-zinc-200 truncate max-w-[180px]">{skill.name}</span>
        {skill.active && (
          <span className="ml-auto flex-shrink-0 text-[10px] bg-green-500/20 text-green-400 border border-green-500/30 rounded-full px-1.5 py-0.5 leading-none">
            active
          </span>
        )}
      </div>
    </Tooltip>
  );
}
