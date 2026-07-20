import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import SkillSection from './SkillSection';
import McpSection from './McpSection';
import Toggle from './Toggle';
import CapabilityDetail from './CapabilityDetail';
import type { Agent, Skill, McpServer, ToolPermissions, CapabilityState } from '../types';

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

/** Per-agent reference docs for the capability toggles. */
const CAPABILITY_DOCS: Record<string, { url: string; label: string }> = {
  claude: { url: 'https://code.claude.com/docs/en/tools-reference', label: 'Tool reference' },
  codex: { url: 'https://developers.openai.com/codex/config-reference', label: 'Config reference' },
};

const CATEGORY_ORDER: { key: string; label: string }[] = [
  { key: 'context', label: 'Context' },
  { key: 'tools', label: 'Tools' },
  { key: 'features', label: 'Features' },
  { key: 'limits', label: 'Limits' },
];

function CapabilityToggles({ toolId }: { toolId: string }) {
  const [caps, setCaps] = useState<CapabilityState[] | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    invoke<CapabilityState[]>('get_capabilities', { agentId: toolId })
      .then(setCaps)
      .catch(() => setCaps([]));
  }, [toolId]);

  if (!caps || caps.length === 0) return null;

  const setCap = (cap: CapabilityState, enabled: boolean) => {
    setToggling(cap.id);
    setError(null);
    setCaps(prev => prev!.map(c => (c.id === cap.id ? { ...c, enabled } : c)));
    invoke('set_capability', { agentId: toolId, capabilityId: cap.id, enabled })
      .catch(e => {
        setError(String(e));
        setCaps(prev => prev!.map(c => (c.id === cap.id ? { ...c, enabled: !enabled } : c)));
      })
      .finally(() => setToggling(null));
  };

  const setCapValue = (cap: CapabilityState, value: string) => {
    const prevValue = cap.value;
    setToggling(cap.id);
    setError(null);
    setCaps(prev => prev!.map(c => (c.id === cap.id ? { ...c, value } : c)));
    invoke('set_capability_value', { agentId: toolId, capabilityId: cap.id, value })
      .catch(e => {
        setError(String(e));
        setCaps(prev => prev!.map(c => (c.id === cap.id ? { ...c, value: prevValue } : c)));
      })
      .finally(() => setToggling(null));
  };

  const savedTokens = caps
    .filter(c => !c.enabled && c.tokensHint)
    .reduce((n, c) => n + (c.tokensHint ?? 0), 0);

  // Derived so the overlay's toggle reflects live state after flips.
  const selectedCap = selectedId ? caps.find(c => c.id === selectedId) ?? null : null;

  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--c-text-3)]">
          Context & features
        </p>
        {savedTokens > 0 && (
          <span className="text-[10px] text-emerald-400 tabular-nums">
            ~{savedTokens.toLocaleString()} tok saved (est.)
          </span>
        )}
      </div>
      <div className="flex items-start gap-2 rounded-lg border border-sky-500/25 bg-sky-500/5 px-2.5 py-2 mb-2.5">
        <svg className="w-3.5 h-3.5 text-sky-400 flex-shrink-0 mt-px" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        <p className="text-[10.5px] text-[var(--c-text-2)] leading-relaxed">
          <span className="font-semibold text-sky-400">New sessions only.</span>{' '}
          Sessions already running keep their loaded settings until you restart them.
          {toolId === 'claude' && (
            <> Verify in a fresh session with <span className="font-mono">/context</span> — denied tools disappear from the tool list.</>
          )}
          {CAPABILITY_DOCS[toolId] && (
            <>{' '}
              <button
                onClick={() => invoke('open_url', { url: CAPABILITY_DOCS[toolId].url }).catch(() => {})}
                className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors"
                title={`Official ${CAPABILITY_DOCS[toolId].label.toLowerCase()} for this agent`}
              >
                {CAPABILITY_DOCS[toolId].label} ↗
              </button>
            </>
          )}
        </p>
      </div>
      {error && (
        <p className="text-[10.5px] text-red-400 mb-2">{error}</p>
      )}
      <div className="space-y-3">
        {CATEGORY_ORDER.map(cat => {
          const items = caps.filter(c => c.category === cat.key);
          if (items.length === 0) return null;
          return (
            <div key={cat.key}>
              <p className="text-[9.5px] font-semibold uppercase tracking-wider text-[var(--c-text-3)]/70 mb-1">
                {cat.label}
              </p>
              <div className="border border-[var(--c-border-sub)] rounded-lg divide-y divide-[var(--c-border-sub)]">
                {items.map(cap => (
                  <div
                    key={cap.id}
                    title={cap.help ?? cap.description ?? cap.label}
                    className="flex items-center gap-2.5 px-2.5 py-2 group/cap"
                  >
                    <button
                      onClick={() => setSelectedId(cap.id)}
                      className="flex-1 min-w-0 text-left"
                      aria-label={`Details for ${cap.label}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[12px] font-medium group-hover/cap:text-[var(--c-accent,#8b5cf6)] transition-colors ${cap.enabled ? 'text-[var(--c-text)]' : 'text-[var(--c-text-3)]'}`}>
                          {cap.label}
                        </span>
                        {cap.tokensHint != null && (
                          <span className={`text-[9px] px-1 py-px rounded tabular-nums ${cap.enabled ? 'bg-[var(--c-surface)] text-[var(--c-text-3)]' : 'bg-emerald-500/10 text-emerald-400'}`}>
                            ~{cap.tokensHint} tok
                          </span>
                        )}
                        <span className="text-[10px] text-[var(--c-text-3)] opacity-0 group-hover/cap:opacity-70 transition-opacity">
                          details ›
                        </span>
                      </div>
                      {cap.description && (
                        <p className="text-[10px] text-[var(--c-text-3)] mt-0.5 leading-snug">{cap.description}</p>
                      )}
                    </button>
                    {cap.kind === 'enum' ? (
                      <select
                        value={cap.value ?? cap.defaultValue ?? ''}
                        disabled={toggling === cap.id}
                        onChange={e => setCapValue(cap, e.target.value)}
                        onClick={e => e.stopPropagation()}
                        className="text-[11px] rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-2)] px-1.5 py-1 focus:outline-none disabled:opacity-40"
                        aria-label={`${cap.label} value`}
                      >
                        {cap.values.map(v => (
                          <option key={v} value={v}>
                            {v}{v === cap.defaultValue ? ' (default)' : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Toggle
                        active={cap.enabled}
                        toggling={toggling === cap.id}
                        onChange={v => setCap(cap, v)}
                        activeColor="bg-emerald-500"
                        entityLabel={cap.label}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {selectedCap && (
        <CapabilityDetail
          cap={selectedCap}
          toggling={toggling === selectedCap.id}
          docs={CAPABILITY_DOCS[toolId]}
          onToggle={v => setCap(selectedCap, v)}
          onSetValue={v => setCapValue(selectedCap, v)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

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
      <div className="px-3 py-2">
        <CapabilityToggles toolId={toolId} />
        <p className="py-4 text-[12px] text-[var(--c-text-3)] text-center">
          This agent does not support permission rules.
        </p>
      </div>
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
      <CapabilityToggles toolId={toolId} />
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
      {perms.ask.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400 mb-1.5">
            Ask · {perms.ask.length}
          </p>
          <div className="flex flex-wrap gap-1">
            {perms.ask.map(rule => (
              <span key={rule} className="text-[10.5px] font-mono px-1.5 py-0.5 rounded-full border border-amber-500/25 bg-amber-500/5 text-amber-400 max-w-full truncate">
                {rule}
              </span>
            ))}
          </div>
        </div>
      )}
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
