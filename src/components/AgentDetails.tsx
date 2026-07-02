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
}

export default function AgentDetails({ agent, query, matchedSkills, matchedMcps, onSelectSkill, onSelectMcp, onOpenSkillsPage, onOpenMcpsPage }: AgentDetailsProps) {
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
