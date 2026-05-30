import { useState } from 'react';
import StatusDot from './StatusDot';
import ToolDetails from './ToolDetails';
import type { AiTool } from '../types';

interface ToolRowProps {
  tool: AiTool;
}

function getStatusState(tool: AiTool): 'installed' | 'no-config' | 'not-installed' | 'error' {
  if (!tool.installed) return 'not-installed';
  if (tool.error) return 'error';
  if (tool.skills.length === 0 && tool.mcps.length === 0) return 'no-config';
  return 'installed';
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-3.5 h-3.5 text-zinc-500 flex-shrink-0 transition-transform duration-200 ${
        expanded ? 'rotate-90' : 'rotate-0'
      }`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default function ToolRow({ tool }: ToolRowProps) {
  const [expanded, setExpanded] = useState(false);
  const statusState = getStatusState(tool);
  const canExpand = tool.installed;

  const handleToggle = () => {
    if (canExpand) setExpanded((v) => !v);
  };

  return (
    <div>
      <button
        onClick={handleToggle}
        disabled={!canExpand}
        className={`w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors ${
          canExpand
            ? 'hover:bg-zinc-800/60 cursor-pointer'
            : 'cursor-default'
        }`}
        aria-expanded={canExpand ? expanded : undefined}
      >
        <StatusDot state={statusState} />
        <span className="text-sm font-medium text-zinc-100 flex-1 truncate">
          {tool.name}
        </span>
        {tool.version && (
          <span className="text-xs text-zinc-500 flex-shrink-0">{tool.version}</span>
        )}
        {!tool.installed && (
          <span className="text-xs text-zinc-500">not installed</span>
        )}
        {canExpand && <ChevronIcon expanded={expanded} />}
      </button>

      {expanded && canExpand && (
        <div
          className="transition-opacity duration-150 animate-in"
          style={{ animation: 'fadeIn 150ms ease' }}
        >
          <ToolDetails tool={tool} />
        </div>
      )}
    </div>
  );
}
