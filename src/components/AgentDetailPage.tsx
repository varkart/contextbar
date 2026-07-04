
import type { Agent, Skill, McpServer } from '../types';
import AgentDetails from './AgentDetails';
import { AGENT_COLORS } from '../constants/agentColors';

interface AgentDetailPageProps {
  agent: Agent;
  onBack: () => void;
  onSelectSkill: (skill: Skill) => void;
  onSelectMcp: (mcp: McpServer) => void;
  onOpenSkillsPage: () => void;
  onOpenMcpsPage: () => void;
  onAgentUpdated: () => void;
  onOpenBackups?: () => void;
  query?: string;
  matchedSkills?: Set<string>;
  matchedMcps?: Set<string>;
}

export default function AgentDetailPage({ agent, onSelectSkill, onSelectMcp, onOpenSkillsPage, onOpenMcpsPage, onOpenBackups, query, matchedSkills, matchedMcps }: AgentDetailPageProps) {
  const colors = AGENT_COLORS[agent.id] ?? { bg: 'bg-zinc-500/10', text: 'text-zinc-500' };

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--c-border)] flex-shrink-0">
        <span className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded text-[11px] font-bold flex-shrink-0 ${colors.bg} ${colors.text}`}>
          {agent.name[0].toUpperCase()}
        </span>
        <span className="text-[13px] font-semibold text-[var(--c-text)] tracking-[-0.01em] truncate">
          {agent.name}
        </span>
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {(agent.skills.length > 0 || agent.mcps.length > 0) && (
            <span className="text-[12px] text-[var(--c-text-3)] tabular-nums">
              {[
                agent.skills.length > 0 && `${agent.skills.length} skills`,
                agent.mcps.length > 0 && `${agent.mcps.length} mcp`,
              ].filter(Boolean).join('  ')}
            </span>
          )}
          {onOpenBackups && (agent.configFiles ?? []).length > 0 && (
            <button
              onClick={onOpenBackups}
              aria-label="View config backups"
              title="Config backups"
              className="p-1 rounded hover:bg-[var(--c-surface-2)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <AgentDetails
          agent={agent}
          query={query}
          matchedSkills={matchedSkills}
          matchedMcps={matchedMcps}
          onSelectSkill={onSelectSkill}
          onSelectMcp={onSelectMcp}
          onOpenSkillsPage={onOpenSkillsPage}
          onOpenMcpsPage={onOpenMcpsPage}
          onOpenBackups={onOpenBackups}
        />
      </div>
    </div>
  );
}
