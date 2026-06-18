import { useState } from 'react';
import ToolRow from '../ToolRow';
import StatusDot from '../StatusDot';
import { searchTools } from '../../search';
import { TOOL_COLORS } from '../../constants/toolColors';
import type { AiTool } from '../../types';
import type { LlmsListMode } from '../../useViewRouter';

interface LlmsListViewProps {
  tools: AiTool[];
  loading: boolean;
  mode: LlmsListMode;
  onBack: () => void;
  onSelectTool: (tool: AiTool) => void;
  onOpenSkillsForTool: (tool: AiTool) => void;
  onOpenMcpsForTool: (tool: AiTool) => void;
  onAddSkill: () => void;
  onAddMcp: () => void;
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

function AddTile({ mode, onAddSkill, onAddMcp }: {
  mode: 'skills' | 'mcps';
  onAddSkill: () => void;
  onAddMcp: () => void;
}) {
  const label = mode === 'skills' ? 'Add Skill' : 'Add MCP';
  const accentClass = mode === 'skills' ? 'text-indigo-400 hover:bg-indigo-500/10 hover:border-indigo-400/40' : 'text-violet-400 hover:bg-violet-500/10 hover:border-violet-400/40';

  return (
    <div className="px-3 py-2 border-b border-[var(--c-border-sub)]">
      <button
        onClick={mode === 'skills' ? onAddSkill : onAddMcp}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-[var(--c-border)] transition-colors ${accentClass}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="w-4 h-4">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span className="text-[14px] font-medium">{label}</span>
      </button>
    </div>
  );
}

function FilteredToolRow({ tool, mode, onOpenSkillsForTool, onOpenMcpsForTool }: {
  tool: AiTool;
  mode: 'skills' | 'mcps';
  onOpenSkillsForTool: (tool: AiTool) => void;
  onOpenMcpsForTool: (tool: AiTool) => void;
}) {
  const colors = TOOL_COLORS[tool.id] ?? { bg: 'bg-zinc-500/10', text: 'text-zinc-500' };
  const count = mode === 'skills' ? tool.skills.length : tool.mcps.length;

  return (
    <button
      onClick={() => mode === 'skills' ? onOpenSkillsForTool(tool) : onOpenMcpsForTool(tool)}
      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-[var(--c-hover)] transition-colors duration-100"
    >
      <StatusDot state="installed" />
      <span className={`inline-flex items-center justify-center w-[20px] h-[20px] rounded text-[12px] font-bold flex-shrink-0 select-none ${colors.bg} ${colors.text}`}>
        {tool.name[0].toUpperCase()}
      </span>
      <span className="text-[16px] font-semibold text-[var(--c-text)] flex-1 truncate leading-5">{tool.name}</span>
      <span className="text-[12px] text-[var(--c-text-3)] flex-shrink-0 tabular-nums">
        {count} {mode === 'skills' ? 'skills' : 'mcp'}
      </span>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        className="w-3 h-3 text-[var(--c-text-3)] flex-shrink-0">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}

export default function LlmsListView({
  tools,
  loading,
  mode,
  onBack,
  onSelectTool,
  onOpenSkillsForTool,
  onOpenMcpsForTool,
  onAddSkill,
  onAddMcp,
}: LlmsListViewProps) {
  const [query, setQuery] = useState('');
  const installedTools = tools.filter(t => t.installed);

  const filteredInstalled = mode === 'skills'
    ? installedTools.filter(t => t.skills.length > 0)
    : mode === 'mcps'
    ? installedTools.filter(t => t.mcps.length > 0)
    : installedTools;

  const searchResults = searchTools(installedTools, query);
  const isFiltered = mode !== 'default';

  const title = mode === 'skills' ? 'Skills' : mode === 'mcps' ? 'MCPs' : 'LLMs';
  const count = mode === 'skills'
    ? installedTools.reduce((n, t) => n + t.skills.length, 0)
    : mode === 'mcps'
    ? installedTools.reduce((n, t) => n + t.mcps.length, 0)
    : installedTools.length;

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
        <span className="text-[15px] font-semibold text-[var(--c-text)] tracking-[-0.01em]">{title}</span>
        <span className="ml-auto text-[12px] text-[var(--c-text-3)] tabular-nums flex-shrink-0">
          {count}{mode === 'default' ? ' installed' : ''}
        </span>
      </div>

      {/* Add tile — top of skills/mcps mode */}
      {isFiltered && (
        <AddTile
          mode={mode as 'skills' | 'mcps'}
          onAddSkill={onAddSkill}
          onAddMcp={onAddMcp}
        />
      )}

      {/* Search — default mode only */}
      {!isFiltered && (
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
      )}

      <div className="flex-1 overflow-y-auto divide-y divide-[var(--c-border-sub)]">
        {loading && tools.length === 0 ? (
          <SkeletonRows />
        ) : isFiltered ? (
          filteredInstalled.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[14px] text-[var(--c-text-3)]">
                No {mode === 'skills' ? 'skills' : 'MCPs'} found across installed tools
              </p>
            </div>
          ) : (
            filteredInstalled.map(tool => (
              <FilteredToolRow
                key={tool.id}
                tool={tool}
                mode={mode as 'skills' | 'mcps'}
                onOpenSkillsForTool={onOpenSkillsForTool}
                onOpenMcpsForTool={onOpenMcpsForTool}
              />
            ))
          )
        ) : searchResults.length === 0 && query ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[14px] text-[var(--c-text-3)]">No results for "{query}"</p>
          </div>
        ) : installedTools.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center gap-3">
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
