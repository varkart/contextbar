import SkillSection from './SkillSection';
import McpSection from './McpSection';
import PermissionsSection from './PermissionsSection';
import type { AiTool, Skill, McpServer } from '../types';

interface ToolDetailsProps {
  tool: AiTool;
  query?: string;
  matchedSkills?: Set<string>;
  matchedMcps?: Set<string>;
  onSelectSkill?: (skill: Skill) => void;
  onSelectMcp?: (mcp: McpServer) => void;
  onSelectPermissions?: () => void;
  onOpenSkillsPage?: () => void;
  onOpenMcpsPage?: () => void;
  refreshKey?: number;
}

export default function ToolDetails({ tool, query, matchedSkills, matchedMcps, onSelectSkill, onSelectMcp, onSelectPermissions, onOpenSkillsPage, onOpenMcpsPage, refreshKey }: ToolDetailsProps) {
  return (
    <div className="px-2 pt-1 pb-3 space-y-3">
      {(tool.version || tool.error) && (
        <div className="px-2 pt-1 pb-2 border-b border-[var(--c-border-sub)]">
          <p className="text-[13px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">Notes</p>
          {tool.version && (
            <div className="flex items-center gap-2">
              <span className="text-[14px] text-[var(--c-text-3)]">version</span>
              <span className="text-[14px] font-mono text-[var(--c-text-2)]">{tool.version.split('-')[0]}</span>
            </div>
          )}
          {tool.error && (
            <p className="text-[15px] text-red-400/80 font-mono mt-1">{tool.error}</p>
          )}
        </div>
      )}
      <SkillSection
        skills={tool.skills}
        query={query}
        matchedPaths={matchedSkills}
        onSelectSkill={onSelectSkill}
        onOpenPage={onOpenSkillsPage}
      />
      <McpSection
        mcps={tool.mcps}
        query={query}
        matchedNames={matchedMcps}
        onSelectMcp={onSelectMcp}
        onOpenPage={onOpenMcpsPage}
      />
      <PermissionsSection toolId={tool.id} refreshKey={refreshKey} onOpen={onSelectPermissions} />
    </div>
  );
}
