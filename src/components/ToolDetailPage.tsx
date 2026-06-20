
import type { AiTool, Skill, McpServer } from '../types';
import ToolDetails from './ToolDetails';
import { TOOL_COLORS } from '../constants/toolColors';

interface ToolDetailPageProps {
  tool: AiTool;
  onBack: () => void;
  onSelectSkill: (skill: Skill) => void;
  onSelectMcp: (mcp: McpServer) => void;
  onOpenSkillsPage: () => void;
  onOpenMcpsPage: () => void;
  onToolUpdated: () => void;
  query?: string;
  matchedSkills?: Set<string>;
  matchedMcps?: Set<string>;
}

export default function ToolDetailPage({ tool, onSelectSkill, onSelectMcp, onOpenSkillsPage, onOpenMcpsPage, query, matchedSkills, matchedMcps }: ToolDetailPageProps) {
  const colors = TOOL_COLORS[tool.id] ?? { bg: 'bg-zinc-500/10', text: 'text-zinc-500' };

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--c-border)] flex-shrink-0">
        <span className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded text-[11px] font-bold flex-shrink-0 ${colors.bg} ${colors.text}`}>
          {tool.name[0].toUpperCase()}
        </span>
        <span className="text-[13px] font-semibold text-[var(--c-text)] tracking-[-0.01em] truncate">
          {tool.name}
        </span>
        {(tool.skills.length > 0 || tool.mcps.length > 0) && (
          <span className="ml-auto text-[12px] text-[var(--c-text-3)] tabular-nums flex-shrink-0">
            {[
              tool.skills.length > 0 && `${tool.skills.length} skills`,
              tool.mcps.length > 0 && `${tool.mcps.length} mcp`,
            ].filter(Boolean).join('  ')}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <ToolDetails
          tool={tool}
          query={query}
          matchedSkills={matchedSkills}
          matchedMcps={matchedMcps}
          onSelectSkill={onSelectSkill}
          onSelectMcp={onSelectMcp}
          onOpenSkillsPage={onOpenSkillsPage}
          onOpenMcpsPage={onOpenMcpsPage}
        />
      </div>
    </div>
  );
}
