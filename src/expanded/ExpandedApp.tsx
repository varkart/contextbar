import { useState, useEffect, useCallback, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useTheme } from '../useTheme'
import { useAgents } from '../useAgents'
import type { RepoWorktrees, SessionEntry } from '../types'
import SessionList from '../components/history/SessionList'
import SessionDetail from '../components/history/SessionDetail'
import WorktreesSection from './WorktreesSection'
import MyWorkSection from './MyWorkSection'
import ToolsPanel, { type ToolsSection } from './ToolsPanel'
import { Tile, TileRow } from './InsightTiles'
import { RefreshButton } from './InsightWidgets'

export type Section =
  | 'work'
  | 'sessions'
  | 'worktrees'
  | 'agents'
  | 'skills'
  | 'mcps'
  | 'settings'
  | 'notifications'

const TOOLS_SECTIONS: ToolsSection[] = ['agents', 'skills', 'mcps', 'settings', 'notifications']

function isToolsSection(s: Section): s is ToolsSection {
  return (TOOLS_SECTIONS as string[]).includes(s)
}

const WORK_SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: 'work', label: 'My Work', icon: '▤' },
  { id: 'sessions', label: 'Sessions', icon: '◷' },
  { id: 'worktrees', label: 'Repos', icon: '⑂' },
]

const CONFIGURE_SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: 'agents', label: 'Agents', icon: '◆' },
  { id: 'skills', label: 'Skills', icon: '✦' },
  { id: 'mcps', label: 'MCPs', icon: '⬡' },
]

const ALL_SECTION_IDS: Section[] = [
  ...WORK_SECTIONS.map(s => s.id),
  ...CONFIGURE_SECTIONS.map(s => s.id),
  'settings',
  'notifications',
]

function sectionFromHash(hash: string): Section {
  const h = hash.replace(/^#\/?/, '')
  return ALL_SECTION_IDS.includes(h as Section) ? (h as Section) : 'work'
}

const SECTION_STORAGE_KEY = 'contextbar:expanded:section'

/** Deep-link hash wins; otherwise restore the last visited section. */
function initialSection(): Section {
  const h = window.location.hash.replace(/^#\/?/, '')
  if (ALL_SECTION_IDS.includes(h as Section)) return h as Section
  const saved = localStorage.getItem(SECTION_STORAGE_KEY)
  if (saved && ALL_SECTION_IDS.includes(saved as Section)) return saved as Section
  return 'work'
}

export default function ExpandedApp() {
  const { theme, setTheme } = useTheme()
  const [section, setSection] = useState<Section>(initialSection)

  useEffect(() => {
    localStorage.setItem(SECTION_STORAGE_KEY, section)
  }, [section])
  const { agents, loading, cloudSyncing, lastUpdated, fetchAgents } = useAgents()
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

  const [sessionLimit, setSessionLimit] = useState(300)

  const fetchSessions = useCallback((limit: number) => {
    invoke<SessionEntry[]>('list_sessions', { limit, offset: 0 })
      .then(s => { setSessions(s); setSessionsLoading(false) })
      .catch(() => setSessionsLoading(false))
  }, [])

  useEffect(() => { fetchSessions(300) }, [fetchSessions])

  const loadMoreSessions = useCallback(() => {
    setSessionLimit(prev => {
      const next = prev + 300
      fetchSessions(next)
      return next
    })
  }, [fetchSessions])

  const fetchWorktrees = useCallback(() => {
    invoke<RepoWorktrees[]>('list_worktrees')
      .then(r => { setRepos(r); setReposLoading(false) })
      .catch(() => setReposLoading(false))
  }, [])

  useEffect(() => { fetchWorktrees() }, [fetchWorktrees])

  const refreshAll = useCallback(() => {
    fetchSessions(sessionLimit)
    fetchWorktrees()
    invoke('warm_session_stats').catch(() => {})
  }, [fetchSessions, fetchWorktrees, sessionLimit])

  // Long-lived window: refetch when it regains focus, and poll the cheap
  // session index every 30s while visible so live dots stay truthful.
  useEffect(() => {
    const onFocus = () => refreshAll()
    window.addEventListener('focus', onFocus)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchSessions(sessionLimit)
    }, 30_000)
    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(interval)
    }
  }, [refreshAll, fetchSessions, sessionLimit])

  // Keep hash in sync both ways — Rust deep-links by setting the hash.
  useEffect(() => {
    const onHash = () => setSection(sectionFromHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const goTo = useCallback((s: Section) => {
    setSection(s)
    window.location.hash = s === 'work' ? '' : s
  }, [])

  const goHome = useCallback(() => goTo('work'), [goTo])

  // Jump to the Sessions section with a transcript open — used by
  // worktree rows, My Work cards and the Claude usage strip.
  const openSession = useCallback((entry: SessionEntry) => {
    setSelectedSession(entry)
    goTo('sessions')
  }, [goTo])

  const openSessionById = useCallback((sessionId: string) => {
    const entry = sessions.find(s => s.sessionId === sessionId)
    if (entry) setSelectedSession(entry)
    goTo('sessions')
  }, [sessions, goTo])

  // ⌘1–⌘6 jump directly to a section, from anywhere in the window.
  useEffect(() => {
    const order: Section[] = ['work', 'sessions', 'worktrees', 'agents', 'skills', 'mcps']
    const handler = (e: KeyboardEvent) => {
      if (!e.metaKey || e.shiftKey || e.altKey || e.ctrlKey) return
      const n = Number(e.key)
      if (n >= 1 && n <= order.length) {
        e.preventDefault()
        goTo(order[n - 1])
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goTo])

  // Escape inside tools sections is owned by ToolsPanel (it unwinds the
  // embedded view stack first); here we only handle the custom sections.
  useEffect(() => {
    if (isToolsSection(section)) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (section === 'work') {
        getCurrentWebviewWindow().close().catch(() => {})
      } else {
        goTo('work')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [section, goTo])

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
      <Sidebar section={section} goTo={goTo} counts={counts} />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {section === 'work' && (
          <MyWorkSection
            sessions={sessions}
            repos={repos}
            loading={sessionsLoading || reposLoading}
            goTo={goTo}
            onRefresh={refreshAll}
            onOpenSession={openSession}
          />
        )}
        {section === 'sessions' && (
          <SessionsSection
            sessions={sessions}
            loading={sessionsLoading}
            selected={selectedSession}
            onSelect={setSelectedSession}
            onRefresh={refreshAll}
            onLoadMore={loadMoreSessions}
            hasMore={sessions.length >= sessionLimit}
          />
        )}
        {section === 'worktrees' && (
          <WorktreesSection
            repos={repos}
            loading={reposLoading}
            sessions={sessions}
            onRemoved={fetchWorktrees}
            onRefresh={refreshAll}
            onOpenSession={openSession}
          />
        )}
        {isToolsSection(section) && (
          <ToolsPanel
            section={section}
            goHome={goHome}
            agents={agents}
            installedAgents={installedAgents}
            loading={loading}
            cloudSyncing={cloudSyncing}
            lastUpdated={lastUpdated}
            fetchAgents={fetchAgents}
            theme={theme}
            setTheme={setTheme}
            onOpenSession={openSessionById}
          />
        )}
      </div>
    </div>
  )
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

interface SectionCounts {
  agents: number
  skills: number
  mcps: number
  sessions: number
  worktrees: number
}

function countFor(id: Section, counts: SectionCounts): number | null {
  if (id === 'agents') return counts.agents
  if (id === 'skills') return counts.skills
  if (id === 'mcps') return counts.mcps
  if (id === 'sessions') return counts.sessions
  if (id === 'worktrees') return counts.worktrees
  return null
}

function Sidebar({ section, goTo, counts }: {
  section: Section
  goTo: (s: Section) => void
  counts: SectionCounts
}) {
  const group = (label: string, items: { id: Section; label: string; icon: string }[], startIndex: number) => (
    <div className="mb-1">
      <div className="px-4 pt-3 pb-1 text-[9.5px] font-mono uppercase tracking-wider text-[var(--c-text-3)]">
        {label}
      </div>
      {items.map((s, i) => {
        const active = section === s.id
        const count = countFor(s.id, counts)
        return (
          <button
            key={s.id}
            onClick={() => goTo(s.id)}
            className={`group w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors ${active ? 'bg-[var(--c-accent)]/10 text-[var(--c-accent)] border-r-2 border-[var(--c-accent)]' : 'text-[var(--c-text-2)] hover:bg-[var(--c-surface-2)] hover:text-[var(--c-text)]'}`}
          >
            <span className="text-[13px] w-4 text-center opacity-70" aria-hidden="true">{s.icon}</span>
            <span className="text-[12.5px] font-medium flex-1">{s.label}</span>
            {count !== null && <span className="text-[11px] tabular-nums text-[var(--c-text-3)] group-hover:hidden">{count}</span>}
            <span className={`text-[9px] font-mono text-[var(--c-text-3)] opacity-60 ${count !== null ? 'hidden group-hover:inline' : ''}`}>⌘{startIndex + i}</span>
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="w-52 shrink-0 border-r border-[var(--c-border)] flex flex-col bg-[var(--c-surface-2)]/30">
      <button
        onClick={() => goTo('work')}
        className="flex items-center gap-2 px-4 h-12 border-b border-[var(--c-border)] hover:opacity-80 transition-opacity"
        title="My Work"
      >
        <span className="w-3.5 h-3.5 rounded" style={{ background: 'linear-gradient(135deg, #a5b4fc, #6366f1)' }} />
        <span className="text-[13px] font-bold tracking-tight">Context Bar</span>
      </button>
      <nav className="flex-1 overflow-y-auto pb-2">
        {group('Work', WORK_SECTIONS, 1)}
        {group('Configure', CONFIGURE_SECTIONS, 4)}
      </nav>
      <div className="border-t border-[var(--c-border)] py-2">
        {([['notifications', '◎', 'Notifications'], ['settings', '⚙', 'Settings']] as const).map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => goTo(id)}
            className={`w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors ${section === id ? 'bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'text-[var(--c-text-3)] hover:bg-[var(--c-surface-2)] hover:text-[var(--c-text-2)]'}`}
          >
            <span className="text-[13px] w-4 text-center opacity-70" aria-hidden="true">{icon}</span>
            <span className="text-[12.5px] font-medium">{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Sessions ─────────────────────────────────────────────────────────────────

function SessionsSection({ sessions, loading, selected, onSelect, onRefresh, onLoadMore, hasMore }: {
  sessions: SessionEntry[]
  loading: boolean
  selected: SessionEntry | null
  onSelect: (s: SessionEntry) => void
  onRefresh: () => void
  onLoadMore: () => void
  hasMore: boolean
}) {
  const insights = useMemo(() => {
    const now = Date.now()
    const dayAgo = now - 86_400_000
    const weekAgo = now - 7 * 86_400_000
    return {
      total: sessions.length,
      today: sessions.filter(s => s.timestamp >= dayAgo).length,
      week: sessions.filter(s => s.timestamp >= weekAgo).length,
      live: sessions.filter(s => s.isLive).length,
      projects: new Set(sessions.map(s => s.project)).size,
      prompts: sessions.reduce((n, s) => n + s.promptCount, 0),
    }
  }, [sessions])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {!loading && sessions.length > 0 && (
        <div className="px-4 pt-3 pb-1 flex-shrink-0 flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <TileRow>
              <Tile value={insights.total} label="Sessions" />
              <Tile value={insights.today} label="Today" color="text-[var(--c-accent)]" />
              <Tile value={insights.week} label="This week" />
              <Tile value={insights.live} label="Live" color={insights.live > 0 ? 'text-emerald-400' : 'text-[var(--c-text-3)]'} />
              <Tile value={insights.projects} label="Projects" />
              <Tile value={insights.prompts} label="Prompts" color="text-amber-400" />
            </TileRow>
          </div>
          <RefreshButton onClick={onRefresh} busy={loading} />
        </div>
      )}
      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 shrink-0 border-r border-[var(--c-border)] flex flex-col overflow-hidden">
          <SessionList sessions={sessions} onSelect={onSelect} loading={loading} onLoadMore={onLoadMore} hasMore={hasMore} />
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
    </div>
  )
}
