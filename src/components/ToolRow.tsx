import StatusDot from './StatusDot';
import type { AiTool } from '../types';

const TOOL_COLORS: Record<string, { bg: string; text: string }> = {
  claude:   { bg: 'bg-orange-500/10',   text: 'text-orange-500'  },
  cursor:   { bg: 'bg-sky-500/10',      text: 'text-sky-500'     },
  gemini:   { bg: 'bg-blue-500/10',     text: 'text-blue-500'    },
  copilot:  { bg: 'bg-zinc-500/15',     text: 'text-zinc-500'    },
  windsurf: { bg: 'bg-teal-500/10',     text: 'text-teal-500'    },
  chatgpt:  { bg: 'bg-emerald-500/10',  text: 'text-emerald-500' },
  aider:    { bg: 'bg-lime-500/10',     text: 'text-lime-500'    },
  continue: { bg: 'bg-violet-500/10',   text: 'text-violet-500'  },
  kiro:     { bg: 'bg-amber-500/10',    text: 'text-amber-500'   },
  zed:      { bg: 'bg-purple-500/10',   text: 'text-purple-500'  },
};

function ToolIcon({ tool }: { tool: AiTool }) {
  const colors = TOOL_COLORS[tool.id] ?? { bg: 'bg-zinc-500/10', text: 'text-zinc-500' };
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

function getStatusState(tool: AiTool): 'installed' | 'no-config' | 'not-installed' | 'error' {
  if (!tool.installed) return 'not-installed';
  if (tool.error) return 'error';
  if (tool.skills.length === 0 && tool.mcps.length === 0) return 'no-config';
  return 'installed';
}

interface ToolRowProps {
  tool: AiTool;
  onSelectTool: (tool: AiTool) => void;
}

export default function ToolRow({ tool, onSelectTool }: ToolRowProps) {
  const statusState = getStatusState(tool);
  const canNavigate = tool.installed;

  return (
    <button
      onClick={() => canNavigate && onSelectTool(tool)}
      disabled={!canNavigate}
      className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors duration-100 ${
        canNavigate ? 'hover:bg-[var(--c-hover)] cursor-pointer' : 'cursor-default'
      }`}
    >
      <StatusDot state={statusState} />
      <ToolIcon tool={tool} />

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

      {tool.version && (
        <span className="text-[12px] text-[var(--c-text-3)] flex-shrink-0 tabular-nums">
          {tool.version.split('-')[0]}
        </span>
      )}

      {!tool.installed && (
        <span className="text-[12px] text-[var(--c-text-3)]">not found</span>
      )}

      {canNavigate && <ChevronRight />}
    </button>
  );
}
