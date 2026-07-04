import SkillSection from './SkillSection';
import McpSection from './McpSection';
import type { Agent, Skill, McpServer } from '../types';

interface AgentDetailsProps {
  agent: Agent;
  query?: string;
  matchedSkills?: Set<string>;
  matchedMcps?: Set<string>;
  onSelectSkill?: (skill: Skill) => void;
  onSelectMcp?: (mcp: McpServer) => void;
  onOpenSkillsPage?: () => void;
  onOpenMcpsPage?: () => void;
  onOpenBackups?: () => void;
}

export default function AgentDetails({ agent, query, matchedSkills, matchedMcps, onSelectSkill, onSelectMcp, onOpenSkillsPage, onOpenMcpsPage, onOpenBackups }: AgentDetailsProps) {
  const hasConfigErrors = (agent.configErrors ?? []).length > 0
  return (
    <div className="px-2 pt-1 pb-3 space-y-3">
      {(agent.version || agent.error) && (
        <div className="px-2 pt-1 pb-2 border-b border-[var(--c-border-sub)]">
          <p className="text-[13px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">Notes</p>
          {agent.version && (
            <div className="flex items-center gap-2">
              <span className="text-[14px] text-[var(--c-text-3)]">version</span>
              <span className="text-[14px] font-mono text-[var(--c-text-2)]">{agent.version.split('-')[0]}</span>
            </div>
          )}
          {agent.error && (
            <p className="text-[15px] text-red-400/80 font-mono mt-1">{agent.error}</p>
          )}
        </div>
      )}

      {hasConfigErrors && (
        <div className="mx-2 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/8 border border-amber-500/20">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-amber-400 font-medium">Config file has errors — toggles disabled</p>
            <p className="text-[11px] text-amber-400/70 mt-0.5 leading-relaxed">
              {agent.configErrors![0]}
            </p>
            {onOpenBackups && (
              <button
                onClick={onOpenBackups}
                className="mt-1.5 text-[11px] text-amber-400 underline underline-offset-2 hover:text-amber-300 transition-colors"
              >
                Restore a backup
              </button>
            )}
          </div>
        </div>
      )}

      <SkillSection
        skills={agent.skills}
        query={query}
        matchedPaths={matchedSkills}
        onSelectSkill={onSelectSkill}
        onOpenPage={onOpenSkillsPage}
      />
      <McpSection
        mcps={agent.mcps}
        query={query}
        matchedNames={matchedMcps}
        onSelectMcp={onSelectMcp}
        onOpenPage={onOpenMcpsPage}
      />
    </div>
  );
}
