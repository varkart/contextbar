import { useEffect, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { RepoAgentConfig, RepoScope, PermissionSection, RepoCapabilityState } from '../types'

/** Tri-state overrides for Claude capabilities in this repo's settings.json. */
function CapabilityOverrides({ repoPath }: { repoPath: string }) {
  const [caps, setCaps] = useState<RepoCapabilityState[] | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    invoke<RepoCapabilityState[]>('get_repo_capabilities', { agentId: 'claude', repoPath })
      .then(setCaps)
      .catch(() => setCaps([]))
  }, [repoPath])

  useEffect(() => { load() }, [load])

  if (!caps || caps.length === 0) return null
  const overridden = caps.filter(c => c.state !== 'inherit').length

  const setState = async (cap: RepoCapabilityState, state: string) => {
    setError(null)
    setCaps(prev => prev!.map(c => (c.id === cap.id ? { ...c, state } : c)))
    try {
      await invoke('set_repo_capability', {
        agentId: 'claude', repoPath, capabilityId: cap.id, state,
      })
    } catch (e) {
      setError(String(e))
      load()
    }
  }

  return (
    <div className="rounded-lg border border-[var(--c-border-sub)] px-2.5 py-2">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-1.5 text-left">
        <span className="text-[11px] font-semibold text-[var(--c-text-2)]">Claude · Feature overrides</span>
        <span className="text-[9px] text-[var(--c-text-3)]">
          {overridden > 0 ? `${overridden} overridden` : 'all inherited'}
        </span>
        <span className={`ml-auto text-[10px] text-[var(--c-text-3)] transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-1">
          {error && <p className="text-[10px] text-red-400">{error}</p>}
          {caps.map(cap => (
            <div key={cap.id} className="flex items-center gap-1.5 flex-wrap">
              <span className={`flex-1 min-w-0 text-[10.5px] truncate ${cap.state === 'inherit' ? 'text-[var(--c-text-3)]' : 'text-[var(--c-text)]'}`}>
                {cap.label}
              </span>
              {cap.help && <HelpExpander text={cap.help} />}
              <select
                value={cap.state}
                onChange={e => setState(cap, e.target.value)}
                className="text-[10px] rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-2)] px-1 py-0.5 focus:outline-none"
                aria-label={`${cap.label} override`}
              >
                <option value="inherit">inherit</option>
                {cap.control === 'tristate' && (<><option value="on">on</option><option value="off">off</option></>)}
                {cap.control === 'deny' && <option value="deny">denied here</option>}
                {cap.control === 'enum' && cap.values.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          ))}
          <p className="text-[9px] text-[var(--c-text-3)] pt-0.5">
            Writes to .claude/settings.json — overrides user settings for sessions in this repo; new sessions only.
          </p>
        </div>
      )}
    </div>
  )
}

const SECTION_CHIP: Record<string, string> = {
  allow: 'border-emerald-500/25 bg-emerald-500/5 text-emerald-400',
  ask: 'border-amber-500/25 bg-amber-500/5 text-amber-400',
  deny: 'border-red-500/25 bg-red-500/5 text-red-400',
}

/** "?" button that expands an inline explanation paragraph. */
function HelpExpander({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        title={open ? 'Hide details' : 'What is this?'}
        aria-expanded={open}
        className={`flex-shrink-0 w-3.5 h-3.5 rounded-full border text-[8.5px] leading-none flex items-center justify-center transition-colors ${open ? 'border-[var(--c-accent)]/50 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
      >
        ?
      </button>
      {open && (
        <p className="w-full basis-full text-[10px] text-[var(--c-text-2)] leading-relaxed bg-[var(--c-surface)]/60 rounded-md px-2 py-1.5 mt-1">
          {text}
        </p>
      )}
    </>
  )
}

const SCOPE_HELP: Record<RepoScope, string> = {
  project:
    'Rules in .claude/settings.json — meant to be committed and shared with everyone working in this repo. They apply to Claude Code sessions started inside this repo and override the user-level settings in ~/.claude/settings.json. Precedence: local > project > user.',
  local:
    'Rules in .claude/settings.local.json — personal to this machine and gitignored, never shared. Highest precedence: they override both the project file and your user settings for sessions in this repo.',
}

const TRUST_HELP =
  'Codex records folders you have approved under [projects] in ~/.codex/config.toml with trust_level = "trusted". A trusted folder skips the "do you trust this folder?" prompt when Codex starts there and lets it read project files and run with your configured sandbox/approval settings. Removing trust deletes the entry, so Codex asks again next time. This does not change Claude Code behavior.'

function ScopeBlock({
  label,
  hint,
  scope,
  perms,
  onChanged,
  repoPath,
}: {
  label: string
  hint: string
  scope: RepoScope
  perms: { file: string; exists: boolean; allow: string[]; ask: string[]; deny: string[] }
  onChanged: () => void
  repoPath: string
}) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [rule, setRule] = useState('')
  const [section, setSection] = useState<PermissionSection>('allow')
  const [error, setError] = useState<string | null>(null)

  const total = perms.allow.length + perms.ask.length + perms.deny.length

  const mutate = async (r: string, s: PermissionSection, add: boolean) => {
    setError(null)
    try {
      await invoke('set_repo_permission_rule', { repoPath, scope, rule: r, section: s, add })
      onChanged()
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div className="rounded-lg border border-[var(--c-border-sub)] px-2.5 py-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1.5 flex-1 min-w-0 text-left">
          <span className="text-[11px] font-semibold text-[var(--c-text-2)]">{label}</span>
          <span className="text-[9px] font-mono text-[var(--c-text-3)] truncate">{perms.file}</span>
          <span className="text-[9px] text-[var(--c-text-3)]">
            {total > 0 ? `· ${total} rule${total === 1 ? '' : 's'}` : perms.exists ? '· no rules' : '· not created yet'}
          </span>
          <span className={`text-[10px] text-[var(--c-text-3)] transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
        </button>
        <HelpExpander text={hint} />
      </div>
      {open && (<>
      {total > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {(['allow', 'ask', 'deny'] as const).map(sec =>
            perms[sec].map(r => (
              <span
                key={`${sec}:${r}`}
                className={`group/rule flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-full border max-w-full ${SECTION_CHIP[sec]}`}
                title={`${sec} rule`}
              >
                <span className="truncate">{r}</span>
                <button
                  onClick={() => mutate(r, sec, false)}
                  className="opacity-0 group-hover/rule:opacity-70 hover:!opacity-100 transition-opacity"
                  aria-label={`Remove ${r}`}
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
      )}
      {adding ? (
        <div className="flex gap-1 mt-1.5">
          <select
            value={section}
            onChange={e => setSection(e.target.value as PermissionSection)}
            className="text-[10px] rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-2)] px-1 py-0.5 focus:outline-none"
          >
            <option value="allow">Allow</option>
            <option value="ask">Ask</option>
            <option value="deny">Deny</option>
          </select>
          <input
            autoFocus
            type="text"
            value={rule}
            onChange={e => setRule(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && rule.trim()) {
                mutate(rule.trim(), section, true)
                setRule('')
                setAdding(false)
              }
              if (e.key === 'Escape') setAdding(false)
            }}
            placeholder="Bash(npm:*) or WebSearch"
            className="flex-1 text-[10px] font-mono rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text)] px-1.5 py-0.5 focus:outline-none focus:border-[var(--c-accent)]/50"
          />
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-[10px] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors mt-1.5"
        >
          ＋ Add rule
        </button>
      )}
      {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
      </>)}
    </div>
  )
}

/** Repo-scoped agent configuration, shown inside an expanded repo card. */
export default function RepoAgentConfigView({ repoPath }: { repoPath: string }) {
  const [cfg, setCfg] = useState<RepoAgentConfig | null>(null)
  const [trustBusy, setTrustBusy] = useState(false)

  const load = useCallback(() => {
    invoke<RepoAgentConfig>('get_repo_agent_config', { repoPath }).then(setCfg).catch(() => {})
  }, [repoPath])

  useEffect(() => { load() }, [load])

  if (!cfg) return null

  const setTrust = async (trusted: boolean) => {
    setTrustBusy(true)
    try {
      await invoke('set_codex_repo_trust', { repoPath, trusted })
      load()
    } catch { /* surfaced on next load */ } finally {
      setTrustBusy(false)
    }
  }

  return (
    <div className="mb-2">
      <p className="text-[9.5px] font-mono uppercase tracking-wider text-[var(--c-text-3)] mb-1.5">
        Agent config — this repo
      </p>
      <div className="space-y-1.5">
        <ScopeBlock
          label="Claude · Project"
          hint={SCOPE_HELP.project}
          scope="project"
          perms={cfg.claude.project}
          onChanged={load}
          repoPath={repoPath}
        />
        <ScopeBlock
          label="Claude · Local"
          hint={SCOPE_HELP.local}
          scope="local"
          perms={cfg.claude.local}
          onChanged={load}
          repoPath={repoPath}
        />
        <CapabilityOverrides repoPath={repoPath} />
        <div className="rounded-lg border border-[var(--c-border-sub)] px-2.5 py-2 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-[var(--c-text-2)]">Codex · Trust</span>
          <span className={`text-[9.5px] px-1.5 py-px rounded-full border ${cfg.codex.trustLevel === 'trusted' ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-400' : 'border-[var(--c-border-sub)] bg-[var(--c-surface)] text-[var(--c-text-3)]'}`}>
            {cfg.codex.trustLevel ?? 'not trusted'}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <HelpExpander text={TRUST_HELP} />
            <button
              onClick={() => setTrust(cfg.codex.trustLevel !== 'trusted')}
              disabled={trustBusy}
              className="text-[10px] px-2 py-0.5 rounded-md border border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors disabled:opacity-40"
            >
              {cfg.codex.trustLevel === 'trusted' ? 'Remove trust' : 'Mark trusted'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
