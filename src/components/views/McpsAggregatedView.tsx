import { useState } from 'react';
import type { AiTool, McpServer } from '../../types';
import { TOOL_COLORS } from '../../constants/toolColors';

interface McpsAggregatedViewProps {
  installedTools: AiTool[];
  onBack: () => void;
  onSelectMcp: (mcp: McpServer, tool: AiTool) => void;
}

type Filter = 'all' | 'stdio' | 'http';

function LockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="w-2.5 h-2.5 text-[var(--c-text-3)]"
      aria-label="has env secrets">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export default function McpsAggregatedView({ installedTools, onBack, onSelectMcp }: McpsAggregatedViewProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const toolsWithMcps = installedTools.filter(t => t.mcps.length > 0);
  const totalMcps = installedTools.reduce((n, t) => n + t.mcps.length, 0);

  const filteredGroups = toolsWithMcps.map(tool => {
    const mcps = tool.mcps.filter(m => {
      const matchesQuery = !query || m.name.toLowerCase().includes(query.toLowerCase());
      const isHttp = !m.command || m.command === '';
      const matchesFilter =
        filter === 'all' ? true :
        filter === 'http' ? isHttp :
        !isHttp;
      return matchesQuery && matchesFilter;
    });
    return { tool, mcps };
  }).filter(g => g.mcps.length > 0);

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--c-border)] flex-shrink-0">
        <button
          onClick={onBack}
          className="text-[var(--c-text-2)] hover:text-[var(--c-text)] transition-colors p-0.5 -ml-0.5 rounded"
          aria-label="Back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="w-3.5 h-3.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="text-[13px] text-[var(--c-text-3)]">LLM Manager</span>
        <span className="text-[12px] text-[var(--c-text-3)]">›</span>
        <span className="text-[15px] font-semibold text-[var(--c-text)] tracking-[-0.01em]">MCPs</span>
        <span className="ml-auto text-[12px] text-[var(--c-text-3)] tabular-nums flex-shrink-0">{totalMcps}</span>
      </div>

      <div className="px-3 py-2 border-b border-[var(--c-border)] flex-shrink-0 space-y-2">
        <div className="relative flex items-center">
          <svg className="absolute left-2 w-3 h-3 text-[var(--c-text-3)] pointer-events-none"
            xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search MCPs…"
            className="w-full bg-[var(--c-input)] border border-[var(--c-border)] rounded-md pl-7 pr-7 py-1.5 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none focus:border-[var(--c-text-2)] transition-colors"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
              aria-label="Clear search"
            >
              <svg className="w-3 h-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {(['all', 'stdio', 'http'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-0.5 rounded text-[12px] uppercase transition-colors ${
                filter === f
                  ? 'bg-sky-500/20 text-sky-400 font-medium'
                  : 'text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredGroups.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[14px] text-[var(--c-text-3)]">
              {query ? `No MCPs matching "${query}"` : 'No MCPs found'}
            </p>
          </div>
        ) : (
          filteredGroups.map(({ tool, mcps }) => {
            const colors = TOOL_COLORS[tool.id] ?? { bg: 'bg-zinc-500/10', text: 'text-zinc-500' };
            return (
              <div key={tool.id}>
                <div className="flex items-center gap-2 px-4 pt-3 pb-1.5">
                  <span className={`inline-flex items-center justify-center w-[16px] h-[16px] rounded text-[10px] font-bold flex-shrink-0 ${colors.bg} ${colors.text}`}>
                    {tool.name[0].toUpperCase()}
                  </span>
                  <span className="text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider">{tool.name}</span>
                  <span className="text-[11px] text-[var(--c-text-3)] tabular-nums">{mcps.length}</span>
                </div>
                {mcps.map(mcp => {
                  const isHttp = !mcp.command || mcp.command === '';
                  return (
                    <button
                      key={mcp.name}
                      onClick={() => onSelectMcp(mcp, tool)}
                      className={`group w-full flex items-center gap-2 py-[5px] pl-[18px] pr-3 hover:bg-[var(--c-hover)] transition-colors text-left ${!mcp.active ? 'opacity-40' : ''}`}
                    >
                      <span className={`text-[10px] font-mono px-1 py-0.5 rounded flex-shrink-0 ${isHttp ? 'bg-sky-500/15 text-sky-400' : 'bg-zinc-500/15 text-[var(--c-text-3)]'}`}>
                        {isHttp ? 'http' : 'stdio'}
                      </span>
                      <span className="text-[14px] font-mono text-[var(--c-text-2)] truncate flex-1 leading-5">{mcp.name}</span>
                      {mcp.hasSecrets && <LockIcon />}
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        className="w-3 h-3 text-[var(--c-text-3)] flex-shrink-0">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
