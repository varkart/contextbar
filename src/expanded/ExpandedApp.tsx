import { useState, useEffect, useCallback, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useTheme } from '../useTheme'
import { useAgents } from '../useAgents'
import type { Agent, RepoWorktrees, SessionEntry } from '../types'
import SessionList from '../components/history/SessionList'
import SessionDetail from '../components/history/SessionDetail'
import WorktreesSection from './WorktreesSection'
import MyWorkSection from './MyWorkSection'

export type Section = 'home' | 'agents' | 'skills' | 'mcps' | 'sessions' | 'worktrees' | 'work'

const SECTIONS: { id: Exclude<Section, 'home'>; label: string; icon: string; soon?: boolean }[] = [
  { id: 'work', label: 'My Work', icon: '▤' },
  { id: 'sessions', label: 'Sessions', icon: '◷' },
  { id: 'worktrees', label: 'Worktrees', icon: '⑂' },
  { id: 'agents', label: 'Agents', icon: '◆' },
  { id: 'skills', label: 'Skills', icon: '✦' },
  { id: 'mcps', label: 'MCPs', icon: '⬡' },
]

function sectionFromHash(hash: string): Section {
  const h = hash.replace(/^#\/?/, '')
  return SECTIONS.some(s => s.id === h) ? (h as Section) : 'home'
}

export default function ExpandedApp() {
  useTheme()
  const [section, setSection] = useState<Section>(() => sectionFromHash(window.location.hash))
  const { agents, loading } = useAgents()
  const [sessions, setSessions] = useState<SessionEntry[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [selectedSession, setSelectedSession] = useState<SessionEntry | null>(null)
  const [repos, setRepos] = useState<RepoWorktrees[]>([])
  const [reposLoading, setReposLoading] = useState(true)

  // The static #splash overlay in index.html renders in every window;
  // this window has no SplashScreen flow, so clear it immediately.
  useEffect(() => {
    document.getElementById('splash')?.remove()
  }, [])

  useEffect(() => {
    invoke<SessionEntry[]>('list_sessions', { limit: 300, offset: 0 })
      .then(s => { setSessions(s); setSessionsLoading(false) })
      .catch(() => setSessionsLoading(false))
  }, [])

  const fetchWorktrees = useCallback(() => {
    invoke<RepoWorktrees[]>('list_worktrees')
      .then(r => { setRepos(r); setReposLoading(false) })
      .catch(() => setReposLoading(false))
  }, [])

  useEffect(() => { fetchWorktrees() }, [fetchWorktrees])

  // Keep hash in sync both ways — Rust deep-links by setting the hash.
  useEffect(() => {
    const onHash = () => setSection(sectionFromHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const goTo = (s: Section) => {
    setSection(s)
    window.location.hash = s === 'home' ? '' : s
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (section === 'home') {
        getCurrentWebviewWindow().close().catch(() => {})
      } else {
        goTo('home')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [section])

  const installedAgents = useMemo(() => agents.filter(a => a.installed), [agents])
  const counts = useMemo(() => ({
    agents: installedAgents.length,
    skills: installedAgents.reduce((n, a) => n + a.skills.length, 0),
    mcps: installedAgents.reduce((n, a) => n + a.mcps.length, 0),
    sessions: sessions.length,
    worktrees: repos.reduce((n, r) => n + r.worktrees.length, 0),
  }), [installedAgents, sessions, repos])

  return (
    <div className="w-screen h-screen bg-[var(--c-bg)] text-[var(--c-text)] flex overflow-hidden">
      {section !== 'home' && (
        <Sidebar section={section} goTo={goTo} counts={counts} />
      )}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {section === 'home' && <Landing goTo={goTo} counts={counts} loading={loading || sessionsLoading} />}
        {section === 'sessions' && (
          <SessionsSection
            sessions={sessions}
            loading={sessionsLoading}
            selected={selectedSession}
            onSelect={setSelectedSession}
          />
        )}
        {section === 'agents' && <AgentsSection agents={installedAgents} loading={loading} />}
        {section === 'skills' && <SkillsSection agents={installedAgents} loading={loading} />}
        {section === 'mcps' && <McpsSection agents={installedAgents} loading={loading} />}
        {section === 'worktrees' && (
          <WorktreesSection
            repos={repos}
            loading={reposLoading}
            sessions={sessions}
            onRemoved={fetchWorktrees}
          />
        )}
        {section === 'work' && (
          <MyWorkSection
            sessions={sessions}
            repos={repos}
            loading={sessionsLoading || reposLoading}
            goTo={goTo}
          />
        )}
      </div>
    </div>
  )
}

// ── Landing ──────────────────────────────────────────────────────────────────

interface SectionCounts {
  agents: number
  skills: number
  mcps: number
  sessions: number
  worktrees: number
}

function Landing({ goTo, counts, loading }: {
  goTo: (s: Section) => void
  counts: SectionCounts
  loading: boolean
}) {
  const countFor = (id: Section): string => {
    if (loading) return '…'
    if (id === 'agents') return String(counts.agents)
    if (id === 'skills') return String(counts.skills)
    if (id === 'mcps') return String(counts.mcps)
    if (id === 'sessions') return String(counts.sessions)
    if (id === 'worktrees') return String(counts.worktrees)
    return ''
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-12">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="w-5 h-5 rounded" style={{ background: 'linear-gradient(135deg, #a5b4fc, #6366f1)' }} />
          <h1 className="text-[22px] font-bold tracking-tight">Context Bar</h1>
        </div>
        <p className="text-[13px] text-[var(--c-text-3)] mb-8">
          Everything about your AI tools in one place
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => goTo(s.id)}
              className="text-left rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 hover:bg-[var(--c-surface-2)] hover:border-[var(--c-accent)]/40 transition-colors p-4 group"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[18px] text-[var(--c-accent)] opacity-80" aria-hidden="true">{s.icon}</span>
                {s.soon ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--c-border)] text-[var(--c-text-3)]">soon</span>
                ) : (
                  <span className="text-[15px] font-semibold tabular-nums text-[var(--c-text-2)]">{countFor(s.id)}</span>
                )}
              </div>
              <div className="text-[14px] font-semibold group-hover:text-[var(--c-text)]">{s.label}</div>
              <div className="text-[11px] text-[var(--c-text-3)] mt-0.5">
                {s.id === 'agents' && 'Installed AI tools and their status'}
                {s.id === 'skills' && 'Skills across all your agents'}
                {s.id === 'mcps' && 'MCP servers across all your agents'}
                {s.id === 'sessions' && 'Claude Code session history'}
                {s.id === 'worktrees' && 'Git worktrees across projects'}
                {s.id === 'work' && 'Your recent activity and tasks'}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ section, goTo, counts }: {
  section: Section
  goTo: (s: Section) => void
  counts: SectionCounts
}) {
  return (
    <div className="w-52 shrink-0 border-r border-[var(--c-border)] flex flex-col bg-[var(--c-surface-2)]/30">
      <button
        onClick={() => goTo('home')}
        className="flex items-center gap-2 px-4 h-12 border-b border-[var(--c-border)] hover:opacity-80 transition-opacity"
        title="Home"
      >
        <span className="w-3.5 h-3.5 rounded" style={{ background: 'linear-gradient(135deg, #a5b4fc, #6366f1)' }} />
        <span className="text-[13px] font-bold tracking-tight">Context Bar</span>
      </button>
      <nav className="flex-1 overflow-y-auto py-2">
        {SECTIONS.map(s => {
          const active = section === s.id
          const count =
            s.id === 'agents' ? counts.agents :
            s.id === 'skills' ? counts.skills :
            s.id === 'mcps' ? counts.mcps :
            s.id === 'sessions' ? counts.sessions :
            s.id === 'worktrees' ? counts.worktrees : null
          return (
            <button
              key={s.id}
              onClick={() => goTo(s.id)}
              className={`w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors ${active ? 'bg-[var(--c-accent)]/10 text-[var(--c-accent)] border-r-2 border-[var(--c-accent)]' : 'text-[var(--c-text-2)] hover:bg-[var(--c-surface-2)] hover:text-[var(--c-text)]'}`}
            >
              <span className="text-[13px] w-4 text-center opacity-70" aria-hidden="true">{s.icon}</span>
              <span className="text-[12.5px] font-medium flex-1">{s.label}</span>
              {s.soon ? (
                <span className="text-[9px] px-1 py-px rounded-full border border-[var(--c-border)] text-[var(--c-text-3)]">soon</span>
              ) : (
                count !== null && <span className="text-[11px] tabular-nums text-[var(--c-text-3)]">{count}</span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

// ── Sections ─────────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-6 pt-5 pb-3 flex-shrink-0">
      <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>
      {subtitle && <p className="text-[12px] text-[var(--c-text-3)] mt-0.5">{subtitle}</p>}
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-32">
      <div className="w-4 h-4 border-2 border-[var(--c-accent)]/40 border-t-[var(--c-accent)] rounded-full animate-spin" />
    </div>
  )
}

function SessionsSection({ sessions, loading, selected, onSelect }: {
  sessions: SessionEntry[]
  loading: boolean
  selected: SessionEntry | null
  onSelect: (s: SessionEntry) => void
}) {
  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="w-80 shrink-0 border-r border-[var(--c-border)] flex flex-col overflow-hidden">
        <SessionList sessions={sessions} onSelect={onSelect} loading={loading} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {selected ? (
          <SessionDetail key={selected.sessionId} session={selected} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[12px] text-[var(--c-text-3)]">Select a session to view its transcript</p>
          </div>
        )}
      </div>
    </div>
  )
}

function AgentsSection({ agents, loading }: { agents: Agent[]; loading: boolean }) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <SectionHeader title="Agents" subtitle={`${agents.length} installed`} />
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {loading ? <Spinner /> : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            {agents.map(a => (
              <div key={a.id} className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13.5px] font-semibold">{a.name}</span>
                  {a.version && <span className="text-[10px] text-[var(--c-text-3)] font-mono">{a.version}</span>}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-[var(--c-text-3)]">
                  {a.supportsSkills && <span>{a.skills.filter(s => s.active).length}/{a.skills.length} skills</span>}
                  {a.supportsMcps && <span>{a.mcps.filter(m => m.active).length}/{a.mcps.length} MCPs</span>}
                </div>
                {a.error && <p className="text-[10px] text-rose-400 mt-2 truncate" title={a.error}>{a.error}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ActiveDot({ active }: { active: boolean }) {
  return (
    <span className={`block w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-emerald-400' : 'bg-[var(--c-border)]'}`} />
  )
}

function SkillsSection({ agents, loading }: { agents: Agent[]; loading: boolean }) {
  const rows = useMemo(() =>
    agents.flatMap(a => a.skills.map(s => ({ ...s, agentName: a.name, key: `${a.id}:${s.sourceId}:${s.path}` }))),
    [agents]
  )
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <SectionHeader title="Skills" subtitle={`${rows.length} across ${agents.length} agents`} />
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {loading ? <Spinner /> : (
          <div className="rounded-xl border border-[var(--c-border)] overflow-hidden">
            {rows.map(s => (
              <div key={s.key} className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--c-border)]/50 last:border-0 hover:bg-[var(--c-surface-2)]/60 transition-colors">
                <ActiveDot active={s.active} />
                <span className="text-[12.5px] font-medium w-56 truncate" title={s.name}>{s.name}</span>
                <span className="text-[11px] text-[var(--c-text-3)] w-28 shrink-0 truncate">{s.agentName}</span>
                <span className="text-[11px] text-[var(--c-text-3)] flex-1 min-w-0 truncate">{s.description ?? ''}</span>
              </div>
            ))}
            {rows.length === 0 && (
              <p className="text-[12px] text-[var(--c-text-3)] text-center py-8">No skills found</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function McpsSection({ agents, loading }: { agents: Agent[]; loading: boolean }) {
  const rows = useMemo(() =>
    agents.flatMap(a => a.mcps.map(m => ({ ...m, agentName: a.name, key: `${a.id}:${m.sourceId}:${m.name}` }))),
    [agents]
  )
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <SectionHeader title="MCP Servers" subtitle={`${rows.length} across ${agents.length} agents`} />
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {loading ? <Spinner /> : (
          <div className="rounded-xl border border-[var(--c-border)] overflow-hidden">
            {rows.map(m => (
              <div key={m.key} className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--c-border)]/50 last:border-0 hover:bg-[var(--c-surface-2)]/60 transition-colors">
                <ActiveDot active={m.active} />
                <span className="text-[12.5px] font-medium w-56 truncate" title={m.name}>{m.name}</span>
                <span className="text-[11px] text-[var(--c-text-3)] w-28 shrink-0 truncate">{m.agentName}</span>
                <span className="text-[11px] text-[var(--c-text-3)] font-mono flex-1 min-w-0 truncate">
                  {m.url ?? [m.command, ...m.args].filter(Boolean).join(' ')}
                </span>
              </div>
            ))}
            {rows.length === 0 && (
              <p className="text-[12px] text-[var(--c-text-3)] text-center py-8">No MCP servers found</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

