
import { useState } from 'react';
import type { Agent, Skill, McpServer } from '../types';
import AgentDetails from './AgentDetails';
import ExplainerOverlay from './ExplainerOverlay';
import { agentColor } from '../constants/agentColors';

interface AgentDetailPageProps {
  agent: Agent;
  onBack: () => void;
  onSelectSkill: (skill: Skill) => void;
  onSelectMcp: (mcp: McpServer) => void;
  onOpenSkillsPage: () => void;
  onOpenMcpsPage: () => void;
  onAgentUpdated: () => void;
  onOpenBackups?: () => void;
  onAddSkill?: () => void;
  onAddMcp?: () => void;
  onOpenPermissions?: () => void;
  query?: string;
  matchedSkills?: Set<string>;
  matchedMcps?: Set<string>;
  /** Expanded window renders its own large heading — skip the compact one. */
  hideHeader?: boolean;
}

export default function AgentDetailPage({ agent, onSelectSkill, onSelectMcp, onOpenSkillsPage, onOpenMcpsPage, onOpenBackups, onAddSkill, onAddMcp, onOpenPermissions, query, matchedSkills, matchedMcps, hideHeader }: AgentDetailPageProps) {
  const colors = agentColor(agent.id);
  const [explainerTopic, setExplainerTopic] = useState<'skills' | 'mcps' | null>(null);

  const activeSkills = agent.skills.filter(s => s.active).length;
  const activeMcps = agent.mcps.filter(m => m.active).length;

  return (
    <div className="relative flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
      {!hideHeader && (
      <div className="flex items-center gap-3 px-4 pt-3 pb-2.5 border-b border-[var(--c-border)] flex-shrink-0">
        <span className={`inline-flex items-center justify-center w-9 h-9 rounded-[10px] text-[16px] font-bold flex-shrink-0 ${colors.bg} ${colors.text}`}>
          {agent.name[0].toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-[15px] font-semibold text-[var(--c-text)] tracking-[-0.01em] truncate">
              {agent.name}
            </span>
            {agent.version && (
              <span className="text-[10.5px] font-mono text-[var(--c-text-3)] flex-shrink-0">
                v{agent.version.split('-')[0].replace(/^v/, '')}
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--c-text-3)] mt-0.5 tabular-nums truncate">
            {[
              agent.skills.length > 0 && `${activeSkills}/${agent.skills.length} skills on`,
              agent.mcps.length > 0 && `${activeMcps}/${agent.mcps.length} MCPs on`,
            ].filter(Boolean).join(' · ') || 'No skills or MCPs yet'}
          </p>
        </div>
        {onOpenBackups && (agent.configFiles ?? []).length > 0 && (
          <button
            onClick={onOpenBackups}
            aria-label="View config backups"
            title="Config backups"
            className="flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--c-border)] text-[11px] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] hover:bg-[var(--c-hover)] transition-colors flex-shrink-0"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Backups
          </button>
        )}
      </div>
      )}

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
          onAddSkill={onAddSkill}
          onAddMcp={onAddMcp}
          onOpenPermissions={onOpenPermissions}
          onOpenSkillsExplainer={() => setExplainerTopic('skills')}
          onOpenMcpsExplainer={() => setExplainerTopic('mcps')}
        />
      </div>

      {explainerTopic && (
        <ExplainerOverlay
          topic={explainerTopic}
          onClose={() => setExplainerTopic(null)}
        />
      )}
    </div>
  );
}
