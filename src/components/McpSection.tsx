import McpRow from './McpRow';
import type { McpServer } from '../types';

interface McpSectionProps {
  mcps: McpServer[];
  query?: string;
  matchedNames?: Set<string>;
}

export default function McpSection({ mcps, query, matchedNames }: McpSectionProps) {
  // When filtering by matchedNames, only show matched MCPs
  const filtered = matchedNames && matchedNames.size > 0
    ? mcps.filter(m => matchedNames.has(m.name))
    : mcps;

  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 mb-0.5">
        <span className="text-[11px] text-zinc-600 font-medium">MCPs</span>
        <span className="text-[11px] text-zinc-700">{filtered.length}</span>
      </div>
      {filtered.length === 0 ? (
        <p className="text-[11px] text-zinc-700 px-2 py-1 italic">None detected</p>
      ) : (
        filtered.map((mcp) => <McpRow key={mcp.name} mcp={mcp} query={query} />)
      )}
    </div>
  );
}
