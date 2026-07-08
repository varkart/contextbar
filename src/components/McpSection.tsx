import { useState, useRef, useEffect } from 'react';
import McpRow from './McpRow';
import type { McpServer } from '../types';

const INITIAL_LIMIT = 5;

const SOURCE_CATEGORY: Record<string, string> = {
  enterprise_managed: 'Enterprise',
  enterprise_managed_user: 'Enterprise',
  plugins: 'Plugin',
  marketplace_plugins: 'Marketplace',
  plugins_native: 'Plugin',
  extensions: 'Plugin',
  settings_json: 'User',
  dotfile: 'Project',
  global_mcp_config: 'User',
  mcp_list: 'Cloud',
};

const CATEGORY_ORDER = ['Enterprise', 'Plugin', 'Marketplace', 'User', 'Project', 'Cloud', 'Other'];

function getCategory(sourceId: string): string {
  return SOURCE_CATEGORY[sourceId] ?? 'Other';
}

interface McpSectionProps {
  mcps: McpServer[];
  query?: string;
  matchedNames?: Set<string>;
  onSelectMcp?: (mcp: McpServer) => void;
  onOpenPage?: () => void;
  onAddMcp?: () => void;
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

interface McpCategoryGroupProps {
  label: string;
  mcps: McpServer[];
  query?: string;
  onSelectMcp?: (mcp: McpServer) => void;
}

function McpCategoryGroup({ label, mcps, query, onSelectMcp }: McpCategoryGroupProps) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 w-full text-left px-3 py-1 hover:opacity-80 transition-opacity"
        aria-expanded={open}
      >
        <span className="text-violet-400/50"><ChevronIcon open={open} /></span>
        <span className="text-[11px] font-semibold text-violet-400/70 uppercase tracking-wide">{label}</span>
        <span className="text-[11px] text-violet-400/40">{mcps.length}</span>
      </button>
      {open && mcps.map((mcp) => (
        <McpRow
          key={mcp.name}
          mcp={mcp}
          query={query}
          onSelect={onSelectMcp ? () => onSelectMcp(mcp) : undefined}
        />
      ))}
    </div>
  );
}

export default function McpSection({ mcps, query, matchedNames, onSelectMcp, onOpenPage, onAddMcp, onOpenExplainer }: McpSectionProps) {
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

  const filtered = matchedNames && matchedNames.size > 0
    ? mcps.filter(m => matchedNames.has(m.name))
    : mcps;

  // Group by category — only used when no active search query
  const categoryGroups = (() => {
    const groups = new Map<string, McpServer[]>();
    for (const mcp of filtered) {
      const cat = getCategory(mcp.sourceId);
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(mcp);
    }
    return groups;
  })();

  const useGrouped = !query && categoryGroups.size > 1;

  const visible = (query || listExpanded) ? filtered : filtered.slice(0, INITIAL_LIMIT);
  const hiddenCount = filtered.length - INITIAL_LIMIT;

  const orderedCategories = CATEGORY_ORDER.filter(c => categoryGroups.has(c));

  return (
    <div>
      <div className="flex items-center px-2 mb-0.5">
        <button
          onClick={() => setSectionOpen(v => !v)}
          className="flex items-center gap-1 flex-1 text-left hover:opacity-80 transition-opacity"
          aria-expanded={sectionOpen}
        >
          <span className="text-violet-400/70"><ChevronIcon open={sectionOpen} /></span>
          <span className="text-[13px] font-semibold text-violet-500">MCPs</span>
          <span className="text-[13px] text-violet-400/60">{filtered.length}</span>
        </button>
        {/* ? tooltip */}
        <div className="relative mr-1" ref={tooltipRef}>
          <button
            onClick={() => onOpenExplainer ? onOpenExplainer() : setTooltipOpen(v => !v)}
            aria-label="What are MCP servers?"
            className={`w-[14px] h-[14px] rounded-full border text-[9px] font-bold flex items-center justify-center transition-colors ${tooltipOpen ? 'bg-violet-500/15 border-violet-500/40 text-violet-400' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:border-violet-500/30 hover:text-violet-400'}`}
          >
            ?
          </button>
          {tooltipOpen && (
            <div className="absolute right-0 top-[-4px] w-[220px] bg-[var(--c-surface)] border border-[var(--c-border)] rounded-[10px] p-3 z-30 shadow-lg animate-tooltip-in">
              <div className="absolute right-[-5px] top-[10px] w-2 h-2 bg-[var(--c-surface)] border-r border-t border-[var(--c-border)] rotate-45" />
              <p className="text-[12px] font-semibold text-[var(--c-text)] mb-1.5">MCP Servers</p>
              <p className="text-[11px] text-[var(--c-text-2)] leading-relaxed">
                Tool plugins that extend what your agent can do — connect it to databases, APIs, file systems, and more.
                Uses the open Model Context Protocol standard.
              </p>
            </div>
          )}
        </div>
        {onOpenPage && (
          <button
            onClick={onOpenPage}
            aria-label="Open MCPs page"
            className="text-violet-400/50 hover:text-violet-400 transition-colors p-0.5"
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
              <div className="w-6 h-6 rounded-[6px] bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2"/>
                  <path d="M8 21h8M12 17v4"/>
                </svg>
              </div>
              <span className="text-[12px] font-semibold text-[var(--c-text)]">No MCP servers yet</span>
            </div>
            <p className="text-[11px] text-[var(--c-text-2)] leading-relaxed mb-2.5">
              MCPs connect your agent to external tools via a standard protocol — databases, APIs, file browsers, and more.
            </p>
            <div className="flex items-center gap-2">
              {onAddMcp && (
                <button
                  onClick={onAddMcp}
                  className="text-[11px] font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-[5px] px-2.5 py-1 hover:bg-violet-500/20 transition-colors"
                >
                  Add MCP
                </button>
              )}
              {onOpenPage && (
                <button
                  onClick={onOpenPage}
                  className="text-[11px] font-medium text-[var(--c-text-3)] border border-[var(--c-border)] rounded-[5px] px-2.5 py-1 hover:text-[var(--c-text-2)] transition-colors"
                >
                  Browse servers
                </button>
              )}
            </div>
          </div>
        ) : useGrouped ? (
          <>
            {orderedCategories.map(cat => (
              <McpCategoryGroup
                key={cat}
                label={cat}
                mcps={categoryGroups.get(cat)!}
                query={query}
                onSelectMcp={onSelectMcp}
              />
            ))}
          </>
        ) : (
          <>
            {visible.map((mcp) => (
              <McpRow
                key={mcp.name}
                mcp={mcp}
                query={query}
                onSelect={onSelectMcp ? () => onSelectMcp(mcp) : undefined}
              />
            ))}
            {!query && hiddenCount > 0 && (
              <button
                onClick={() => setListExpanded(v => !v)}
                className="w-full text-left px-3 py-1 text-[12px] text-violet-400/60 hover:text-violet-400 transition-colors"
              >
                {listExpanded ? 'Show less' : `+${hiddenCount} more`}
              </button>
            )}
          </>
        )
      )}
    </div>
  );
}
