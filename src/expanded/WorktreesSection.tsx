import { useState, useEffect, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { RepoWorktrees, WorktreeInfo, SessionEntry, SessionInsights, RepoMeta } from '../types'
import { formatTokens } from '../components/history/SessionStats'
import { Tile, TileRow } from './InsightTiles'
import { HBar, RefreshButton, shortModel, SkeletonCards } from './InsightWidgets'
import AgentBadge from '../components/history/AgentBadge'
import RepoAgentConfigView from '../components/RepoAgentConfigView'

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

const REPO_COLORS = ['#6366f1', '#e8a94a', '#d98fd9', '#2dd4bf', '#fb7185', '#8fbf6b', '#7aa2e8']

function repoColor(name: string): string {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return REPO_COLORS[h % REPO_COLORS.length]
}

const STATUS_DOT: Record<WorktreeStatus, string> = {
  active: 'bg-emerald-400',
  stale: 'bg-amber-400',
  abandoned: 'bg-rose-400',
  primary: 'bg-[var(--c-accent)]',
}

type Filter = 'all' | 'active' | 'stale' | 'abandoned' | 'dirty' | 'safe'

/** Inline free-form note on a repo or worktree, persisted via set_repo_notes.
 *  Repo notes and branch notes are visually distinct so they never read as
 *  the same thing. */
function NotesEditor({ path, notes, variant, onSaved }: {
  path: string
  notes: string | null
  variant: 'repo' | 'branch'
  onSaved: (n: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const isRepo = variant === 'repo'
  const chip = isRepo
    ? 'bg-indigo-500/15 text-indigo-400'
    : 'bg-teal-500/15 text-teal-400'
  const borderTone = isRepo ? 'border-l-indigo-400/60' : 'border-l-teal-400/60'
  const label = isRepo ? 'REPO NOTE' : 'BRANCH NOTE'

  const save = () => {
    const clean = draft.trim() || null
    setEditing(false)
    if (clean === notes) return
    onSaved(clean)
    invoke('set_repo_notes', { path, notes: clean }).catch(() => {})
  }

  if (editing) {
    return (
      <div>
        <span className={`inline-block text-[8.5px] font-semibold tracking-wider px-1.5 py-px rounded mb-1 ${chip}`}>{label}</span>
        <textarea
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') setEditing(false)
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
          }}
          onBlur={save}
          rows={3}
          maxLength={2000}
          placeholder={isRepo ? 'Note about this repo… (⌘↵ save, Esc cancel)' : 'Note about this branch/worktree… (⌘↵ save, Esc cancel)'}
          className="w-full bg-[var(--c-surface-2)] border border-[var(--c-accent)]/40 rounded-lg px-2.5 py-1.5 text-[11.5px] text-[var(--c-text)] outline-none resize-y leading-relaxed"
        />
      </div>
    )
  }

  if (notes) {
    return (
      <button
        onClick={() => { setDraft(notes); setEditing(true) }}
        title="Edit note"
        className={`w-full text-left rounded-lg border border-[var(--c-border)]/60 border-l-2 ${borderTone} bg-[var(--c-surface-2)]/40 px-2.5 py-1.5 hover:border-[var(--c-text-3)]/40 transition-colors`}
      >
        <span className={`inline-block text-[8.5px] font-semibold tracking-wider px-1.5 py-px rounded mr-1.5 align-middle ${chip}`}>{label}</span>
        <span className="text-[11.5px] text-[var(--c-text-2)] whitespace-pre-wrap leading-relaxed line-clamp-3 align-middle">{notes}</span>
      </button>
    )
  }

  return (
    <button
      onClick={() => { setDraft(''); setEditing(true) }}
      className="text-[10.5px] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
    >
      📝 {isRepo ? 'Add repo note' : 'Add branch note'}
    </button>
  )
}

interface WorktreesSectionProps {
  repos: RepoWorktrees[]
  loading: boolean
  sessions: SessionEntry[]
  onRemoved: () => void
  onRefresh: () => void | Promise<unknown>
  onOpenSession: (s: SessionEntry) => void
  onViewSessions: (repo: RepoWorktrees) => void
  showToast: (type: 'success' | 'error', message: string) => void
}

export default function WorktreesSection({ repos, loading, sessions, onRemoved, onRefresh, onOpenSession, onViewSessions, showToast }: WorktreesSectionProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  // Per-repo usage insights, fetched lazily on first toggle. 'loading' while in flight.
  const [repoInsights, setRepoInsights] = useState<Record<string, SessionInsights | 'loading'>>({})
  const [insightsOpen, setInsightsOpen] = useState<Record<string, boolean>>({})
  // Repo cards start collapsed; searching or filtering opens matches.
  const [repoOpen, setRepoOpen] = useState<Record<string, boolean>>({})
  const [vscodeAvailable, setVscodeAvailable] = useState(false)
  // User-chosen repo display names + notes, keyed by repo/worktree path.
  const [repoNames, setRepoNames] = useState<Record<string, string>>({})
  const [pathNotes, setPathNotes] = useState<Record<string, string>>({})
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  useEffect(() => {
    invoke<boolean>('is_vscode_installed').then(setVscodeAvailable).catch(() => {})
  }, [])

  useEffect(() => {
    invoke<RepoMeta[]>('get_repo_meta')
      .then(rows => {
        setRepoNames(Object.fromEntries(
          rows.filter(r => r.customName).map(r => [r.repoPath, r.customName as string])
        ))
        setPathNotes(Object.fromEntries(
          rows.filter(r => r.notes).map(r => [r.repoPath, r.notes as string])
        ))
      })
      .catch(() => {})
  }, [repos])

  const saveNote = (path: string) => (n: string | null) =>
    setPathNotes(prev => {
      const out = { ...prev }
      if (n) out[path] = n
      else delete out[path]
      return out
    })

  const displayName = (repo: RepoWorktrees) => repoNames[repo.repoPath] ?? repo.repoName

  const saveRename = (repo: RepoWorktrees) => {
    const clean = renameDraft.trim()
    setRenaming(null)
    const current = repoNames[repo.repoPath] ?? null
    const next = clean && clean !== repo.repoName ? clean : null
    if (next === current) return
    setRepoNames(prev => {
      const out = { ...prev }
      if (next) out[repo.repoPath] = next
      else delete out[repo.repoPath]
      return out
    })
    invoke('set_repo_name', { repoPath: repo.repoPath, name: next }).catch(() => {})
  }

  const forceOpen = filter !== 'all' || !!search.trim()
  const isRepoOpen = (repoPath: string) => forceOpen || !!repoOpen[repoPath]

  const toggleRepoInsights = (repo: RepoWorktrees) => {
    const key = repo.repoPath
    const opening = !insightsOpen[key]
    setInsightsOpen(prev => ({ ...prev, [key]: opening }))
    if (opening && repoInsights[key] === undefined) {
      setRepoInsights(prev => ({ ...prev, [key]: 'loading' }))
      invoke<SessionInsights>('get_session_insights', {
        sinceMs: Date.now() - 30 * 86_400_000,
        projects: repo.worktrees.map(w => w.path),
      })
        .then(ins => setRepoInsights(prev => ({ ...prev, [key]: ins })))
        .catch(() => setRepoInsights(prev => {
          const next = { ...prev }
          delete next[key]
          return next
        }))
    }
  }

  const allWts = useMemo(() => repos.flatMap(r => r.worktrees), [repos])
  const counts = useMemo(() => ({
    repos: repos.length,
    active: allWts.filter(w => worktreeStatus(w) === 'active').length,
    stale: allWts.filter(w => worktreeStatus(w) === 'stale').length,
    abandoned: allWts.filter(w => worktreeStatus(w) === 'abandoned').length,
    dirty: allWts.filter(w => w.isDirty).length,
    safe: allWts.filter(isSafeToDelete).length,
  }), [repos, allWts])

  const matches = (wt: WorktreeInfo, repo: RepoWorktrees): boolean => {
    const st = worktreeStatus(wt)
    if (filter === 'safe' && !isSafeToDelete(wt)) return false
    if (filter === 'dirty' && !wt.isDirty) return false
    if ((filter === 'active' || filter === 'stale' || filter === 'abandoned') && st !== filter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const alias = repoNames[repo.repoPath]?.toLowerCase() ?? ''
      if (
        !(wt.branch ?? '').toLowerCase().includes(q)
        && !repo.repoName.toLowerCase().includes(q)
        && !alias.includes(q)
      ) return false
    }
    return true
  }

  const sessionsFor = (wt: WorktreeInfo) =>
    sessions.filter(s => s.project === wt.path).slice(0, 3)

  const handleResume = async (wt: WorktreeInfo) => {
    const linked = sessions.filter(s => s.project === wt.path)
    try {
      await invoke('resume_in_terminal', {
        project: wt.path,
        sessionId: linked.length ? linked[0].sessionId : null,
        agent: linked.length ? linked[0].agent : null,
      })
      setCopied(wt.path)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      const cmd = linked.length
        ? `cd "${wt.path}" && claude --resume ${linked[0].sessionId}`
        : `cd "${wt.path}" && claude`
      try {
        await navigator.clipboard.writeText(cmd)
        setCopied(wt.path)
        setTimeout(() => setCopied(null), 1500)
      } catch { /* clipboard requires focus */ }
    }
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
      <div className="px-6 pt-5 pb-3 flex-shrink-0 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold tracking-tight">Repos</h2>
          <p className="text-[12px] text-[var(--c-text-3)] mt-0.5">
            Every checkout across your repos, in one place
          </p>
        </div>
        <RefreshButton onClick={onRefresh} busy={loading} />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {/* Search */}
        <div className="flex gap-2 items-center mb-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by branch or repo…"
            className="flex-1 min-w-[200px] bg-[var(--c-surface-2)] border border-[var(--c-border)] rounded-lg px-3 py-1.5 text-[12px] text-[var(--c-text)] placeholder:text-[var(--c-text-3)] outline-none focus:border-[var(--c-accent)]/50 transition-colors"
          />
        </div>

        {/* Status tiles double as filters — click to scope, click again to clear */}
        <TileRow className="mb-3">
          {([
            { f: 'all' as Filter, value: counts.repos, label: 'Repos', color: undefined, hint: 'Show everything' },
            { f: 'active' as Filter, value: counts.active, label: 'Active', color: 'text-emerald-400', hint: 'Commits in the last 7 days' },
            { f: 'stale' as Filter, value: counts.stale, label: 'Stale', color: 'text-amber-400', hint: 'No commits for 7–30 days' },
            { f: 'abandoned' as Filter, value: counts.abandoned, label: 'Abandoned', color: 'text-rose-400', hint: 'No commits for 30+ days' },
            { f: 'dirty' as Filter, value: counts.dirty, label: 'Uncommitted', color: counts.dirty > 0 ? 'text-amber-400' : 'text-[var(--c-text-3)]', hint: 'Worktrees with uncommitted changes' },
            { f: 'safe' as Filter, value: counts.safe, label: 'Safe to delete', color: counts.safe > 0 ? 'text-emerald-400' : 'text-[var(--c-text-3)]', hint: 'Merged into base and clean' },
          ]).map(t => (
            <div key={t.f} className={filter === t.f && t.f !== 'all' ? 'ring-1 ring-[var(--c-accent)] rounded-xl' : ''}>
              <Tile
                value={t.value}
                label={t.label}
                color={t.color}
                hint={t.hint}
                onClick={() => setFilter(filter === t.f ? 'all' : t.f)}
              />
            </div>
          ))}
        </TileRow>

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

        {loading && <SkeletonCards count={4} />}

        {!loading && visibleRepos.length === 0 && (
          <p className="text-[12px] text-[var(--c-text-3)] text-center py-10">
            {allWts.length === 0
              ? 'No git repos found in your session history yet'
              : 'No worktrees match this filter'}
          </p>
        )}

        {/* Repo groups */}
        {visibleRepos.map(({ repo, items }) => {
          const open = isRepoOpen(repo.repoPath)
          return (
          <div key={repo.repoPath} className="mb-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/25 overflow-hidden">
            {/* Repo header — name area toggles, actions live on the right */}
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <button
                onClick={() => setRepoOpen(prev => ({ ...prev, [repo.repoPath]: !open }))}
                aria-expanded={open}
                className="flex items-center gap-3 flex-1 min-w-0 text-left group/repo"
              >
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-[12px] text-black/80 shrink-0"
                  style={{ background: repoColor(repo.repoName) }}
                >
                  {displayName(repo).charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  {renaming === repo.repoPath ? (
                    <input
                      type="text"
                      autoFocus
                      value={renameDraft}
                      onClick={e => e.stopPropagation()}
                      onChange={e => setRenameDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveRename(repo)
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                      onBlur={() => saveRename(repo)}
                      maxLength={80}
                      className="block w-48 bg-[var(--c-surface-2)] border border-[var(--c-accent)]/40 rounded px-1.5 py-0.5 text-[13px] font-semibold text-[var(--c-text)] outline-none"
                    />
                  ) : (
                    <span className="block text-[13.5px] font-semibold truncate group-hover/repo:text-[var(--c-accent)] transition-colors">
                      {displayName(repo)}
                      {repoNames[repo.repoPath] && (
                        <span className="ml-1.5 text-[10px] font-normal font-mono text-[var(--c-text-3)]">({repo.repoName})</span>
                      )}
                    </span>
                  )}
                  <span className="block text-[10.5px] text-[var(--c-text-3)]">
                    {items.length} worktree{items.length > 1 ? 's' : ''} · base {repo.baseBranch}
                  </span>
                </span>
              </button>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => { setRenameDraft(repoNames[repo.repoPath] ?? repo.repoName); setRenaming(repo.repoPath) }}
                  title="Rename repo"
                  aria-label={`Rename ${displayName(repo)}`}
                  className="text-[10px] px-1.5 py-1 rounded-md text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
                >
                  ✎
                </button>
                <button
                  onClick={() => onViewSessions(repo)}
                  title="View all sessions for this repo"
                  className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-md border border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] hover:border-[var(--c-text-3)]/50 transition-colors"
                >
                  ◷ Sessions
                </button>
                <button
                  onClick={() => toggleRepoInsights(repo)}
                  aria-expanded={!!insightsOpen[repo.repoPath]}
                  className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-md border transition-colors ${insightsOpen[repo.repoPath] ? 'border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] hover:border-[var(--c-text-3)]/50'}`}
                >
                  <span className={`text-[8px] transition-transform ${insightsOpen[repo.repoPath] ? 'rotate-90' : ''}`} aria-hidden="true">▶</span>
                  Insights
                </button>
                {vscodeAvailable && (
                  <button
                    onClick={() => invoke('open_in_vscode', { path: repo.repoPath }).catch(() => showToast('error', 'Could not open VS Code'))}
                    title="Open repo in Visual Studio Code"
                    className="text-[10px] px-2.5 py-1 rounded-md border border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] hover:border-[var(--c-text-3)]/50 transition-colors"
                  >
                    VS Code
                  </button>
                )}
                <button
                  onClick={() => setRepoOpen(prev => ({ ...prev, [repo.repoPath]: !open }))}
                  aria-label={open ? 'Collapse repo' : 'Expand repo'}
                  className={`text-[var(--c-text-3)] text-[12px] px-1 transition-transform ${open ? 'rotate-90' : ''}`}
                >
                  ›
                </button>
              </div>
            </div>

            {insightsOpen[repo.repoPath] && (
              <div className="px-3.5">
                <RepoInsights data={repoInsights[repo.repoPath]} />
              </div>
            )}

            {open && (
            <div className="px-3.5 pb-3">
              <div className="mb-2">
                <NotesEditor path={repo.repoPath} notes={pathNotes[repo.repoPath] ?? null} variant="repo" onSaved={saveNote(repo.repoPath)} />
              </div>
              <RepoAgentConfigView repoPath={repo.repoPath} />
              {(repo.agentFiles.length > 0 || repo.repoSkills.length > 0) && (
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  {repo.agentFiles.map(f => (
                    <span key={f} className="text-[9px] font-mono px-1.5 py-px rounded-full border border-[var(--c-border)] text-[var(--c-text-3)]">{f}</span>
                  ))}
                  {repo.repoSkills.length > 0 && (
                    <span
                      className="text-[9px] font-mono px-1.5 py-px rounded-full border border-[var(--c-accent)]/40 text-[var(--c-accent)]"
                      title={repo.repoSkills.join(', ')}
                    >
                      {repo.repoSkills.length} skill{repo.repoSkills.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )}
            {/* Branch map: trunk line down the left, one connector per worktree */}
            <div className="relative pl-5 space-y-1.5">
              <div className="absolute left-[9px] top-1 bottom-5 w-px bg-[var(--c-border)]" aria-hidden="true" />
              {items.map(wt => {
                const st = worktreeStatus(wt)
                const isOpen = expanded === wt.path
                const linked = sessionsFor(wt)
                const statusBorder = isOpen
                  ? 'border-[var(--c-accent)]/50'
                  : st === 'active'
                    ? 'border-emerald-500/30 hover:border-emerald-500/50 shadow-[0_0_14px_rgba(52,211,153,0.07)]'
                    : isSafeToDelete(wt)
                      ? 'border-dashed border-[var(--c-border)] hover:border-[var(--c-text-3)]/40'
                      : 'border-[var(--c-border)] hover:border-[var(--c-text-3)]/40'
                return (
                  <div key={wt.path} className="relative">
                    <div className="absolute -left-[11px] top-[21px] w-[11px] h-px bg-[var(--c-border)]" aria-hidden="true" />
                    <div
                      className={`rounded-xl border transition-colors ${statusBorder} bg-[var(--c-surface-2)]/40`}
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
                        {/* Branch notes are keyed "wt:<path>" — the primary worktree's
                            path equals the repo path, so unprefixed keys would collide
                            with the repo-level note. */}
                        <div className="mb-3">
                          <NotesEditor path={`wt:${wt.path}`} notes={pathNotes[`wt:${wt.path}`] ?? null} variant="branch" onSaved={saveNote(`wt:${wt.path}`)} />
                        </div>
                        <div className="flex gap-2 mb-3">
                          <button
                            onClick={() => handleResume(wt)}
                            title="Resume in Terminal"
                            className={`text-[11px] px-3 py-1.5 rounded-md font-medium transition-colors ${copied === wt.path ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[var(--c-accent)]/15 text-[var(--c-accent)] hover:bg-[var(--c-accent)]/25'}`}
                          >
                            {copied === wt.path ? '✓ Opened' : '▶ Resume'}
                          </button>
                          {vscodeAvailable && (
                            <button
                              onClick={() => invoke('open_in_vscode', { path: wt.path }).catch(() => showToast('error', 'Could not open VS Code'))}
                              title="Open worktree in Visual Studio Code"
                              className="text-[11px] px-3 py-1.5 rounded-md border border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
                            >
                              VS Code
                            </button>
                          )}
                          <button
                            onClick={() => invoke('reveal_in_finder', { path: wt.path }).catch(() => showToast('error', 'Could not reveal in Finder'))}
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
                              <button
                                key={s.sessionId}
                                onClick={() => onOpenSession(s)}
                                title="Open transcript in Sessions"
                                className="block w-full text-left text-[11px] border-b border-[var(--c-border)]/50 last:border-0 pb-1.5 last:pb-0 hover:text-[var(--c-accent)] transition-colors group/session"
                              >
                                <span className="text-[var(--c-text)] font-medium line-clamp-1 group-hover/session:text-[var(--c-accent)]">{s.title ?? s.display}</span>
                                <span className="text-[var(--c-text-3)] flex items-center gap-1.5">
                                  <AgentBadge agent={s.agent} />
                                  {relativeTime(Math.floor(s.timestamp / 1000))}{s.model ? ` · ${s.model}` : ''} · view transcript →
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    </div>
                  </div>
                )
              })}
            </div>
            </div>
            )}
          </div>
          )
        })}
      </div>
    </div>
  )
}

function RepoInsights({ data }: { data: SessionInsights | 'loading' | undefined }) {
  if (data === undefined) return null
  if (data === 'loading') {
    return (
      <div className="flex items-center gap-2 mb-2 px-1">
        <div className="w-3 h-3 border-2 border-[var(--c-accent)]/40 border-t-[var(--c-accent)] rounded-full animate-spin" />
        <span className="text-[11px] text-[var(--c-text-3)]">Loading repo insights…</span>
      </div>
    )
  }
  if (data.sessionsAnalyzed === 0) {
    return <p className="text-[11px] text-[var(--c-text-3)] mb-2 px-1">No analyzed sessions in the last 30 days</p>
  }
  return (
    <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 px-3.5 py-2.5 mb-2">
      <TileRow className="mb-2">
        <Tile value={data.sessionsAnalyzed} label="Sessions 30d" />
        <Tile value={formatTokens(data.inputTokens + data.outputTokens)} label="Tokens" color="text-[var(--c-accent)]" />
        <Tile value={data.perModel[0] ? shortModel(data.perModel[0].model) : '—'} label="Top model" />
        <Tile value={`$${data.estCostUsd.toFixed(2)}`} label="Est. cost" color="text-amber-400" />
      </TileRow>
      {data.toolCounts.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-[var(--c-border)]/60">
          <p className="text-[10px] font-mono text-[var(--c-text-3)] uppercase tracking-wider mb-2">Top tools in this repo</p>
          {data.toolCounts.slice(0, 5).map(t => (
            <HBar
              key={t.name}
              name={t.name}
              value={`${t.count.toLocaleString()} calls`}
              pct={(t.count / Math.max(1, data.toolCounts[0].count)) * 100}
              color="var(--c-accent)"
            />
          ))}
        </div>
      )}
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
