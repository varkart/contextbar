import SkillSection from './SkillSection';
import McpSection from './McpSection';
import type { AiTool } from '../types';

interface ToolDetailsProps {
  tool: AiTool;
}

export default function ToolDetails({ tool }: ToolDetailsProps) {
  return (
    <div className="px-2 pt-1 pb-3 space-y-3">
      {tool.error && (
        <p className="text-[11px] text-red-400/80 px-2 font-mono">{tool.error}</p>
      )}
      <SkillSection skills={tool.skills} />
      <McpSection mcps={tool.mcps} />
    </div>
  );
}
