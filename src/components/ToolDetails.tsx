import SkillSection from './SkillSection';
import McpSection from './McpSection';
import type { AiTool, Skill, McpServer } from '../types';

interface ToolDetailsProps {
  tool: AiTool;
  query?: string;
  matchedSkills?: Set<string>;
  matchedMcps?: Set<string>;
  onSelectSkill?: (skill: Skill) => void;
  onSelectMcp?: (mcp: McpServer) => void;
  onToggleSkill?: (skill: Skill, active: boolean) => Promise<void>;
  togglingSkill?: string;
}

export default function ToolDetails({ tool, query, matchedSkills, matchedMcps, onSelectSkill, onSelectMcp, onToggleSkill, togglingSkill }: ToolDetailsProps) {
  return (
    <div className="px-2 pt-1 pb-3 space-y-3">
      {tool.error && (
        <p className="text-[11px] text-red-400/80 px-2 font-mono">{tool.error}</p>
      )}
      <SkillSection
        skills={tool.skills}
        query={query}
        matchedPaths={matchedSkills}
        onSelectSkill={onSelectSkill}
        onToggleSkill={onToggleSkill}
        togglingSkill={togglingSkill}
      />
      <McpSection mcps={tool.mcps} query={query} matchedNames={matchedMcps} onSelectMcp={onSelectMcp} />
    </div>
  );
}
