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
    <div className="mb-2">
      <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wide px-2 mb-1">
        Skills ({skills.length})
      </p>
      {skills.length === 0 ? (
        <p className="text-xs text-zinc-600 px-2 py-1">No skills detected</p>
      ) : (
        <>
          {visible.map((skill) => (
            <SkillRow key={skill.path} skill={skill} />
          ))}
          {!expanded && hiddenCount > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 transition-colors"
            >
              Show {hiddenCount} more…
            </button>
          )}
          {expanded && hiddenCount > 0 && (
            <button
              onClick={() => setExpanded(false)}
              className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 transition-colors"
            >
              Show less
            </button>
          )}
        </>
      )}
    </div>
  );
}
