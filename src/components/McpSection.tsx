import McpRow from './McpRow';
import type { McpServer } from '../types';

interface McpSectionProps {
  mcps: McpServer[];
}

export default function McpSection({ mcps }: McpSectionProps) {
  return (
    <div>
      <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wide px-2 mb-1">
        MCPs ({mcps.length})
      </p>
      {mcps.length === 0 ? (
        <p className="text-xs text-zinc-600 px-2 py-1">No MCPs detected</p>
      ) : (
        mcps.map((mcp) => <McpRow key={mcp.name} mcp={mcp} />)
      )}
    </div>
  );
}
