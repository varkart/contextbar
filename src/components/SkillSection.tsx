import { useState } from 'react';
import SkillRow from './SkillRow';
import type { Skill } from '../types';

const INITIAL_LIMIT = 5;

interface SkillSectionProps {
  skills: Skill[];
  query?: string;
  matchedPaths?: Set<string>;
}

export default function SkillSection({ skills, query, matchedPaths }: SkillSectionProps) {
  const [expanded, setExpanded] = useState(false);

  // When filtering by matchedPaths, only show matched skills
  const filtered = matchedPaths && matchedPaths.size > 0
    ? skills.filter(s => matchedPaths.has(s.path))
    : skills;

  const visible = (query || expanded) ? filtered : filtered.slice(0, INITIAL_LIMIT);
  const hiddenCount = filtered.length - INITIAL_LIMIT;

  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 mb-0.5">
        <span className="text-[11px] text-zinc-600 font-medium">Skills</span>
        <span className="text-[11px] text-zinc-700">{filtered.length}</span>
      </div>
      {filtered.length === 0 ? (
        <p className="text-[11px] text-zinc-700 px-2 py-1 italic">None detected</p>
      ) : (
        <>
          {visible.map((skill) => (
            <SkillRow key={skill.path} skill={skill} query={query} />
          ))}
          {!query && !expanded && hiddenCount > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="text-[11px] text-zinc-700 hover:text-zinc-500 px-2 py-[3px] transition-colors leading-5"
            >
              +{hiddenCount} more
            </button>
          )}
          {!query && expanded && hiddenCount > 0 && (
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
