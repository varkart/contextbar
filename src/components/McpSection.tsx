import { useState } from 'react';
import McpRow from './McpRow';
import type { McpServer } from '../types';

interface McpSectionProps {
  mcps: McpServer[];
  query?: string;
  matchedNames?: Set<string>;
  onSelectMcp?: (mcp: McpServer) => void;
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

export default function McpSection({ mcps, query, matchedNames, onSelectMcp }: McpSectionProps) {
  const [sectionOpen, setSectionOpen] = useState(true);

  const filtered = matchedNames && matchedNames.size > 0
    ? mcps.filter(m => matchedNames.has(m.name))
    : mcps;

  return (
    <div>
      <button
        onClick={() => setSectionOpen(v => !v)}
        className="flex items-center gap-1 px-2 mb-0.5 w-full text-left hover:opacity-80 transition-opacity"
        aria-expanded={sectionOpen}
      >
        <span className="text-violet-400/70"><ChevronIcon open={sectionOpen} /></span>
        <span className="text-[13px] font-semibold text-violet-500">MCPs</span>
        <span className="text-[13px] text-violet-400/60">{filtered.length}</span>
      </button>

      {sectionOpen && (
        filtered.length === 0 ? (
          <p className="text-[13px] text-zinc-700 px-2 py-1 italic">None detected</p>
        ) : (
          filtered.map((mcp) => (
            <McpRow
              key={mcp.name}
              mcp={mcp}
              query={query}
              onSelect={onSelectMcp ? () => onSelectMcp(mcp) : undefined}
            />
          ))
        )
      )}
    </div>
  );
}
