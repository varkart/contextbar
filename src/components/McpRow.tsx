import Tooltip from './Tooltip';
import Highlight from './Highlight';
import type { McpServer } from '../types';

interface McpRowProps {
  mcp: McpServer;
  query?: string;
}

function McpTooltipContent({ mcp }: { mcp: McpServer }) {
  const commandStr = [mcp.command, ...mcp.args].join(' ');
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold">{mcp.name}</p>
      <p className="text-[10px] opacity-70 font-mono break-all leading-relaxed">{commandStr}</p>
      {mcp.hasSecrets && mcp.secretKeyNames.length > 0 && (
        <div className="pt-0.5 border-t border-[var(--c-border)]">
          <p className="text-[10px] opacity-50">env: {mcp.secretKeyNames.join(', ')}</p>
        </div>
      )}
    </div>
  );
}

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

export default function McpRow({ mcp, query = '' }: McpRowProps) {
  return (
    <Tooltip content={<McpTooltipContent mcp={mcp} />}>
      <div className="flex items-center gap-2 py-[3px] pl-5 pr-2 rounded-sm hover:bg-[var(--c-hover)] w-full cursor-default transition-colors">
        <span className="w-[3px] h-[3px] rounded-full bg-violet-400/60 flex-shrink-0" aria-hidden="true" />
        <Highlight text={mcp.name} query={query} className="text-[12px] text-[var(--c-text-2)] truncate flex-1 leading-5" />
        {mcp.hasSecrets && <span className="flex-shrink-0"><LockIcon /></span>}
      </div>
    </Tooltip>
  );
}
