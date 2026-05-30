import { useState } from 'react';
import StatusDot from './StatusDot';
import ToolDetails from './ToolDetails';
import type { AiTool } from '../types';

const TOOL_COLORS: Record<string, { bg: string; text: string }> = {
  claude:   { bg: 'bg-orange-500/10',   text: 'text-orange-400'  },
  cursor:   { bg: 'bg-sky-500/10',      text: 'text-sky-400'     },
  gemini:   { bg: 'bg-blue-500/10',     text: 'text-blue-400'    },
  copilot:  { bg: 'bg-zinc-500/10',     text: 'text-zinc-400'    },
  windsurf: { bg: 'bg-teal-500/10',     text: 'text-teal-400'    },
  chatgpt:  { bg: 'bg-emerald-500/10',  text: 'text-emerald-400' },
};

function ToolIcon({ tool }: { tool: AiTool }) {
  const colors = TOOL_COLORS[tool.id] ?? { bg: 'bg-zinc-800', text: 'text-zinc-500' };
  return (
    <span
      className={`inline-flex items-center justify-center w-[20px] h-[20px] rounded text-[10px] font-bold flex-shrink-0 select-none ${colors.bg} ${colors.text}`}
      aria-hidden="true"
    >
      {tool.name[0].toUpperCase()}
    </span>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-3 h-3 text-zinc-700 flex-shrink-0 transition-transform duration-150 ${
        expanded ? 'rotate-90' : 'rotate-0'
      }`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function getStatusState(tool: AiTool): 'installed' | 'no-config' | 'not-installed' | 'error' {
  if (!tool.installed) return 'not-installed';
  if (tool.error) return 'error';
  if (tool.skills.length === 0 && tool.mcps.length === 0) return 'no-config';
  return 'installed';
}

export default function ToolRow({ tool }: { tool: AiTool }) {
  const [expanded, setExpanded] = useState(false);
  const statusState = getStatusState(tool);
  const canExpand = tool.installed;

  return (
    <div>
      <button
        onClick={() => canExpand && setExpanded((v) => !v)}
        disabled={!canExpand}
        className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors duration-100 ${
          canExpand ? 'hover:bg-white/[0.025] cursor-pointer' : 'cursor-default'
        }`}
        aria-expanded={canExpand ? expanded : undefined}
      >
        <StatusDot state={statusState} />
        <ToolIcon tool={tool} />

        <span className="text-[13px] font-medium text-zinc-200 flex-1 truncate leading-5">
          {tool.name}
        </span>

        {tool.installed && (tool.skills.length > 0 || tool.mcps.length > 0) && (
          <span className="text-[10px] text-zinc-700 flex-shrink-0 tabular-nums">
            {[
              tool.skills.length > 0 && `${tool.skills.length} skills`,
              tool.mcps.length > 0  && `${tool.mcps.length} mcp`,
            ]
              .filter(Boolean)
              .join('  ')}
          </span>
        )}

        {tool.version && (
          <span className="text-[10px] text-zinc-700 flex-shrink-0 tabular-nums">
            {tool.version.split('-')[0]}
          </span>
        )}

        {!tool.installed && (
          <span className="text-[10px] text-zinc-700">not found</span>
        )}

        {canExpand && <ChevronIcon expanded={expanded} />}
      </button>

      {/* CSS max-height transition — no mount/unmount snap */}
      <div
        className={`overflow-hidden transition-all duration-200 ease-out ${
          expanded && canExpand ? 'max-h-[480px] opacity-100' : 'max-h-0 opacity-0'
        }`}
        aria-hidden={!expanded}
      >
        <ToolDetails tool={tool} />
      </div>
    </div>
  );
}
