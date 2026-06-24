import ToolRow from '../ToolRow';
import { searchTools } from '../../search';
import type { AiTool } from '../../types';

interface LlmsListViewProps {
  tools: AiTool[];
  loading: boolean;
  onSelectTool: (tool: AiTool) => void;
  query: string;
  setQuery: (q: string) => void;
}

function SkeletonRows() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <div key={i} className="px-4 py-2.5 animate-pulse">
          <div className="flex items-center gap-2.5">
            <div className="w-[7px] h-[7px] rounded-full bg-[var(--c-skeleton)]" />
            <div className="w-[20px] h-[20px] rounded bg-[var(--c-skeleton)]" />
            <div className="h-3 bg-[var(--c-skeleton)] rounded w-28" />
          </div>
        </div>
      ))}
    </>
  );
}

export default function LlmsListView({ tools, loading, onSelectTool, query = '', setQuery = () => {} }: LlmsListViewProps) {
  const installedTools = tools.filter(t => t.installed);
  const searchResults = searchTools(installedTools, query);

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
      <div className="flex items-center justify-end px-4 py-2 border-b border-[var(--c-border)] flex-shrink-0">
        <span className="text-[12px] text-[var(--c-text-3)] tabular-nums">
          {installedTools.length} installed
        </span>
      </div>

      <div className="px-3 py-2 border-b border-[var(--c-border)] flex-shrink-0">
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
            placeholder="Search tools, skills, MCPs…"
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
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-[var(--c-border-sub)]">
        {loading && tools.length === 0 ? (
          <SkeletonRows />
        ) : searchResults.length === 0 && query ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[14px] text-[var(--c-text-3)]">No results for "{query}"</p>
          </div>
        ) : installedTools.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center gap-3">
            <p className="text-[15px] font-semibold text-[var(--c-text)]">No AI tools detected</p>
            <p className="text-[13px] text-[var(--c-text-3)] leading-relaxed max-w-[240px]">
              Install Claude Code, Cursor, Gemini CLI, or GitHub Copilot and Context Bar will pick them up automatically.
            </p>
          </div>
        ) : (
          searchResults.map(({ tool }) => (
            <ToolRow key={tool.id} tool={tool} onSelectTool={onSelectTool} />
          ))
        )}
      </div>
    </div>
  );
}
