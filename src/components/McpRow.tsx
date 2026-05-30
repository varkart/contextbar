import Tooltip from './Tooltip';
import type { McpServer } from '../types';

interface McpRowProps {
  mcp: McpServer;
}

function McpTooltipContent({ mcp }: { mcp: McpServer }) {
  const commandStr = [mcp.command, ...mcp.args].join(' ');
  return (
    <div className="space-y-1">
      <p className="font-medium text-zinc-100">{mcp.name}</p>
      <p className="text-zinc-300 font-mono break-all">{commandStr}</p>
      {mcp.hasSecrets && mcp.secretKeyNames.length > 0 && (
        <p className="text-zinc-400">
          Secrets: {mcp.secretKeyNames.join(', ')}
        </p>
      )}
    </div>
  );
}

function KeyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-3 h-3 text-zinc-400"
      aria-label="has secrets"
    >
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

export default function McpRow({ mcp }: McpRowProps) {
  return (
    <Tooltip content={<McpTooltipContent mcp={mcp} />}>
      <div className="flex items-center gap-2 py-1 px-2 rounded hover:bg-zinc-800/50 w-full cursor-default">
        <span className="text-xs text-zinc-200 truncate max-w-[180px]">{mcp.name}</span>
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          {mcp.hasSecrets && <KeyIcon />}
          {mcp.active && (
            <span className="text-[10px] bg-green-500/20 text-green-400 border border-green-500/30 rounded-full px-1.5 py-0.5 leading-none">
              active
            </span>
          )}
        </div>
      </div>
    </Tooltip>
  );
}
