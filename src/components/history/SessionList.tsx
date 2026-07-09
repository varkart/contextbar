import { useState, useMemo } from 'react'
import type { SessionEntry } from '../../types'
import { formatTokens, tokenBadgeColor } from './SessionStats'

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
}

function SessionRow({ session, onSelect }: SessionRowProps) {
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
            <span className="text-[10px] text-[var(--c-text-3)] truncate max-w-[100px]">
              {session.projectName}
            </span>
            <span className="text-[10px] text-[var(--c-text-3)] opacity-40">·</span>
            <span className="text-[10px] text-[var(--c-text-3)] flex-shrink-0">
              {relativeTime(session.timestamp)}
            </span>
            {session.errorCount > 0 && (
              <>
                <span className="text-[10px] text-[var(--c-text-3)] opacity-40">·</span>
                <span className="text-[10px] text-rose-400 flex-shrink-0">
                  {session.errorCount} err
                </span>
              </>
            )}
          </div>
        </div>

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
}

export default function SessionList({ sessions, onSelect, loading }: SessionListProps) {
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let result = sessions
    if (projectFilter) {
      result = result.filter(s => s.project === projectFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(s => s.display.toLowerCase().includes(q) || s.projectName.toLowerCase().includes(q))
    }
    return result
  }, [sessions, search, projectFilter])

  const groups = useMemo(() => groupByTime(filtered), [filtered])

  // Unique projects for filter pills
  const projects = useMemo(() => {
    const seen = new Set<string>()
    const out: { project: string; name: string }[] = []
    for (const s of sessions) {
      if (!seen.has(s.project)) {
        seen.add(s.project)
        out.push({ project: s.project, name: s.projectName })
      }
    }
    return out.slice(0, 8)
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
                className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${projectFilter === p.project ? 'border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
              >
                {p.name}
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
        {!loading && groups.length === 0 && (
          <div className="px-3 py-8 text-center">
            <p className="text-[12px] text-[var(--c-text-3)]">
              {search || projectFilter ? 'No sessions match' : 'No Claude sessions found'}
            </p>
            {!search && !projectFilter && (
              <p className="text-[11px] text-[var(--c-text-3)] opacity-60 mt-1">
                Start a session with <code className="font-mono">claude</code> in your terminal
              </p>
            )}
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
              <SessionRow key={session.sessionId} session={session} onSelect={onSelect} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
