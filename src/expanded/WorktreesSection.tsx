import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { RepoWorktrees, WorktreeInfo, BranchInfo, RemoteBranchInfo, SessionEntry, SessionInsights, RepoMeta, PullRequestInfo } from '../types'
import { formatTokens } from '../components/history/SessionStats'
import { Tile, TileRow } from './InsightTiles'
import { HBar, RefreshButton, shortModel, SkeletonCards } from './InsightWidgets'
import AgentBadge from '../components/history/AgentBadge'
import RepoAgentConfigView from '../components/RepoAgentConfigView'
import SearchInput from '../components/SearchInput'
import { getCustomGitHosts } from '../gitHosts'

export type WorktreeStatus = 'active' | 'stale' | 'abandoned' | 'primary'

// Same set My Work uses for project avatars — keeps a repo's color identity
// consistent whichever page you see it on.
const PALETTE = ['#6366f1', '#e8a94a', '#d98fd9', '#5fc9b8', '#7aa2e8', '#8fbf6b']

const DAY = 86_400_000

/** `hasRecentSession` covers work that hasn't been committed yet — a
 *  worktree with a live or recent agent session is "active" even if its
 *  last commit is old, otherwise mid-session work with no commits reads
 *  as stale/abandoned. */
export function worktreeStatus(wt: WorktreeInfo, hasRecentSession = false): WorktreeStatus {
  if (wt.isPrimary) return 'primary'
  if (hasRecentSession) return 'active'
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

type Filter = 'all' | 'active' | 'stale' | 'abandoned' | 'dirty' | 'safe' | 'attention'

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
    : 'bg-[var(--c-surface-2)] text-[var(--c-text-2)]'
  const label = isRepo ? 'REPO NOTE' : 'BRANCH NOTE'

  const save = () => {
    const clean = draft.trim() || null
    setEditing(false)
    if (clean === notes) return
    onSaved(clean)
    invoke('set_repo_notes', { path, notes: clean }).catch(() => {})
  }

  const deleteNote = () => {
    setEditing(false)
    onSaved(null)
    invoke('set_repo_notes', { path, notes: null }).catch(() => {})
  }

  if (editing) {
    return (
      <div>
        <span className={`inline-block text-[9px] font-semibold tracking-wider px-1.5 py-px rounded mb-1 ${chip}`}>{label}</span>
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
          className="w-full bg-[var(--c-surface-2)] border border-[var(--c-accent)]/40 rounded-lg px-2.5 py-1.5 text-[13.5px] text-[var(--c-text)] outline-none resize-y leading-relaxed"
        />
        {notes && (
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={deleteNote}
            className="text-[11.5px] text-[var(--c-text-3)] hover:text-rose-400 transition-colors mt-1"
          >
            Delete note
          </button>
        )}
      </div>
    )
  }

  if (notes) {
    return (
      <div className="w-full flex items-start gap-1.5 rounded-lg border border-[var(--c-border)]/60 bg-[var(--c-surface-2)]/40 px-2.5 py-1.5 hover:border-[var(--c-text-3)]/40 transition-colors">
        <button
          onClick={() => { setDraft(notes); setEditing(true) }}
          title="Edit note"
          className="flex-1 min-w-0 text-left"
        >
          <span className={`inline-block text-[9px] font-semibold tracking-wider px-1.5 py-px rounded mr-1.5 align-middle ${chip}`}>{label}</span>
          <span className="text-[13.5px] text-[var(--c-text-2)] whitespace-pre-wrap leading-relaxed line-clamp-3 align-middle">{notes}</span>
        </button>
        <button
          onClick={deleteNote}
          title="Delete note"
          aria-label="Delete note"
          className="flex-shrink-0 text-[var(--c-text-3)] hover:text-rose-400 transition-colors text-[13px] mt-0.5"
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => { setDraft(''); setEditing(true) }}
      className="text-[12.5px] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
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
  /** Worktree path to auto-expand and scroll to, e.g. from "Needs attention" on My Work. */
  focusPath?: string | null
  showToast: (type: 'success' | 'error', message: string) => void
}

export default function WorktreesSection({ repos, loading, sessions, onRemoved, onRefresh, onOpenSession, onViewSessions, focusPath, showToast }: WorktreesSectionProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  // Branch (no worktree) deletion — keyed by "<repoPath>:<branchName>", separate
  // from worktree deletion above since it operates on a name, not a path.
  const [confirmDeleteBranch, setConfirmDeleteBranch] = useState<string | null>(null)
  const [deletingBranch, setDeletingBranch] = useState(false)
  const [deleteBranchError, setDeleteBranchError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  // Per-repo usage insights, fetched lazily on first toggle. 'loading' while in flight.
  const [repoInsights, setRepoInsights] = useState<Record<string, SessionInsights | 'loading'>>({})
  const [insightsOpen, setInsightsOpen] = useState<Record<string, boolean>>({})
  // Per-repo open PRs (via `gh`), fetched lazily on first toggle.
  const [repoPrs, setRepoPrs] = useState<Record<string, PullRequestInfo[] | 'loading'>>({})
  const [prsOpen, setPrsOpen] = useState<Record<string, boolean>>({})
  // Remote-only branches come bundled with list_worktrees already — this
  // toggle is pure display state, no separate fetch needed.
  const [remoteOpen, setRemoteOpen] = useState<Record<string, boolean>>({})
  // Repo cards start collapsed; searching or filtering opens matches.
  const [repoOpen, setRepoOpen] = useState<Record<string, boolean>>({})
  // When true, the branches/worktrees list is swapped out for the Agent
  // permissions section instead — the two never show at once.
  const [agentSettingsOpen, setAgentSettingsOpen] = useState<Record<string, boolean>>({})
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

  // Deep-link entry point: expand the owning repo and this worktree, clear
  // any filter/search that could hide it, then scroll it into view once rendered.
  useEffect(() => {
    if (!focusPath) return
    const owner = repos.find(r => r.worktrees.some(w => w.path === focusPath))
    if (!owner) return
    setFilter('all')
    setSearch('')
    setRepoOpen(prev => ({ ...prev, [owner.repoPath]: true }))
    setExpanded(focusPath)
  }, [focusPath, repos])

  useEffect(() => {
    if (!focusPath) return
    const el = itemRefs.current[focusPath]
    if (!el) return
    requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }, [focusPath, expanded, repoOpen])

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

  // Filtering/searching auto-opens matching repos, but an explicit user
  // toggle (collapse or expand) always wins over that default — otherwise
  // the collapse control goes inert the moment a filter is active.
  const forceOpen = filter !== 'all' || !!search.trim()
  const isRepoOpen = (repoPath: string) =>
    repoOpen[repoPath] !== undefined ? repoOpen[repoPath] : forceOpen

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

  const togglePrs = (repo: RepoWorktrees) => {
    const key = repo.repoPath
    const opening = !prsOpen[key]
    setPrsOpen(prev => ({ ...prev, [key]: opening }))
    if (opening && repoPrs[key] === undefined) {
      setRepoPrs(prev => ({ ...prev, [key]: 'loading' }))
      invoke<PullRequestInfo[]>('get_open_prs', { repoPath: repo.repoPath, customHosts: getCustomGitHosts() })
        .then(prs => setRepoPrs(prev => ({ ...prev, [key]: prs })))
        .catch(() => setRepoPrs(prev => {
          const next = { ...prev }
          delete next[key]
          return next
        }))
    }
  }

  // A worktree with a live or recent session is "active" even with no
  // recent commit — uncommitted mid-session work shouldn't read as stale.
  const hasRecentSession = (wt: WorktreeInfo) =>
    sessions.some(s => s.project === wt.path && (s.isLive || Date.now() - s.timestamp < 7 * DAY))

  const allWts = useMemo(() => repos.flatMap(r => r.worktrees), [repos])
  const allBareBranches = useMemo(() => repos.flatMap(r => r.bareBranches), [repos])
  const counts = useMemo(() => ({
    repos: repos.length,
    active: allWts.filter(w => worktreeStatus(w, hasRecentSession(w)) === 'active').length,
    stale: allWts.filter(w => worktreeStatus(w, hasRecentSession(w)) === 'stale').length,
    abandoned: allWts.filter(w => worktreeStatus(w, hasRecentSession(w)) === 'abandoned').length,
    dirty: allWts.filter(w => w.isDirty).length,
    // Matches the `safe` filter below (matchesBareBranch treats a merged
    // bare branch as safe too) — otherwise the tile/banner undercounts what
    // clicking through to the filter actually reveals.
    safe: allWts.filter(isSafeToDelete).length + allBareBranches.filter(b => b.isMerged).length,
    attention: allWts.filter(w => {
      const st = worktreeStatus(w, hasRecentSession(w))
      return st === 'stale' || st === 'abandoned' || w.isDirty
    }).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [repos, allWts, allBareBranches, sessions])

  const matches = (wt: WorktreeInfo, repo: RepoWorktrees): boolean => {
    const st = worktreeStatus(wt, hasRecentSession(wt))
    if (filter === 'safe' && !isSafeToDelete(wt)) return false
    if (filter === 'dirty' && !wt.isDirty) return false
    if (filter === 'attention' && st !== 'stale' && st !== 'abandoned' && !wt.isDirty) return false
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

  // Worktree status filters (active/stale/abandoned/dirty/attention) don't
  // apply to a branch with no worktree — only "safe" (== merged, since a
  // bare branch can never be dirty) and search carry over.
  const matchesBareBranch = (b: BranchInfo, repo: RepoWorktrees): boolean => {
    if (filter !== 'all' && filter !== 'safe') return false
    if (filter === 'safe' && !b.isMerged) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const alias = repoNames[repo.repoPath]?.toLowerCase() ?? ''
      if (
        !b.name.toLowerCase().includes(q)
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

  const handleDeleteBranch = async (repo: RepoWorktrees, branch: BranchInfo) => {
    setDeletingBranch(true)
    setDeleteBranchError(null)
    try {
      await invoke('delete_branch', { repoPath: repo.repoPath, branchName: branch.name })
      setConfirmDeleteBranch(null)
      onRemoved()
    } catch (e) {
      setDeleteBranchError(String(e))
    } finally {
      setDeletingBranch(false)
    }
  }

  const lastTouchedTs = (repo: RepoWorktrees): number =>
    Math.max(
      0,
      ...repo.worktrees.map(w => w.lastCommitTs ?? 0),
      ...repo.bareBranches.map(b => b.lastCommitTs ?? 0),
      ...repo.remoteBranches.map(b => b.lastCommitTs ?? 0),
    )

  type TimeBucket = 'today' | 'week' | 'older'
  const timeBucket = (tsSec: number): TimeBucket => {
    if (tsSec === 0) return 'older'
    const age = Date.now() - tsSec * 1000
    if (age < DAY) return 'today'
    if (age < 7 * DAY) return 'week'
    return 'older'
  }
  const BUCKET_LABEL: Record<TimeBucket, string> = { today: 'Today', week: 'This week', older: 'Older' }

  const visibleRepos = repos
    .map(r => ({
      repo: r,
      items: r.worktrees.filter(w => matches(w, r)),
      bareItems: r.bareBranches.filter(b => matchesBareBranch(b, r)),
    }))
    .filter(g => g.items.length > 0 || g.bareItems.length > 0)
    .sort((a, b) => lastTouchedTs(b.repo) - lastTouchedTs(a.repo))

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-3 flex-shrink-0 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight">Repos</h2>
          <p className="text-[14px] text-[var(--c-text-3)] mt-0.5">
            Every checkout across your repos, in one place
          </p>
        </div>
        <RefreshButton onClick={onRefresh} busy={loading} />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {/* Search */}
        <div className="mb-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by branch or repo…" accentColor="indigo" />
        </div>

        {/* Status tiles double as filters — click to scope, click again to clear.
            Stale/Abandoned/Uncommitted consolidate into one "Needs attention"
            tile (all three answer the same question — does this repo need
            something from me) with a hover breakdown, instead of 6 boxes
            where most read 0 most of the time. */}
        <TileRow className="mb-3">
          <Tile
            value={counts.repos}
            label="Repos"
            hint="Show everything"
            selected={false}
            onClick={() => setFilter('all')}
          />
          <div className="relative w-full group/attn">
            <button
              type="button"
              onClick={() => setFilter(filter === 'attention' ? 'all' : 'attention')}
              className={`w-full rounded-xl border px-3 py-2.5 text-center transition-colors ${
                filter === 'attention' ? 'ring-1 ring-[var(--c-accent)]' : ''
              } ${counts.attention > 0 ? 'border-[var(--c-border)] bg-[var(--c-surface-2)]/40 hover:bg-[var(--c-surface-2)]' : 'border-[var(--c-border)] bg-[var(--c-surface-2)]/40'}`}
            >
              <div className={`text-[17px] font-semibold tabular-nums ${counts.attention > 0 ? 'text-amber-400' : 'text-[var(--c-text-3)]'}`}>
                {counts.attention}
              </div>
              <div className="text-[10.5px] text-[var(--c-text-3)] uppercase tracking-wider mt-0.5">Needs attention</div>
            </button>
            {counts.attention > 0 && (
              <div className="hidden group-hover/attn:block group-focus-within/attn:block absolute top-full left-0 mt-1 z-10 bg-[var(--c-bg)] border border-[var(--c-border)] rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                <div className="flex justify-between gap-4 text-[12px] py-0.5">
                  <span className="text-[var(--c-text-3)]">Abandoned</span>
                  <span className="font-mono text-rose-400">{counts.abandoned}</span>
                </div>
                <div className="flex justify-between gap-4 text-[12px] py-0.5">
                  <span className="text-[var(--c-text-3)]">Uncommitted</span>
                  <span className="font-mono text-amber-400">{counts.dirty}</span>
                </div>
                <div className="flex justify-between gap-4 text-[12px] py-0.5">
                  <span className="text-[var(--c-text-3)]">Stale</span>
                  <span className="font-mono text-[var(--c-text-3)]">{counts.stale}</span>
                </div>
              </div>
            )}
          </div>
          <Tile
            value={counts.safe}
            label="Safe to delete"
            hint="Merged into base and clean"
            color={counts.safe > 0 ? 'text-emerald-400' : 'text-[var(--c-text-3)]'}
            selected={filter === 'safe'}
            onClick={() => setFilter(filter === 'safe' ? 'all' : 'safe')}
          />
        </TileRow>

        {/* Cleanup banner */}
        {counts.safe > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 mb-4">
            <p className="text-[14px]">
              <span className="text-emerald-400 font-semibold">{counts.safe}</span>{' '}
              branch{counts.safe > 1 ? 'es are' : ' is'} merged and clean — safe to delete
            </p>
            <button
              onClick={() => setFilter('safe')}
              className="text-[13px] px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors font-medium"
            >
              Review
            </button>
          </div>
        )}

        {loading && <SkeletonCards count={4} />}

        {!loading && visibleRepos.length === 0 && (
          <p className="text-[14px] text-[var(--c-text-3)] text-center py-10">
            {allWts.length === 0
              ? 'No git repos found in your session history yet'
              : 'No worktrees match this filter'}
          </p>
        )}

        {/* Repo groups — sorted by last touched, sectioned into a Today / This week / Older rail */}
        {visibleRepos.map(({ repo, items, bareItems }, repoIndex) => {
          const open = isRepoOpen(repo.repoPath)
          const bucket = timeBucket(lastTouchedTs(repo))
          const prevBucket = repoIndex > 0 ? timeBucket(lastTouchedTs(visibleRepos[repoIndex - 1].repo)) : null
          const showBucketHeader = bucket !== prevBucket
          return (
          <Fragment key={repo.repoPath}>
          {showBucketHeader && (
            <div className={`flex items-center gap-1.5 px-1 mb-1.5 ${repoIndex === 0 ? '' : 'mt-3'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--c-accent)]" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-3)]">{BUCKET_LABEL[bucket]}</span>
            </div>
          )}
          <div className="mb-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/25 overflow-hidden">
            {/* Repo header — name area toggles, actions live on the right */}
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <button
                onClick={() => setRepoOpen(prev => ({ ...prev, [repo.repoPath]: !open }))}
                aria-expanded={open}
                className="flex items-center gap-3 flex-1 min-w-0 text-left group/repo"
              >
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-[14px] text-black/80 shrink-0"
                  style={{ background: PALETTE[repoIndex % PALETTE.length] }}
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
                      className="block w-48 bg-[var(--c-surface-2)] border border-[var(--c-accent)]/40 rounded px-1.5 py-0.5 text-[15px] font-semibold text-[var(--c-text)] outline-none"
                    />
                  ) : (
                    <span className="flex items-center gap-1">
                      <span className="text-[15.5px] font-semibold truncate group-hover/repo:text-[var(--c-accent)] transition-colors">
                        {displayName(repo)}
                        {repoNames[repo.repoPath] && (
                          <span className="ml-1.5 text-[12px] font-normal font-mono text-[var(--c-text-3)]">({repo.repoName})</span>
                        )}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={e => {
                          e.stopPropagation()
                          setRenameDraft(repoNames[repo.repoPath] ?? repo.repoName)
                          setRenaming(repo.repoPath)
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation()
                            e.preventDefault()
                            setRenameDraft(repoNames[repo.repoPath] ?? repo.repoName)
                            setRenaming(repo.repoPath)
                          }
                        }}
                        title="Rename repo"
                        aria-label={`Rename ${displayName(repo)}`}
                        className="shrink-0 cursor-pointer text-[12px] px-1 py-0.5 rounded text-[var(--c-text-3)] opacity-0 group-hover/repo:opacity-100 focus:opacity-100 hover:text-[var(--c-text-2)] transition-colors"
                      >
                        ✎
                      </span>
                    </span>
                  )}
                  <span className="block text-[12.5px] text-[var(--c-text-3)]">
                    {items.length} worktree{items.length > 1 ? 's' : ''}
                    {bareItems.length > 0 && <> · {bareItems.length} branch{bareItems.length > 1 ? 'es' : ''}</>}
                    {' '}· base {repo.baseBranch}
                  </span>
                  <span className="block text-[12px] font-mono text-[var(--c-text-3)]/70 truncate" title={repo.repoPath}>
                    {repo.repoPath}
                  </span>
                </span>
              </button>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => onViewSessions(repo)}
                  title="View all sessions for this repo"
                  className="flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-md border border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] hover:border-[var(--c-text-3)]/50 transition-colors"
                >
                  ◷ Sessions
                </button>
                <button
                  onClick={() => toggleRepoInsights(repo)}
                  aria-expanded={!!insightsOpen[repo.repoPath]}
                  className={`flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-md border transition-colors ${insightsOpen[repo.repoPath] ? 'border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] hover:border-[var(--c-text-3)]/50'}`}
                >
                  <span className={`text-[8.5px] transition-transform ${insightsOpen[repo.repoPath] ? 'rotate-90' : ''}`} aria-hidden="true">▶</span>
                  Insights
                </button>
                <button
                  onClick={() => togglePrs(repo)}
                  aria-expanded={!!prsOpen[repo.repoPath]}
                  className={`flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-md border transition-colors ${prsOpen[repo.repoPath] ? 'border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] hover:border-[var(--c-text-3)]/50'}`}
                >
                  <span className={`text-[8.5px] transition-transform ${prsOpen[repo.repoPath] ? 'rotate-90' : ''}`} aria-hidden="true">▶</span>
                  PRs
                  {Array.isArray(repoPrs[repo.repoPath]) && (repoPrs[repo.repoPath] as PullRequestInfo[]).length > 0 && (
                    <span className="text-[var(--c-text-3)]">{(repoPrs[repo.repoPath] as PullRequestInfo[]).length}</span>
                  )}
                </button>
                <button
                  onClick={() => setRemoteOpen(prev => ({ ...prev, [repo.repoPath]: !prev[repo.repoPath] }))}
                  aria-expanded={!!remoteOpen[repo.repoPath]}
                  title="Remote branches with no local copy checked out or pulled down"
                  className={`flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-md border transition-colors ${remoteOpen[repo.repoPath] ? 'border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] hover:border-[var(--c-text-3)]/50'}`}
                >
                  <span className={`text-[8.5px] transition-transform ${remoteOpen[repo.repoPath] ? 'rotate-90' : ''}`} aria-hidden="true">▶</span>
                  Remote
                  {repo.remoteBranches.length > 0 && (
                    <span className="text-[var(--c-text-3)]">{repo.remoteBranches.length}</span>
                  )}
                </button>
                <button
                  onClick={() => {
                    const next = !agentSettingsOpen[repo.repoPath]
                    setAgentSettingsOpen(prev => ({ ...prev, [repo.repoPath]: next }))
                    // The content this button swaps in lives inside the
                    // collapsed repo body — force the card open so the
                    // click has a visible effect even when collapsed.
                    if (next) setRepoOpen(prev => ({ ...prev, [repo.repoPath]: true }))
                  }}
                  aria-expanded={!!agentSettingsOpen[repo.repoPath]}
                  className={`flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-md border transition-colors ${agentSettingsOpen[repo.repoPath] ? 'border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] hover:border-[var(--c-text-3)]/50'}`}
                >
                  Agent settings
                </button>
                {vscodeAvailable && (
                  <button
                    onClick={() => invoke('open_in_vscode', { path: repo.repoPath }).catch(() => showToast('error', 'Could not open VS Code'))}
                    title="Open repo in Visual Studio Code"
                    className="text-[12px] px-2.5 py-1 rounded-md border border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] hover:border-[var(--c-text-3)]/50 transition-colors"
                  >
                    VS Code
                  </button>
                )}
                <button
                  onClick={() => setRepoOpen(prev => ({ ...prev, [repo.repoPath]: !open }))}
                  aria-label={open ? 'Collapse repo' : 'Expand repo'}
                  className={`text-[var(--c-text-3)] text-[14px] px-1 transition-transform ${open ? 'rotate-90' : ''}`}
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

            {prsOpen[repo.repoPath] && (
              <div className="px-3.5">
                <RepoPrs data={repoPrs[repo.repoPath]} />
              </div>
            )}

            {remoteOpen[repo.repoPath] && (
              <div className="px-3.5">
                <RemoteBranches data={repo.remoteBranches} />
              </div>
            )}

            {open && (
            <div className="px-3.5 pb-3">
              <div className="mb-2">
                <NotesEditor path={repo.repoPath} notes={pathNotes[repo.repoPath] ?? null} variant="repo" onSaved={saveNote(repo.repoPath)} />
              </div>
              {agentSettingsOpen[repo.repoPath] ? (
                <div>
                  <p className="text-[10.5px] font-mono uppercase tracking-wider text-[var(--c-text-3)] mb-1.5">
                    Agent permissions
                  </p>
                  <RepoAgentConfigView repoPath={repo.repoPath} />
                </div>
              ) : (
              <>
              {(repo.agentFiles.length > 0 || repo.repoSkills.length > 0) && (
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  {repo.agentFiles.map(f => (
                    <span
                      key={f}
                      className="text-[9.5px] font-mono px-1.5 py-px rounded-full border border-[var(--c-border)] text-[var(--c-text-3)]"
                      title={`Agent instruction file at repo root — read by any agent working in this repo`}
                    >
                      {f}
                    </span>
                  ))}
                  {repo.repoSkills.length > 0 && (
                    <span
                      className="text-[9.5px] font-mono px-1.5 py-px rounded-full border border-[var(--c-accent)]/40 text-[var(--c-accent)]"
                      title={repo.repoSkills.join(', ')}
                    >
                      {repo.repoSkills.length} skill{repo.repoSkills.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )}
            {items.length > 0 && (
            <>
            <SectionHeading label="Worktrees" count={items.length} accent="var(--c-accent)" />
            {/* Branch map: trunk line down the left, one connector per worktree */}
            <div className="relative pl-5 space-y-1.5">
              <div className="absolute left-[9px] top-1 bottom-5 w-px bg-[var(--c-border)]" aria-hidden="true" />
              {items.map(wt => {
                const st = worktreeStatus(wt, hasRecentSession(wt))
                const isOpen = expanded === wt.path
                const linked = sessionsFor(wt)
                const statusBorder = isOpen
                  ? 'border-[var(--c-accent)]/50'
                  : st === 'active'
                    ? 'border-emerald-500/30 hover:border-emerald-500/50'
                    : isSafeToDelete(wt)
                      ? 'border-dashed border-[var(--c-border)] hover:border-[var(--c-text-3)]/40'
                      : 'border-[var(--c-border)] hover:border-[var(--c-text-3)]/40'
                return (
                  <div key={wt.path} ref={el => { itemRefs.current[wt.path] = el }} className="relative">
                    <div className="absolute -left-[11px] top-[21px] w-[11px] h-px bg-[var(--c-border)]" aria-hidden="true" />
                    <div
                      data-testid={`wt-card-${wt.path}`}
                      className={`rounded-xl border transition-colors ${statusBorder} bg-[var(--c-surface-2)]/40`}
                    >
                    <button
                      onClick={() => setExpanded(isOpen ? null : wt.path)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[st]} ${st === 'active' ? 'animate-pulse' : ''}`} />
                          <span className="text-[15px] font-mono font-semibold truncate">
                            {wt.branch ?? (wt.isDetached ? 'detached HEAD' : '?')}
                          </span>
                        </div>
                        <div className="text-[13px] text-[var(--c-text-3)] mt-0.5 ml-4">
                          {relativeTime(wt.lastCommitTs)}
                          {linked.length > 0 && <> · {linked.length} session{linked.length > 1 ? 's' : ''}</>}
                        </div>
                        <div className="text-[12px] font-mono text-[var(--c-text-3)]/70 mt-0.5 ml-4 truncate" title={wt.path}>
                          {wt.path}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {wt.isPrimary && <Badge tone="accent">primary</Badge>}
                        {isSafeToDelete(wt) && <Badge tone="ok">safe</Badge>}
                        {wt.isDirty && <Badge tone="warn">uncommitted</Badge>}
                        {!wt.isPrimary && !wt.isMerged && wt.ahead > 0 && <Badge tone="accent">↑{wt.ahead}</Badge>}
                        {wt.behind > 0 && <Badge tone="muted">↓{wt.behind}</Badge>}
                        {!wt.hasRemote && <Badge tone="muted">local only</Badge>}
                        <span className={`text-[var(--c-text-3)] text-[14px] transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
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
                          <p className="text-[13px] font-mono text-[var(--c-text-3)] mb-3 truncate" title={wt.lastCommitSubject}>
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
                            className={`text-[13px] px-3 py-1.5 rounded-md font-medium transition-colors ${copied === wt.path ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[var(--c-accent)]/15 text-[var(--c-accent)] hover:bg-[var(--c-accent)]/25'}`}
                          >
                            {copied === wt.path ? '✓ Opened' : '▶ Resume'}
                          </button>
                          {vscodeAvailable && (
                            <button
                              onClick={() => invoke('open_in_vscode', { path: wt.path }).catch(() => showToast('error', 'Could not open VS Code'))}
                              title="Open worktree in Visual Studio Code"
                              className="text-[13px] px-3 py-1.5 rounded-md border border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
                            >
                              VS Code
                            </button>
                          )}
                          <button
                            onClick={() => invoke('reveal_in_finder', { path: wt.path }).catch(() => showToast('error', 'Could not reveal in Finder'))}
                            className="text-[13px] px-3 py-1.5 rounded-md border border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
                          >
                            Reveal in Finder
                          </button>
                          {isSafeToDelete(wt) && confirmDelete !== wt.path && (
                            <button
                              onClick={() => { setConfirmDelete(wt.path); setRemoveError(null) }}
                              className="text-[13px] px-3 py-1.5 rounded-md border border-[var(--c-border)] text-rose-400/80 hover:text-rose-400 hover:border-rose-400/40 transition-colors"
                            >
                              Delete
                            </button>
                          )}
                          {confirmDelete === wt.path && (
                            <>
                              <button
                                disabled={removing}
                                onClick={() => handleRemove(repo, wt)}
                                className="text-[13px] px-3 py-1.5 rounded-md bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition-colors font-medium disabled:opacity-50"
                              >
                                {removing ? 'Removing…' : 'Confirm delete'}
                              </button>
                              <button
                                disabled={removing}
                                onClick={() => setConfirmDelete(null)}
                                className="text-[13px] px-3 py-1.5 rounded-md border border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                        {removeError && confirmDelete === wt.path && (
                          <p className="text-[13px] text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2 mb-3">{removeError}</p>
                        )}
                        {linked.length > 0 && (
                          <div className="space-y-1.5">
                            {linked.map(s => (
                              <button
                                key={s.sessionId}
                                onClick={() => onOpenSession(s)}
                                title="Open transcript in Sessions"
                                className="block w-full text-left text-[13px] border-b border-[var(--c-border)]/50 last:border-0 pb-1.5 last:pb-0 hover:text-[var(--c-accent)] transition-colors group/session"
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
            </>
            )}

            {bareItems.length > 0 && (
              <div className={items.length > 0 ? 'mt-3' : ''}>
                <SectionHeading label="Branches" hint="not checked out" count={bareItems.length} accent="var(--c-text-3)" />
                <div className="space-y-1.5">
                  {bareItems.map(b => {
                    const key = `${repo.repoPath}:${b.name}`
                    return (
                      <div
                        key={key}
                        data-testid={`branch-card-${key}`}
                        className="rounded-xl border border-dashed border-[var(--c-border)] bg-[var(--c-surface-2)]/25 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full shrink-0 bg-[var(--c-text-3)]/40" />
                              <span className="text-[15px] font-mono font-semibold truncate">{b.name}</span>
                            </div>
                            <div className="text-[13px] text-[var(--c-text-3)] mt-0.5 ml-4">
                              not checked out · {relativeTime(b.lastCommitTs)}
                              {b.lastCommitSubject && <> · {b.lastCommitSubject}</>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {b.isMerged
                              ? <Badge tone="ok">merged · safe to delete</Badge>
                              : b.ahead > 0 && <Badge tone="accent">↑{b.ahead}</Badge>}
                            {!b.hasRemote && <Badge tone="muted">local only</Badge>}
                            {b.isMerged && confirmDeleteBranch !== key && (
                              <button
                                onClick={() => { setConfirmDeleteBranch(key); setDeleteBranchError(null) }}
                                className="text-[13px] px-3 py-1.5 rounded-md border border-[var(--c-border)] text-rose-400/80 hover:text-rose-400 hover:border-rose-400/40 transition-colors"
                              >
                                Delete
                              </button>
                            )}
                            {confirmDeleteBranch === key && (
                              <>
                                <button
                                  disabled={deletingBranch}
                                  onClick={() => handleDeleteBranch(repo, b)}
                                  className="text-[13px] px-3 py-1.5 rounded-md bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition-colors font-medium disabled:opacity-50"
                                >
                                  {deletingBranch ? 'Deleting…' : 'Confirm delete'}
                                </button>
                                <button
                                  disabled={deletingBranch}
                                  onClick={() => setConfirmDeleteBranch(null)}
                                  className="text-[13px] px-3 py-1.5 rounded-md border border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        {deleteBranchError && confirmDeleteBranch === key && (
                          <p className="text-[13px] text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2 mt-2">{deleteBranchError}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
              </>
              )}
            </div>
            )}
          </div>
          </Fragment>
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
        <span className="text-[13px] text-[var(--c-text-3)]">Loading repo insights…</span>
      </div>
    )
  }
  if (data.sessionsAnalyzed === 0) {
    return <p className="text-[13px] text-[var(--c-text-3)] mb-2 px-1">No analyzed sessions in the last 30 days</p>
  }
  return (
    <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 px-3.5 py-2.5 mb-2">
      <TileRow className="mb-2">
        <Tile value={data.sessionsAnalyzed} label="Sessions 30d" />
        <Tile value={formatTokens(data.inputTokens + data.outputTokens)} label="Tokens" />
        <Tile value={data.perModel[0] ? shortModel(data.perModel[0].model) : '—'} label="Top model" />
        <Tile value={`$${data.estCostUsd.toFixed(2)}`} label="Est. cost" />
      </TileRow>
      {data.toolCounts.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-[var(--c-border)]/60">
          <p className="text-[12px] font-mono text-[var(--c-text-3)] uppercase tracking-wider mb-2">Top tools in this repo</p>
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

function RepoPrs({ data }: { data: PullRequestInfo[] | 'loading' | undefined }) {
  if (data === undefined) return null
  if (data === 'loading') {
    return (
      <div className="flex items-center gap-2 mb-2 px-1">
        <div className="w-3 h-3 border-2 border-[var(--c-accent)]/40 border-t-[var(--c-accent)] rounded-full animate-spin" />
        <span className="text-[13px] text-[var(--c-text-3)]">Loading open PRs…</span>
      </div>
    )
  }
  if (data.length === 0) {
    return <p className="text-[13px] text-[var(--c-text-3)] mb-2 px-1">No open PRs — or this repo has no GitHub remote / `gh` isn't installed</p>
  }
  return (
    <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 px-3.5 py-2.5 mb-2 flex flex-col gap-1.5">
      {data.map(pr => (
        <button
          key={pr.number}
          onClick={() => invoke('open_url', { url: pr.url }).catch(() => {})}
          className="flex items-center gap-2 text-left px-2 py-1.5 rounded-md hover:bg-[var(--c-hover)] transition-colors"
        >
          <span className="font-mono text-[12px] text-[var(--c-text-3)] flex-shrink-0">#{pr.number}</span>
          <span className="flex-1 min-w-0 text-[13.5px] truncate">{pr.title}</span>
          {pr.isDraft && <Badge tone="muted">Draft</Badge>}
          <span className="text-[12px] text-[var(--c-text-3)] flex-shrink-0">{pr.author}</span>
        </button>
      ))}
    </div>
  )
}

/** Subsection label inside a repo card — a colored rail ties it to its
 *  cards' border color (solid accent for worktrees, dashed muted for bare
 *  branches) so which group is which reads at a glance while scrolling. */
function SectionHeading({ label, hint, count, accent }: { label: string; hint?: string; count: number; accent: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-[3px] h-[13px] rounded-full" style={{ background: accent }} aria-hidden="true" />
      <span className="text-[13.5px] font-semibold text-[var(--c-text-2)]">
        {label}
        {hint && <span className="text-[11.5px] font-normal text-[var(--c-text-3)]"> · {hint}</span>}
      </span>
      <span className="text-[11px] font-mono text-[var(--c-text-3)]">{count}</span>
    </div>
  )
}

/** Branches that exist on a remote but were never pulled/checked out locally
 *  — read-only, no actions, since there's no local ref yet to act on. */
function RemoteBranches({ data }: { data: RemoteBranchInfo[] }) {
  if (data.length === 0) {
    return <p className="text-[13px] text-[var(--c-text-3)] mb-2 px-1">No remote-only branches — everything on the remote has a local copy</p>
  }
  return (
    <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 px-3.5 py-2.5 mb-2 flex flex-col gap-1.5">
      {data.map(b => (
        <div key={`${b.remote}/${b.name}`} className="flex items-center gap-2 px-2 py-1.5">
          <span className="font-mono text-[10px] px-1.5 py-px rounded-full border border-[var(--c-border)] text-[var(--c-text-3)] flex-shrink-0">{b.remote}</span>
          <span className="flex-1 min-w-0 text-[13.5px] font-mono truncate">{b.name}</span>
          <span className="text-[12px] text-[var(--c-text-3)] flex-shrink-0">{b.lastCommitSubject ?? '—'}</span>
        </div>
      ))}
    </div>
  )
}

function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'accent' | 'muted'; children: React.ReactNode }) {
  const cls =
    tone === 'ok' ? 'bg-emerald-500/15 text-emerald-400' :
    tone === 'warn' ? 'bg-amber-500/15 text-amber-400' :
    tone === 'accent' ? 'bg-[var(--c-accent)]/15 text-[var(--c-accent)]' :
    'bg-[var(--c-surface-2)] text-[var(--c-text-3)]'
  return <span className={`text-[12px] font-mono px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{children}</span>
}

function DetailCell({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-[var(--c-surface-2)] px-3 py-2">
      <div className="text-[14.5px] font-mono font-semibold">{v}</div>
      <div className="text-[10.5px] text-[var(--c-text-3)] uppercase tracking-wider mt-0.5">{k}</div>
    </div>
  )
}
