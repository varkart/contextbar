import type React from 'react';
import StatusDot from './StatusDot';
import type { Agent } from '../types';
import { AGENT_COLORS } from '../constants/agentColors';

function AgentIcon({ tool }: { tool: Agent }) {
  const colors = AGENT_COLORS[tool.id] ?? { bg: 'bg-zinc-500/10', text: 'text-zinc-500' };
  return (
    <span
      className={`inline-flex items-center justify-center w-[20px] h-[20px] rounded text-[12px] font-bold flex-shrink-0 select-none ${colors.bg} ${colors.text}`}
      aria-hidden="true"
    >
      {tool.name[0].toUpperCase()}
    </span>
  );
}

function ChevronRight() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className="w-3 h-3 text-[var(--c-text-3)] flex-shrink-0">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function getStatusState(tool: Agent): 'installed' | 'no-config' | 'not-installed' | 'error' {
  if (!tool.installed) return 'not-installed';
  if (tool.error) return 'error';
  if (tool.skills.length === 0 && tool.mcps.length === 0) return 'no-config';
  return 'installed';
}

interface AgentRowProps {
  tool: Agent;
  onSelectAgent: (tool: Agent) => void;
  tabIndex?: number;
  onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  rowRef?: React.RefCallback<HTMLElement>;
  onFocus?: () => void;
}

export default function AgentRow({ tool, onSelectAgent, tabIndex, onKeyDown, rowRef, onFocus }: AgentRowProps) {
  const statusState = getStatusState(tool);
  const canNavigate = tool.installed;

  return (
    <button
      ref={rowRef as React.RefCallback<HTMLButtonElement>}
      onClick={() => canNavigate && onSelectAgent(tool)}
      disabled={!canNavigate}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors duration-100 focus-visible:bg-[var(--c-hover)] focus-visible:outline-none ${
        canNavigate ? 'hover:bg-[var(--c-hover)] cursor-pointer' : 'cursor-default'
      }`}
    >
      <StatusDot state={statusState} />
      <AgentIcon tool={tool} />

      <span className="text-[16px] font-semibold text-[var(--c-text)] flex-1 truncate leading-5">
        {tool.name}
      </span>

      {tool.installed && (tool.skills.length > 0 || tool.mcps.length > 0) && (
        <span className="text-[12px] text-[var(--c-text-3)] flex-shrink-0 tabular-nums">
          {[
            tool.skills.length > 0 && `${tool.skills.length} skills`,
            tool.mcps.length > 0  && `${tool.mcps.length} mcp`,
          ].filter(Boolean).join('  ')}
        </span>
      )}

      {!tool.installed && (
        <span className="text-[12px] text-[var(--c-text-3)]">not found</span>
      )}

      {canNavigate && <ChevronRight />}
    </button>
  );
}
