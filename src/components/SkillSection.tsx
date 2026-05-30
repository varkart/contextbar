import { useState } from 'react';
import SkillRow from './SkillRow';
import type { Skill } from '../types';

const INITIAL_LIMIT = 5;

interface SkillSectionProps {
  skills: Skill[];
}

export default function SkillSection({ skills }: SkillSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? skills : skills.slice(0, INITIAL_LIMIT);
  const hiddenCount = skills.length - INITIAL_LIMIT;

  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 mb-0.5">
        <span className="text-[11px] text-zinc-600 font-medium">Skills</span>
        <span className="text-[11px] text-zinc-700">{skills.length}</span>
      </div>
      {skills.length === 0 ? (
        <p className="text-[11px] text-zinc-700 px-2 py-1 italic">None detected</p>
      ) : (
        <>
          {visible.map((skill) => (
            <SkillRow key={skill.path} skill={skill} />
          ))}
          {!expanded && hiddenCount > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="text-[11px] text-zinc-700 hover:text-zinc-500 px-2 py-[3px] transition-colors leading-5"
            >
              +{hiddenCount} more
            </button>
          )}
          {expanded && hiddenCount > 0 && (
            <button
              onClick={() => setExpanded(false)}
              className="text-[11px] text-zinc-700 hover:text-zinc-500 px-2 py-[3px] transition-colors leading-5"
            >
              Show less
            </button>
          )}
        </>
      )}
    </div>
  );
}
