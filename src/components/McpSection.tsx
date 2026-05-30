import McpRow from './McpRow';
import type { McpServer } from '../types';

interface McpSectionProps {
  mcps: McpServer[];
}

export default function McpSection({ mcps }: McpSectionProps) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 mb-0.5">
        <span className="text-[11px] text-zinc-600 font-medium">MCPs</span>
        <span className="text-[11px] text-zinc-700">{mcps.length}</span>
      </div>
      {mcps.length === 0 ? (
        <p className="text-[11px] text-zinc-700 px-2 py-1 italic">None detected</p>
      ) : (
        mcps.map((mcp) => <McpRow key={mcp.name} mcp={mcp} />)
      )}
    </div>
  );
}
