import { useState } from 'react';
import SkillRow from './SkillRow';
import type { Skill } from '../types';

const INITIAL_LIMIT = 5;

interface SkillSectionProps {
  skills: Skill[];
  query?: string;
  matchedPaths?: Set<string>;
  onSelectSkill?: (skill: Skill) => void;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className={`w-2.5 h-2.5 transition-transform duration-150 ${open ? 'rotate-90' : 'rotate-0'}`}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default function SkillSection({ skills, query, matchedPaths, onSelectSkill }: SkillSectionProps) {
  const [sectionOpen, setSectionOpen] = useState(true);
  const [listExpanded, setListExpanded] = useState(false);

  const filtered = matchedPaths && matchedPaths.size > 0
    ? skills.filter(s => matchedPaths.has(s.path))
    : skills;

  const visible = (query || listExpanded) ? filtered : filtered.slice(0, INITIAL_LIMIT);
  const hiddenCount = filtered.length - INITIAL_LIMIT;

  return (
    <div>
      <button
        onClick={() => setSectionOpen(v => !v)}
        className="flex items-center gap-1 px-2 mb-0.5 w-full text-left hover:opacity-80 transition-opacity"
        aria-expanded={sectionOpen}
      >
        <span className="text-indigo-400/70"><ChevronIcon open={sectionOpen} /></span>
        <span className="text-[13px] font-semibold text-indigo-500">Skills</span>
        <span className="text-[13px] text-indigo-400/60">{filtered.length}</span>
      </button>

      {sectionOpen && (
        filtered.length === 0 ? (
          <p className="text-[13px] text-zinc-700 px-2 py-1 italic">None detected</p>
        ) : (
          <>
            {visible.map((skill) => (
              <SkillRow
                key={skill.path}
                skill={skill}
                query={query}
                onSelect={onSelectSkill ? () => onSelectSkill(skill) : undefined}
              />
            ))}
            {!query && !listExpanded && hiddenCount > 0 && (
              <button
                onClick={() => setListExpanded(true)}
                className="text-[13px] text-zinc-700 hover:text-zinc-500 pl-5 pr-2 py-[3px] transition-colors leading-5"
              >
                +{hiddenCount} more
              </button>
            )}
            {!query && listExpanded && hiddenCount > 0 && (
              <button
                onClick={() => setListExpanded(false)}
                className="text-[13px] text-zinc-700 hover:text-zinc-500 pl-5 pr-2 py-[3px] transition-colors leading-5"
              >
                Show less
              </button>
            )}
          </>
        )
      )}
    </div>
  );
}
