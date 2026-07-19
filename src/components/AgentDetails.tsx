import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import SkillSection from './SkillSection';
import McpSection from './McpSection';
import type { Agent, Skill, McpServer, ToolPermissions } from '../types';

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
  onAddSkill?: () => void;
  onAddMcp?: () => void;
  onOpenPermissions?: () => void;
  onOpenSkillsExplainer?: () => void;
  onOpenMcpsExplainer?: () => void;
}

type Tab = 'skills' | 'mcps' | 'permissions';

function PermissionsTab({ toolId }: { toolId: string }) {
  const [perms, setPerms] = useState<ToolPermissions | null>(null);
  const [supported, setSupported] = useState(true);

  const load = useCallback(async () => {
    try {
      const p = await invoke<ToolPermissions>('get_permissions', { agentId: toolId });
      setPerms(p);
      setSupported(true);
    } catch (e) {
      if (String(e).includes('no permissions section')) setSupported(false);
    }
  }, [toolId]);

  useEffect(() => { load(); }, [load]);

  if (!supported) {
    return (
      <p className="px-4 py-6 text-[12px] text-[var(--c-text-3)] text-center">
        This agent does not support permission rules.
      </p>
    );
  }
  if (!perms) {
    return (
      <div className="px-4 py-4 space-y-2 animate-pulse">
        {[1, 2].map(i => <div key={i} className="h-3 bg-[var(--c-skeleton)] rounded w-2/3" />)}
      </div>
    );
  }

  return (
    <div className="px-3 py-2 space-y-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1.5">
          Allow · {perms.allow.length}
        </p>
        {perms.allow.length === 0 ? (
          <p className="text-[11px] text-[var(--c-text-3)]">No allow rules</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {perms.allow.map(rule => (
              <span key={rule} className="text-[10.5px] font-mono px-1.5 py-0.5 rounded-full border border-emerald-500/25 bg-emerald-500/5 text-emerald-400 max-w-full truncate">
                {rule}
              </span>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-red-400 mb-1.5">
          Deny · {perms.deny.length}
        </p>
        {perms.deny.length === 0 ? (
          <p className="text-[11px] text-[var(--c-text-3)]">No deny rules</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {perms.deny.map(rule => (
              <span key={rule} className="text-[10.5px] font-mono px-1.5 py-0.5 rounded-full border border-red-500/25 bg-red-500/5 text-red-400 max-w-full truncate">
                {rule}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AgentDetails({ agent, query, matchedSkills, matchedMcps, onSelectSkill, onSelectMcp, onOpenSkillsPage, onOpenMcpsPage, onOpenBackups, onAddSkill, onAddMcp, onOpenPermissions, onOpenSkillsExplainer, onOpenMcpsExplainer }: AgentDetailsProps) {
  const hasConfigErrors = (agent.configErrors ?? []).length > 0
  const [tab, setTab] = useState<Tab>('skills');
  // During search, show both sections stacked so matches in either stay visible.
  const searching = !!query;

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'skills', label: 'Skills', count: agent.skills.length },
    { key: 'mcps', label: 'MCPs', count: agent.mcps.length },
    { key: 'permissions', label: 'Permissions' },
  ];

  return (
    <div className="pb-3">
      {agent.error && (
        <div className="px-4 pt-2 pb-1">
          <p className="text-[13px] text-red-400/80 font-mono">{agent.error}</p>
        </div>
      )}

      {hasConfigErrors && (
        <div className="mx-3 mt-2 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/8 border border-amber-500/20">
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

      {searching ? (
        <div className="px-2 pt-1 space-y-3">
          <SkillSection
            skills={agent.skills}
            query={query}
            matchedPaths={matchedSkills}
            onSelectSkill={onSelectSkill}
            onOpenPage={onOpenSkillsPage}
            onAddSkill={onAddSkill}
            onOpenExplainer={onOpenSkillsExplainer}
          />
          <McpSection
            mcps={agent.mcps}
            query={query}
            matchedNames={matchedMcps}
            onSelectMcp={onSelectMcp}
            onOpenPage={onOpenMcpsPage}
            onAddMcp={onAddMcp}
            onOpenExplainer={onOpenMcpsExplainer}
          />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 px-4 border-b border-[var(--c-border)] sticky top-0 bg-[var(--c-bg)] z-[1]">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`py-2 text-[12.5px] border-b-2 -mb-px transition-colors ${
                  tab === t.key
                    ? 'border-violet-500 text-[var(--c-text)] font-medium'
                    : 'border-transparent text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'
                }`}
              >
                {t.label}
                {t.count !== undefined && (
                  <span className="ml-1 text-[var(--c-text-3)] tabular-nums">{t.count}</span>
                )}
              </button>
            ))}
            <div className="ml-auto py-1.5">
              {tab === 'skills' && onAddSkill && (
                <button
                  onClick={onAddSkill}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-500 text-white hover:bg-indigo-400 transition-colors text-[11px] font-semibold shadow-sm"
                >
                  ＋ Add skill
                </button>
              )}
              {tab === 'mcps' && onAddMcp && (
                <button
                  onClick={onAddMcp}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-violet-500 text-white hover:bg-violet-400 transition-colors text-[11px] font-semibold shadow-sm"
                >
                  ＋ Add MCP
                </button>
              )}
              {tab === 'permissions' && onOpenPermissions && (
                <button
                  onClick={onOpenPermissions}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--c-surface)] border border-[var(--c-border)] text-[var(--c-text-2)] hover:text-[var(--c-text)] transition-colors text-[11px] font-medium"
                >
                  Manage rules →
                </button>
              )}
            </div>
          </div>

          <div className="px-2 pt-2">
            {tab === 'skills' && (
              <SkillSection
                skills={agent.skills}
                query={query}
                matchedPaths={matchedSkills}
                onSelectSkill={onSelectSkill}
                onOpenPage={onOpenSkillsPage}
                onAddSkill={onAddSkill}
                onOpenExplainer={onOpenSkillsExplainer}
              />
            )}
            {tab === 'mcps' && (
              <McpSection
                mcps={agent.mcps}
                query={query}
                matchedNames={matchedMcps}
                onSelectMcp={onSelectMcp}
                onOpenPage={onOpenMcpsPage}
                onAddMcp={onAddMcp}
                onOpenExplainer={onOpenMcpsExplainer}
              />
            )}
            {tab === 'permissions' && (
              <PermissionsTab toolId={agent.id} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
