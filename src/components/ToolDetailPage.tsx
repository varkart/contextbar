import { useState } from 'react';
import type { AiTool, Skill, McpServer } from '../types';
import ToolDetails from './ToolDetails';
import { TOOL_COLORS } from '../constants/toolColors';

interface ToolDetailPageProps {
  tool: AiTool;
  onBack: () => void;
  onSelectSkill: (skill: Skill) => void;
  onSelectMcp: (mcp: McpServer) => void;
  onSelectPermissions: () => void;
  onOpenSkillsPage: () => void;
  onOpenMcpsPage: () => void;
  onToolUpdated: () => void;
  query?: string;
  matchedSkills?: Set<string>;
  matchedMcps?: Set<string>;
}

export default function ToolDetailPage({ tool, onBack, onSelectSkill, onSelectMcp, onSelectPermissions, onOpenSkillsPage, onOpenMcpsPage, query, matchedSkills, matchedMcps }: ToolDetailPageProps) {
  const colors = TOOL_COLORS[tool.id] ?? { bg: 'bg-zinc-500/10', text: 'text-zinc-500' };
  const [refreshKey] = useState(0);

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--c-border)] flex-shrink-0">
        <button
          onClick={onBack}
          className="text-[var(--c-text-2)] hover:text-[var(--c-text)] transition-colors p-0.5 -ml-0.5 rounded"
          aria-label="Back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="w-3.5 h-3.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <span className="text-[13px] text-[var(--c-text-3)]">LLM Manager</span>
        <span className="text-[12px] text-[var(--c-text-3)]">›</span>

        <span className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded text-[11px] font-bold flex-shrink-0 ${colors.bg} ${colors.text}`}>
          {tool.name[0].toUpperCase()}
        </span>

        <span className="text-[15px] font-semibold text-[var(--c-text)] tracking-[-0.01em] truncate">
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
          onSelectPermissions={onSelectPermissions}
          onOpenSkillsPage={onOpenSkillsPage}
          onOpenMcpsPage={onOpenMcpsPage}
          refreshKey={refreshKey}
        />
      </div>
    </div>
  );
}
