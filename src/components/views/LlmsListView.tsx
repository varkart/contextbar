import { useState } from 'react';
import SearchBar from '../SearchBar';
import ToolRow from '../ToolRow';
import { searchTools } from '../../search';
import type { AiTool } from '../../types';

interface LlmsListViewProps {
  tools: AiTool[];
  loading: boolean;
  onBack: () => void;
  onSelectTool: (tool: AiTool) => void;
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

export default function LlmsListView({ tools, loading, onBack, onSelectTool }: LlmsListViewProps) {
  const [query, setQuery] = useState('');
  const installedTools = tools.filter(t => t.installed);
  const searchResults = searchTools(installedTools, query);

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
        <span className="text-[15px] font-semibold text-[var(--c-text)] tracking-[-0.01em]">LLMs</span>
        <span className="ml-auto text-[12px] text-[var(--c-text-3)] tabular-nums flex-shrink-0">
          {installedTools.length} installed
        </span>
      </div>

      <SearchBar value={query} onChange={setQuery} />

      <div className="flex-1 overflow-y-auto divide-y divide-[var(--c-border-sub)]">
        {loading && tools.length === 0 ? (
          <SkeletonRows />
        ) : searchResults.length === 0 && query ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[14px] text-[var(--c-text-3)]">No results for "{query}"</p>
          </div>
        ) : !loading && installedTools.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--c-surface)] flex items-center justify-center mb-1">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                className="w-5 h-5 text-[var(--c-text-3)]">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <p className="text-[15px] font-semibold text-[var(--c-text)]">No AI tools detected</p>
            <p className="text-[13px] text-[var(--c-text-3)] leading-relaxed max-w-[240px]">
              Install Claude Code, Cursor, Gemini CLI, or GitHub Copilot and LLM Manager will pick them up automatically.
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
