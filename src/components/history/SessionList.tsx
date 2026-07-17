import { useState, useMemo, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { SessionEntry, SessionMeta, TranscriptMatch } from '../../types'
import { formatTokens, tokenBadgeColor } from './SessionStats'
import AgentBadge from './AgentBadge'

// FTS snippet() wraps matched terms in \u0001…\u0002 marker bytes.
const MARK_START = '\u0001'
const MARK_END = '\u0002'

function Snippet({ text }: { text: string }) {
  const parts = text.split(/([\u0001\u0002])/)
  let inMark = false
  return (
    <p className="text-[11px] text-[var(--c-text-3)] line-clamp-2 leading-snug mt-1">
      {parts.map((p, i) => {
        if (p === MARK_START) { inMark = true; return null }
        if (p === MARK_END) { inMark = false; return null }
        if (!p) return null
        return inMark
          ? <mark key={i} className="bg-[var(--c-accent)]/20 text-[var(--c-accent)] rounded-sm px-0.5">{p}</mark>
          : <span key={i}>{p}</span>
      })}
    </p>
  )
}

function matchToEntry(m: TranscriptMatch): SessionEntry {
  return {
    agent: m.agent,
    sessionId: m.sessionId,
    display: m.display || '(no prompt)',
    timestamp: m.timestamp,
    project: m.project,
    projectName: m.projectName,
    totalTokens: m.totalTokens,
    isLive: false,
    errorCount: 0,
    promptCount: 1,
  }
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function groupByTime(entries: SessionEntry[]): { label: string; items: SessionEntry[] }[] {
  const now = Date.now()
  const groups: { label: string; items: SessionEntry[] }[] = []
  const live: SessionEntry[] = []
  const today: SessionEntry[] = []
  const thisWeek: SessionEntry[] = []
  const older: SessionEntry[] = []

  for (const e of entries) {
    const diff = now - e.timestamp
    if (e.isLive) {
      live.push(e)
    } else if (diff < 86_400_000) {
      today.push(e)
    } else if (diff < 7 * 86_400_000) {
      thisWeek.push(e)
    } else {
      older.push(e)
    }
  }

  if (live.length) groups.push({ label: 'Live', items: live })
  if (today.length) groups.push({ label: 'Today', items: today })
  if (thisWeek.length) groups.push({ label: 'This Week', items: thisWeek })
  if (older.length) groups.push({ label: 'Earlier', items: older })

  return groups
}

interface SessionRowProps {
  session: SessionEntry
  onSelect: (s: SessionEntry) => void
  /** Transcript extract shown under the meta row (deep-search hits). */
  snippet?: string
  pinned?: boolean
  tags?: string[]
  onTogglePin?: (s: SessionEntry, pinned: boolean) => void
}

function SessionRow({ session, onSelect, snippet, pinned, tags, onTogglePin }: SessionRowProps) {
  const totalTokens = session.totalTokens

  return (
    <button
      onClick={() => onSelect(session)}
      className="w-full text-left px-3 py-2.5 hover:bg-[var(--c-surface-2)] transition-colors border-b border-[var(--c-border)]/50 last:border-0 group"
    >
      <div className="flex items-start gap-2">
        {/* Live pulse or spacer */}
        <div className="flex-shrink-0 mt-1.5">
          {session.isLive ? (
            <span className="block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          ) : (
            <span className="block w-1.5 h-1.5 rounded-full bg-[var(--c-border)]" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* First prompt */}
          <p className="text-[12px] text-[var(--c-text)] line-clamp-2 leading-snug group-hover:text-[var(--c-text)]">
            {session.display}
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1">
            <AgentBadge agent={session.agent} />
            <span
              className="text-[10px] text-[var(--c-text-3)] truncate max-w-[120px]"
              title={session.project}
            >
              {session.projectName}
            </span>
            <span className="text-[10px] text-[var(--c-text-3)] opacity-40">·</span>
            <span className="text-[10px] text-[var(--c-text-3)] flex-shrink-0">
              {relativeTime(session.timestamp)}
            </span>
            {session.promptCount > 1 && (
              <>
                <span className="text-[10px] text-[var(--c-text-3)] opacity-40">·</span>
                <span className="text-[10px] text-[var(--c-text-3)] flex-shrink-0">
                  {session.promptCount} prompts
                </span>
              </>
            )}
            {session.errorCount > 0 && (
              <>
                <span className="text-[10px] text-[var(--c-text-3)] opacity-40">·</span>
                <span className="text-[10px] text-rose-400 flex-shrink-0">
                  {session.errorCount} err
                </span>
              </>
            )}
            {tags?.map(t => (
              <span
                key={t}
                className="text-[9px] px-1.5 py-px rounded-full bg-[var(--c-accent)]/10 text-[var(--c-accent)] flex-shrink-0"
              >
                {t}
              </span>
            ))}
          </div>

          {snippet && <Snippet text={snippet} />}
        </div>

        {/* Pin toggle — span, not button: rows are already <button>s */}
        {onTogglePin && (
          <span
            role="button"
            tabIndex={0}
            title={pinned ? 'Unpin session' : 'Pin session'}
            onClick={e => { e.stopPropagation(); onTogglePin(session, !pinned) }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onTogglePin(session, !pinned)
              }
            }}
            className={`flex-shrink-0 text-[12px] leading-none mt-0.5 transition-opacity ${pinned ? 'text-amber-400' : 'text-[var(--c-text-3)] opacity-0 group-hover:opacity-60 hover:!opacity-100'}`}
          >
            {pinned ? '★' : '☆'}
          </span>
        )}

        {/* Token badge */}
        {totalTokens > 0 && (
          <div className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium tabular-nums ${tokenBadgeColor(totalTokens)}`}>
            {formatTokens(totalTokens)}
          </div>
        )}
      </div>
    </button>
  )
}

interface SessionListProps {
  sessions: SessionEntry[]
  onSelect: (s: SessionEntry) => void
  loading: boolean
  /** When set and hasMore, a "Load more" button appears after the last group. */
  onLoadMore?: () => void
  hasMore?: boolean
}

export default function SessionList({ sessions, onSelect, loading, onLoadMore, hasMore }: SessionListProps) {
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState<string | null>(null)
  const [agentFilter, setAgentFilter] = useState<string | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  // Pins and tags, keyed by session id.
  const [meta, setMeta] = useState<Record<string, SessionMeta>>({})
  useEffect(() => {
    invoke<SessionMeta[]>('get_session_meta')
      .then(rows => setMeta(Object.fromEntries(rows.map(m => [m.sessionId, m]))))
      .catch(() => {})
  }, [sessions])

  const togglePin = useCallback((s: SessionEntry, pinned: boolean) => {
    setMeta(prev => ({
      ...prev,
      [s.sessionId]: { sessionId: s.sessionId, tags: prev[s.sessionId]?.tags ?? [], pinned },
    }))
    invoke('set_session_pinned', { sessionId: s.sessionId, pinned }).catch(() => {
      setMeta(prev => ({
        ...prev,
        [s.sessionId]: { sessionId: s.sessionId, tags: prev[s.sessionId]?.tags ?? [], pinned: !pinned },
      }))
    })
  }, [])

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    for (const m of Object.values(meta)) for (const t of m.tags) tags.add(t)
    return [...tags].sort()
  }, [meta])

  const agents = useMemo(() => [...new Set(sessions.map(s => s.agent))].sort(), [sessions])

  const filtered = useMemo(() => {
    let result = sessions
    if (agentFilter) {
      result = result.filter(s => s.agent === agentFilter)
    }
    if (projectFilter) {
      result = result.filter(s => s.project === projectFilter)
    }
    if (tagFilter) {
      result = result.filter(s => meta[s.sessionId]?.tags.includes(tagFilter))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(s => s.display.toLowerCase().includes(q) || s.projectName.toLowerCase().includes(q))
    }
    return result
  }, [sessions, search, projectFilter, agentFilter, tagFilter, meta])

  // Pinned sessions float above the time groups.
  const pinned = useMemo(
    () => filtered.filter(s => meta[s.sessionId]?.pinned),
    [filtered, meta]
  )
  const groups = useMemo(
    () => groupByTime(filtered.filter(s => !meta[s.sessionId]?.pinned)),
    [filtered, meta]
  )

  // Deep search: debounced FTS lookup over full transcripts (all agents).
  const [transcriptHits, setTranscriptHits] = useState<TranscriptMatch[]>([])
  useEffect(() => {
    const q = search.trim()
    if (q.length < 2) {
      setTranscriptHits([])
      return
    }
    let stale = false
    const t = setTimeout(() => {
      invoke<TranscriptMatch[]>('search_transcripts', { query: q, limit: 50 })
        .then(hits => { if (!stale) setTranscriptHits(hits) })
        .catch(() => { if (!stale) setTranscriptHits([]) })
    }, 250)
    return () => { stale = true; clearTimeout(t) }
  }, [search])

  // Transcript-only matches: hide sessions the shallow filter already shows,
  // and respect the active agent/project pills.
  const deepHits = useMemo(() => {
    if (!search.trim()) return []
    const shown = new Set(filtered.map(s => s.sessionId))
    return transcriptHits.filter(h =>
      !shown.has(h.sessionId)
      && (!agentFilter || h.agent === agentFilter)
      && (!projectFilter || h.project === projectFilter)
      && (!tagFilter || meta[h.sessionId]?.tags.includes(tagFilter))
    )
  }, [transcriptHits, filtered, search, agentFilter, projectFilter, tagFilter, meta])

  // Unique projects for filter pills — disambiguate same-name dirs with parent
  const projects = useMemo(() => {
    const seen = new Set<string>()
    const out: { project: string; name: string; label: string }[] = []
    for (const s of sessions) {
      if (!seen.has(s.project)) {
        seen.add(s.project)
        out.push({ project: s.project, name: s.projectName, label: s.projectName })
      }
    }
    // If two entries share the same projectName, add parent dir to label
    const nameCounts: Record<string, number> = {}
    for (const p of out) nameCounts[p.name] = (nameCounts[p.name] ?? 0) + 1
    for (const p of out) {
      if (nameCounts[p.name] > 1) {
        const parts = p.project.split('/')
        const parent = parts[parts.length - 2] ?? ''
        p.label = parent ? `${parent}/${p.name}` : p.name
      }
    }
    return out.slice(0, 10)
  }, [sessions])

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 pt-2 pb-1.5 flex-shrink-0">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search sessions…"
          className="w-full bg-[var(--c-surface-2)] border border-[var(--c-border)] rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--c-text)] placeholder:text-[var(--c-text-3)] outline-none focus:border-[var(--c-accent)]/50 transition-colors"
        />
      </div>

      {/* Agent filter pills — only when more than one agent has sessions */}
      {agents.length > 1 && (
        <div className="px-3 pb-1.5 flex-shrink-0">
          <div className="flex gap-1">
            <button
              onClick={() => setAgentFilter(null)}
              className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${!agentFilter ? 'border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
            >
              All agents
            </button>
            {agents.map(a => (
              <button
                key={a}
                onClick={() => setAgentFilter(agentFilter === a ? null : a)}
                className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full border capitalize transition-colors ${agentFilter === a ? 'border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tag filter pills — only when the user has tagged sessions */}
      {allTags.length > 0 && (
        <div className="px-3 pb-1.5 flex-shrink-0">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {allTags.map(t => (
              <button
                key={t}
                onClick={() => setTagFilter(tagFilter === t ? null : t)}
                className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${tagFilter === t ? 'border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
              >
                #{t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Project filter pills */}
      {projects.length > 1 && (
        <div className="px-3 pb-1.5 flex-shrink-0">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setProjectFilter(null)}
              className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${!projectFilter ? 'border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
            >
              All
            </button>
            {projects.map(p => (
              <button
                key={p.project}
                onClick={() => setProjectFilter(projectFilter === p.project ? null : p.project)}
                title={p.project}
                className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${projectFilter === p.project ? 'border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-20">
            <div className="w-4 h-4 border-2 border-[var(--c-accent)]/40 border-t-[var(--c-accent)] rounded-full animate-spin" />
          </div>
        )}
        {!loading && groups.length === 0 && pinned.length === 0 && deepHits.length === 0 && (
          <div className="px-3 py-8 text-center">
            <p className="text-[12px] text-[var(--c-text-3)]">
              {search || projectFilter || tagFilter ? 'No sessions match' : 'No Claude sessions found'}
            </p>
            {!search && !projectFilter && !tagFilter && (
              <p className="text-[11px] text-[var(--c-text-3)] opacity-60 mt-1">
                Start a session with <code className="font-mono">claude</code> in your terminal
              </p>
            )}
          </div>
        )}
        {pinned.length > 0 && (
          <div>
            <div className="px-3 py-1 bg-[var(--c-surface-2)]/50">
              <span className="text-[10px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider">
                Pinned
              </span>
            </div>
            {pinned.map(session => (
              <SessionRow
                key={session.sessionId}
                session={session}
                onSelect={onSelect}
                pinned
                tags={meta[session.sessionId]?.tags}
                onTogglePin={togglePin}
              />
            ))}
          </div>
        )}
        {groups.map(group => (
          <div key={group.label}>
            <div className="px-3 py-1 bg-[var(--c-surface-2)]/50">
              <span className="text-[10px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider">
                {group.label}
              </span>
            </div>
            {group.items.map(session => (
              <SessionRow
                key={session.sessionId}
                session={session}
                onSelect={onSelect}
                pinned={false}
                tags={meta[session.sessionId]?.tags}
                onTogglePin={togglePin}
              />
            ))}
          </div>
        ))}
        {deepHits.length > 0 && (
          <div>
            <div className="px-3 py-1 bg-[var(--c-surface-2)]/50">
              <span className="text-[10px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider">
                In transcripts
              </span>
            </div>
            {deepHits.map(hit => (
              <SessionRow
                key={hit.sessionId}
                session={matchToEntry(hit)}
                onSelect={onSelect}
                snippet={hit.snippet}
              />
            ))}
          </div>
        )}
        {!loading && onLoadMore && hasMore && !search && !projectFilter && !agentFilter && !tagFilter && (
          <div className="p-3">
            <button
              onClick={onLoadMore}
              className="w-full text-[11px] py-1.5 rounded-lg border border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] hover:border-[var(--c-text-3)]/50 transition-colors"
            >
              Load 300 more
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
