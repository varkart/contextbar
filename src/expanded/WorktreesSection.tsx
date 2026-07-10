import { useState, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { RepoWorktrees, WorktreeInfo, SessionEntry } from '../types'

export type WorktreeStatus = 'active' | 'stale' | 'abandoned' | 'primary'

const DAY = 86_400_000

export function worktreeStatus(wt: WorktreeInfo): WorktreeStatus {
  if (wt.isPrimary) return 'primary'
  const ts = (wt.lastCommitTs ?? 0) * 1000
  const age = Date.now() - ts
  if (age < 7 * DAY) return 'active'
  if (age < 30 * DAY) return 'stale'
  return 'abandoned'
}

export function isSafeToDelete(wt: WorktreeInfo): boolean {
  return !wt.isPrimary && wt.isMerged && !wt.isDirty
}

function relativeTime(tsSec?: number): string {
  if (!tsSec) return '—'
  const diff = Date.now() - tsSec * 1000
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / DAY)
  if (mins < 60) return mins < 1 ? 'just now' : `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

const STATUS_DOT: Record<WorktreeStatus, string> = {
  active: 'bg-emerald-400',
  stale: 'bg-amber-400',
  abandoned: 'bg-rose-400',
  primary: 'bg-[var(--c-accent)]',
}

type Filter = 'all' | 'active' | 'stale' | 'abandoned' | 'safe'

interface WorktreesSectionProps {
  repos: RepoWorktrees[]
  loading: boolean
  sessions: SessionEntry[]
  onRemoved: () => void
}

export default function WorktreesSection({ repos, loading, sessions, onRemoved }: WorktreesSectionProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const allWts = useMemo(() => repos.flatMap(r => r.worktrees), [repos])
  const counts = useMemo(() => ({
    active: allWts.filter(w => worktreeStatus(w) === 'active').length,
    stale: allWts.filter(w => worktreeStatus(w) === 'stale').length,
    abandoned: allWts.filter(w => worktreeStatus(w) === 'abandoned').length,
    safe: allWts.filter(isSafeToDelete).length,
  }), [allWts])

  const matches = (wt: WorktreeInfo, repo: RepoWorktrees): boolean => {
    const st = worktreeStatus(wt)
    if (filter === 'safe' && !isSafeToDelete(wt)) return false
    if ((filter === 'active' || filter === 'stale' || filter === 'abandoned') && st !== filter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!(wt.branch ?? '').toLowerCase().includes(q) && !repo.repoName.toLowerCase().includes(q)) return false
    }
    return true
  }

  const sessionsFor = (wt: WorktreeInfo) =>
    sessions.filter(s => s.project === wt.path).slice(0, 3)

  const handleResume = async (wt: WorktreeInfo) => {
    const linked = sessions.filter(s => s.project === wt.path)
    const cmd = linked.length
      ? `cd "${wt.path}" && claude --resume ${linked[0].sessionId}`
      : `cd "${wt.path}" && claude`
    try {
      await navigator.clipboard.writeText(cmd)
      setCopied(wt.path)
      setTimeout(() => setCopied(null), 1500)
    } catch { /* clipboard requires focus */ }
  }

  const handleRemove = async (repo: RepoWorktrees, wt: WorktreeInfo) => {
    setRemoving(true)
    setRemoveError(null)
    try {
      await invoke('remove_worktree', { repoPath: repo.repoPath, worktreePath: wt.path })
      setConfirmDelete(null)
      onRemoved()
    } catch (e) {
      setRemoveError(String(e))
    } finally {
      setRemoving(false)
    }
  }

  const visibleRepos = repos
    .map(r => ({ repo: r, items: r.worktrees.filter(w => matches(w, r)) }))
    .filter(g => g.items.length > 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-3 flex-shrink-0">
        <h2 className="text-[16px] font-semibold tracking-tight">Worktrees</h2>
        <p className="text-[12px] text-[var(--c-text-3)] mt-0.5">
          Every checkout across your repos, in one place
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {/* Search + filter pills */}
        <div className="flex gap-2 items-center flex-wrap mb-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by branch or repo…"
            className="flex-1 min-w-[200px] bg-[var(--c-surface-2)] border border-[var(--c-border)] rounded-lg px-3 py-1.5 text-[12px] text-[var(--c-text)] placeholder:text-[var(--c-text-3)] outline-none focus:border-[var(--c-accent)]/50 transition-colors"
          />
          {(['all', 'active', 'stale', 'abandoned', 'safe'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors capitalize ${filter === f ? 'border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
            >
              {f === 'safe' ? 'Safe to delete' : f}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2.5 mb-3">
          {([['Active', counts.active, 'text-emerald-400'], ['Stale', counts.stale, 'text-amber-400'], ['Abandoned', counts.abandoned, 'text-rose-400']] as const).map(([lbl, n, color]) => (
            <div key={lbl} className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 px-4 py-3 text-center">
              <div className={`text-[18px] font-semibold tabular-nums ${color}`}>{n}</div>
              <div className="text-[10px] text-[var(--c-text-3)] uppercase tracking-wider mt-0.5">{lbl}</div>
            </div>
          ))}
        </div>

        {/* Cleanup banner */}
        {counts.safe > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 mb-4">
            <p className="text-[12px]">
              <span className="text-emerald-400 font-semibold">{counts.safe}</span>{' '}
              worktree{counts.safe > 1 ? 's are' : ' is'} merged and clean — safe to delete
            </p>
            <button
              onClick={() => setFilter('safe')}
              className="text-[11px] px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors font-medium"
            >
              Review
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="w-4 h-4 border-2 border-[var(--c-accent)]/40 border-t-[var(--c-accent)] rounded-full animate-spin" />
          </div>
        )}

        {!loading && visibleRepos.length === 0 && (
          <p className="text-[12px] text-[var(--c-text-3)] text-center py-10">
            {allWts.length === 0
              ? 'No git repos found in your session history yet'
              : 'No worktrees match this filter'}
          </p>
        )}

        {/* Repo groups */}
        {visibleRepos.map(({ repo, items }) => (
          <div key={repo.repoPath} className="mb-5">
            <div className="text-[10px] font-mono text-[var(--c-text-3)] uppercase tracking-wider mb-2">
              {repo.repoName} <span className="opacity-60">· {items.length} · base {repo.baseBranch}</span>
            </div>
            <div className="space-y-1.5">
              {items.map(wt => {
                const st = worktreeStatus(wt)
                const isOpen = expanded === wt.path
                const linked = sessionsFor(wt)
                return (
                  <div
                    key={wt.path}
                    className={`rounded-xl border transition-colors ${isOpen ? 'border-[var(--c-accent)]/50' : 'border-[var(--c-border)] hover:border-[var(--c-text-3)]/40'} bg-[var(--c-surface-2)]/40`}
                  >
                    <button
                      onClick={() => setExpanded(isOpen ? null : wt.path)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[st]} ${st === 'active' ? 'animate-pulse' : ''}`} />
                          <span className="text-[13px] font-mono font-semibold truncate">
                            {wt.branch ?? (wt.isDetached ? 'detached HEAD' : '?')}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--c-text-3)] mt-0.5 ml-4">
                          {relativeTime(wt.lastCommitTs)}
                          {linked.length > 0 && <> · {linked.length} session{linked.length > 1 ? 's' : ''}</>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {wt.isPrimary && <Badge tone="accent">primary</Badge>}
                        {isSafeToDelete(wt) && <Badge tone="ok">safe</Badge>}
                        {wt.isDirty && <Badge tone="warn">uncommitted</Badge>}
                        {!wt.isPrimary && !wt.isMerged && wt.ahead > 0 && <Badge tone="accent">↑{wt.ahead}</Badge>}
                        {wt.behind > 0 && <Badge tone="muted">↓{wt.behind}</Badge>}
                        <span className={`text-[var(--c-text-3)] text-[12px] transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4 border-t border-[var(--c-border)] pt-3">
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <DetailCell k="Last active" v={relativeTime(wt.lastCommitTs)} />
                          <DetailCell k="Ahead / behind" v={`↑${wt.ahead} ↓${wt.behind}`} />
                          <DetailCell k="Status" v={wt.isPrimary ? 'primary checkout' : wt.isMerged ? 'merged' : st} />
                        </div>
                        {wt.lastCommitSubject && (
                          <p className="text-[11px] font-mono text-[var(--c-text-3)] mb-3 truncate" title={wt.lastCommitSubject}>
                            {wt.lastCommitSubject}
                          </p>
                        )}
                        <div className="flex gap-2 mb-3">
                          <button
                            onClick={() => handleResume(wt)}
                            className={`text-[11px] px-3 py-1.5 rounded-md font-medium transition-colors ${copied === wt.path ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[var(--c-accent)]/15 text-[var(--c-accent)] hover:bg-[var(--c-accent)]/25'}`}
                          >
                            {copied === wt.path ? '✓ Copied' : '⏎ Resume'}
                          </button>
                          <button
                            onClick={() => invoke('reveal_in_finder', { path: wt.path }).catch(() => {})}
                            className="text-[11px] px-3 py-1.5 rounded-md border border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
                          >
                            Reveal in Finder
                          </button>
                          {isSafeToDelete(wt) && confirmDelete !== wt.path && (
                            <button
                              onClick={() => { setConfirmDelete(wt.path); setRemoveError(null) }}
                              className="text-[11px] px-3 py-1.5 rounded-md border border-[var(--c-border)] text-rose-400/80 hover:text-rose-400 hover:border-rose-400/40 transition-colors"
                            >
                              Delete
                            </button>
                          )}
                          {confirmDelete === wt.path && (
                            <>
                              <button
                                disabled={removing}
                                onClick={() => handleRemove(repo, wt)}
                                className="text-[11px] px-3 py-1.5 rounded-md bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition-colors font-medium disabled:opacity-50"
                              >
                                {removing ? 'Removing…' : 'Confirm delete'}
                              </button>
                              <button
                                disabled={removing}
                                onClick={() => setConfirmDelete(null)}
                                className="text-[11px] px-3 py-1.5 rounded-md border border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                        {removeError && confirmDelete === wt.path && (
                          <p className="text-[11px] text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2 mb-3">{removeError}</p>
                        )}
                        {linked.length > 0 && (
                          <div className="space-y-1.5">
                            {linked.map(s => (
                              <div key={s.sessionId} className="text-[11px] border-b border-[var(--c-border)]/50 last:border-0 pb-1.5 last:pb-0">
                                <span className="text-[var(--c-text)] font-medium line-clamp-1">{s.display}</span>
                                <span className="text-[var(--c-text-3)]">
                                  {relativeTime(Math.floor(s.timestamp / 1000))}{s.model ? ` · ${s.model}` : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'accent' | 'muted'; children: React.ReactNode }) {
  const cls =
    tone === 'ok' ? 'bg-emerald-500/15 text-emerald-400' :
    tone === 'warn' ? 'bg-amber-500/15 text-amber-400' :
    tone === 'accent' ? 'bg-[var(--c-accent)]/15 text-[var(--c-accent)]' :
    'bg-[var(--c-surface-2)] text-[var(--c-text-3)]'
  return <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{children}</span>
}

function DetailCell({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-[var(--c-surface-2)] px-3 py-2">
      <div className="text-[12.5px] font-mono font-semibold">{v}</div>
      <div className="text-[9.5px] text-[var(--c-text-3)] uppercase tracking-wider mt-0.5">{k}</div>
    </div>
  )
}
