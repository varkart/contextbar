import SkillSection from './SkillSection';
import McpSection from './McpSection';
import type { AiTool } from '../types';

interface ToolDetailsProps {
  tool: AiTool;
}

export default function ToolDetails({ tool }: ToolDetailsProps) {
  return (
    <div className="px-3 pb-3 pt-2">
      {tool.error && (
        <p className="text-xs text-red-400 mb-2 px-1">{tool.error}</p>
      )}
      <SkillSection skills={tool.skills} />
      <div className="border-t border-zinc-800 my-2" />
      <McpSection mcps={tool.mcps} />
    </div>
  );
}
