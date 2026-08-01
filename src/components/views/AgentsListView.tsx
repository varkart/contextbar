import { useState } from 'react';
import AgentRow from '../AgentRow';
import SearchInput from '../SearchInput';
import { searchAgents } from '../../search';
import type { Agent } from '../../types';

interface AgentsListViewProps {
  agents: Agent[];
  loading: boolean;
  onSelectAgent: (tool: Agent) => void;
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

export default function AgentsListView({ agents, loading, onSelectAgent }: AgentsListViewProps) {
  const [query, setQuery] = useState('');
  const installedAgents = agents.filter(t => t.installed);
  const searchResults = searchAgents(installedAgents, query);

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
      <div className="flex items-center justify-end px-4 py-2 border-b border-[var(--c-border)] flex-shrink-0">
        <span className="text-[12px] text-[var(--c-text-3)] tabular-nums">
          {installedAgents.length} installed
        </span>
      </div>

      <div className="px-3 py-2 border-b border-[var(--c-border)] flex-shrink-0">
        <SearchInput value={query} onChange={setQuery} placeholder="Search agents, skills, MCPs…" accentColor="indigo" />
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-[var(--c-border-sub)]">
        {loading && agents.length === 0 ? (
          <SkeletonRows />
        ) : searchResults.length === 0 && query ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[14px] text-[var(--c-text-3)]">No results for "{query}"</p>
          </div>
        ) : installedAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center gap-3">
            <p className="text-[15px] font-semibold text-[var(--c-text)]">No agents detected</p>
            <p className="text-[13px] text-[var(--c-text-3)] leading-relaxed max-w-[240px]">
              Install Claude Code, Cursor, Gemini CLI, or GitHub Copilot and Context Bar will pick them up automatically.
            </p>
          </div>
        ) : (
          searchResults.map(({ agent }) => (
            <AgentRow key={agent.id} tool={agent} onSelectAgent={onSelectAgent} />
          ))
        )}
      </div>
    </div>
  );
}
