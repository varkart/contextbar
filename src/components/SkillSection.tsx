import { useState, useRef, useEffect } from 'react';
import SkillRow from './SkillRow';
import type { Skill } from '../types';

const INITIAL_LIMIT = 5;

interface SkillSectionProps {
  skills: Skill[];
  query?: string;
  matchedPaths?: Set<string>;
  onSelectSkill?: (skill: Skill) => void;
  onOpenPage?: () => void;
  onAddSkill?: () => void;
  onOpenExplainer?: () => void;
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

export default function SkillSection({ skills, query, matchedPaths, onSelectSkill, onOpenPage, onAddSkill, onOpenExplainer }: SkillSectionProps) {
  const [sectionOpen, setSectionOpen] = useState(true);
  const [listExpanded, setListExpanded] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tooltipOpen) return;
    const handler = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setTooltipOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tooltipOpen]);

  const filtered = matchedPaths && matchedPaths.size > 0
    ? skills.filter(s => matchedPaths.has(s.path))
    : skills;

  const visible = (query || listExpanded) ? filtered : filtered.slice(0, INITIAL_LIMIT);
  const hiddenCount = filtered.length - INITIAL_LIMIT;

  return (
    <div>
      <div className="flex items-center px-2 mb-0.5">
        <button
          onClick={() => setSectionOpen(v => !v)}
          className="flex items-center gap-1 flex-1 text-left hover:opacity-80 transition-opacity"
          aria-expanded={sectionOpen}
        >
          <span className="text-indigo-400/70"><ChevronIcon open={sectionOpen} /></span>
          <span className="text-[13px] font-semibold text-indigo-500">Skills</span>
          <span className="text-[13px] text-indigo-400/60">{filtered.length}</span>
        </button>
        {/* ? tooltip */}
        <div className="relative mr-1" ref={tooltipRef}>
          <button
            onClick={() => onOpenExplainer ? onOpenExplainer() : setTooltipOpen(v => !v)}
            aria-label="What are skills?"
            className={`w-[14px] h-[14px] rounded-full border text-[9px] font-bold flex items-center justify-center transition-colors ${tooltipOpen ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-400' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:border-indigo-500/30 hover:text-indigo-400'}`}
          >
            ?
          </button>
          {tooltipOpen && (
            <div className="absolute right-0 top-[-4px] w-[220px] bg-[var(--c-surface)] border border-[var(--c-border)] rounded-[10px] p-3 z-30 shadow-lg animate-tooltip-in">
              <div className="absolute right-[-5px] top-[10px] w-2 h-2 bg-[var(--c-surface)] border-r border-t border-[var(--c-border)] rotate-45" />
              <p className="text-[12px] font-semibold text-[var(--c-text)] mb-1.5">Skills</p>
              <p className="text-[11px] text-[var(--c-text-2)] leading-relaxed">
                Markdown files your agent reads as standing instructions — persona, rules, project context.
                Toggle per-agent. Disable without deleting.
              </p>
            </div>
          )}
        </div>
        {onOpenPage && (
          <button
            onClick={onOpenPage}
            aria-label="Open skills page"
            className="text-indigo-400/50 hover:text-indigo-400 transition-colors p-0.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="w-3 h-3">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </button>
        )}
      </div>

      {sectionOpen && (
        filtered.length === 0 ? (
          <div className="mx-2 my-1 border border-[var(--c-border)] rounded-[9px] p-3 bg-[var(--c-surface)]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-[6px] bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                  <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
              </div>
              <span className="text-[12px] font-semibold text-[var(--c-text)]">No skills yet</span>
            </div>
            <p className="text-[11px] text-[var(--c-text-2)] leading-relaxed mb-2.5">
              Skills are markdown files that give your agent standing instructions — like a handbook it always consults.
            </p>
            <div className="flex items-center gap-2">
              {onAddSkill && (
                <button
                  onClick={onAddSkill}
                  className="text-[11px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-[5px] px-2.5 py-1 hover:bg-indigo-500/20 transition-colors"
                >
                  Add first skill
                </button>
              )}
              {onOpenPage && (
                <button
                  onClick={onOpenPage}
                  className="text-[11px] font-medium text-[var(--c-text-3)] border border-[var(--c-border)] rounded-[5px] px-2.5 py-1 hover:text-[var(--c-text-2)] transition-colors"
                >
                  Browse skills
                </button>
              )}
            </div>
          </div>
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
