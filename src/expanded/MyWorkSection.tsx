import { useState, useEffect, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { RepoWorktrees, SessionEntry, SessionInsights } from '../types'
import type { Section } from './ExpandedApp'
import {
  Card, CommitBars, RefreshButton, SkeletonTiles, SkeletonCards,
  DailyBars, ActivityCalendar, ActivityWeekRow, ActivityAgentCount,
} from './InsightWidgets'
import AgentBadge from '../components/history/AgentBadge'
import { formatTokens } from '../components/history/SessionStats'
import { agentColor } from '../constants/agentColors'

const DAY = 86_400_000
const PALETTE = ['#6366f1', '#e8a94a', '#d98fd9', '#5fc9b8', '#7aa2e8', '#8fbf6b']
const MAX_ADVANCED_DAYS = 90

type Tab = 'today' | 'yesterday' | 'week' | 'month' | 'prevMonth' | 'last3' | 'advanced'
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'prevMonth', label: 'Previous Month' },
  { id: 'last3', label: 'Last 3 Months' },
  { id: 'advanced', label: 'Advanced' },
]

function toISODateLocal(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseISODateLocal(s: string): number {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}
function dateKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function preview(text: string, maxWords = 8): string {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '(no prompt)'
  return words.length <= maxWords ? words.join(' ') : words.slice(0, maxWords).join(' ') + '…'
}
function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1) }
function addMonths(d: Date, n: number): Date { return new Date(d.getFullYear(), d.getMonth() + n, 1) }

// Open-ended windows (today/week/month/last3) end at Infinity, not a
// captured Date.now() — otherwise a live session whose timestamp advances
// past the frozen end silently falls out of the window after every refresh.
function windowFor(tab: Tab, customRange: { start: number; end: number } | null): [number, number] {
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  const m = midnight.getTime()
  switch (tab) {
    case 'today': return [m, Infinity]
    case 'yesterday': return [m - DAY, m]
    case 'week': {
      const day = (midnight.getDay() + 6) % 7 // Monday = 0
      return [m - day * DAY, Infinity]
    }
    case 'month': return [startOfMonth(midnight).getTime(), Infinity]
    case 'prevMonth': {
      const prev = addMonths(midnight, -1)
      return [prev.getTime(), startOfMonth(midnight).getTime()]
    }
    case 'last3': return [m - (MAX_ADVANCED_DAYS - 1) * DAY, Infinity]
    case 'advanced':
      if (customRange) return [customRange.start, customRange.end + DAY]
      return [m - 29 * DAY, Infinity]
  }
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / DAY)
  if (mins < 60) return mins < 1 ? 'just now' : `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

interface ProjectAgg {
  project: string
  name: string
  sessions: SessionEntry[]
  prompts: number
  lastTs: number
}

function groupByProject(sessions: SessionEntry[]): ProjectAgg[] {
  const map = new Map<string, ProjectAgg>()
  for (const s of sessions) {
    let agg = map.get(s.project)
    if (!agg) {
      agg = { project: s.project, name: s.projectName, sessions: [], prompts: 0, lastTs: 0 }
      map.set(s.project, agg)
    }
    agg.sessions.push(s)
    agg.prompts += s.promptCount
    agg.lastTs = Math.max(agg.lastTs, s.timestamp)
  }
  return [...map.values()].sort((a, b) => b.lastTs - a.lastTs)
}

interface MyWorkSectionProps {
  sessions: SessionEntry[]
  repos: RepoWorktrees[]
  loading: boolean
  goTo: (s: Section) => void
  onRefresh: () => void | Promise<unknown>
  onOpenSession: (s: SessionEntry) => void
  onOpenSessionById: (sessionId: string) => void
  onOpenSessionsForProject: (name: string, path: string) => void
  onFocusWorktree: (path: string) => void
  showToast: (type: 'success' | 'error', message: string) => void
}

export default function MyWorkSection({ sessions, repos, loading, goTo, onRefresh, onOpenSession, onOpenSessionById, onOpenSessionsForProject, onFocusWorktree, showToast }: MyWorkSectionProps) {
  const [tab, setTab] = useState<Tab>('month')
  const [copiedResume, setCopiedResume] = useState<string | null>(null)
  const [commitTs, setCommitTs] = useState<number[]>([])
  const [vscodeAvailable, setVscodeAvailable] = useState(false)
  const [firstSessionTs, setFirstSessionTs] = useState<number | null>(null)
  const [customRange, setCustomRange] = useState<{ start: number; end: number } | null>(null)
  const [showAdvancedPicker, setShowAdvancedPicker] = useState(false)
  const [monthOffset, setMonthOffset] = useState(0)
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)

  useEffect(() => {
    invoke<boolean>('is_vscode_installed').then(setVscodeAvailable).catch(() => {})
    invoke<number | null>('get_first_session_ts').then(setFirstSessionTs).catch(() => {})
  }, [])

  const selectTab = (id: Tab) => {
    setTab(id)
    setMonthOffset(0)
    if (id === 'advanced') {
      setShowAdvancedPicker(true)
      if (!customRange) {
        const end = new Date(); end.setHours(0, 0, 0, 0)
        const start = new Date(end); start.setDate(start.getDate() - 29)
        const floor = firstSessionTs ?? start.getTime()
        setCustomRange({ start: Math.max(start.getTime(), floor), end: end.getTime() })
      }
    } else {
      setShowAdvancedPicker(false)
    }
  }

  const applyCustomRange = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return
    let start = parseISODateLocal(startStr)
    let end = parseISODateLocal(endStr)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const floor = firstSessionTs ?? start
    if (start < floor) start = floor
    if (end > today.getTime()) end = today.getTime()
    if (end < start) end = start
    const maxEnd = start + (MAX_ADVANCED_DAYS - 1) * DAY
    if (end > maxEnd) end = maxEnd
    setCustomRange({ start, end })
    setShowAdvancedPicker(false)
    setMonthOffset(0)
  }

  const tabLabel = TABS.find(t => t.id === tab)?.label ?? ''

  // Recomputed whenever the tab, custom range, or sessions change so day
  // boundaries stay current (midnight rollover, rolling windows).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const [start, end] = useMemo(() => windowFor(tab, customRange), [tab, customRange, sessions])
  const effectiveEnd = end === Infinity ? Date.now() : end
  const windowDays = Math.max(1, Math.ceil((effectiveEnd - start) / DAY))

  const windowed = useMemo(
    () => sessions.filter(s => s.timestamp >= start && s.timestamp < end),
    [sessions, start, end]
  )
  const projects = useMemo(() => groupByProject(windowed), [windowed])

  const stats = useMemo(() => ({
    sessions: windowed.length,
    live: windowed.filter(s => s.isLive).length,
  }), [windowed])

  // Session share per agent in the selected window — powers the "Agents" stat button.
  const agentMix = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of windowed) counts.set(s.agent, (counts.get(s.agent) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [windowed])

  // Commits restricted to the selected window; bar chart spans exactly it.
  useEffect(() => {
    invoke<number[]>('get_commit_activity', { sinceDays: windowDays }).then(setCommitTs).catch(() => {})
  }, [windowDays])
  const windowCommits = useMemo(
    () => commitTs.filter(sec => sec * 1000 >= start && sec * 1000 < end),
    [commitTs, start, end]
  )

  // Real tokens + cost for the selected window, from the same aggregator
  // TokenBreakdownPanel uses — not an invented per-token price. Parsing a
  // session's raw transcript into session_stats happens in a background
  // "warm" pass, not synchronously — a session from a few days ago can
  // still be unparsed the first time this fires, so kick a warm pass and
  // re-fetch when it reports new data landed (same pattern
  // TokenBreakdownPanel uses), instead of only ever fetching once per
  // window and silently going stale.
  const [insights, setInsights] = useState<SessionInsights | null>(null)
  useEffect(() => {
    let live = true
    const fetchInsights = () => {
      invoke<SessionInsights>('get_session_insights', {
        sinceMs: start,
        untilMs: end === Infinity ? undefined : end,
      }).then(d => { if (live) setInsights(d) }).catch(() => {})
    }
    setInsights(null)
    invoke('warm_session_stats').catch(() => {})
    fetchInsights()
    const unlisten = listen('session-insights-updated', fetchInsights)
    return () => { live = false; unlisten.then(f => f()) }
  }, [start, end])

  // Ranked by tokens — perSession already comes back sorted desc, capped at
  // 100 server-side, so a handful of sessions with unusually low token
  // counts in a very active 90-day window could be missing from the tail;
  // acceptable for a top-5 ranking.
  const topSessions = useMemo(() => (insights?.perSession ?? []).slice(0, 5), [insights])
  // Recency, not tokens — `projects` is already grouped from the windowed
  // SessionEntry list and sorted by lastTs desc; token totals for display
  // come from the insights aggregator keyed by the same project path.
  const topRepos = useMemo(() => {
    const tokensByProject = new Map((insights?.perProject ?? []).map(p => [p.project, p.tokens]))
    return projects.slice(0, 5).map(p => ({
      project: p.project,
      projectName: p.name,
      tokens: tokensByProject.get(p.project) ?? 0,
      lastTs: p.lastTs,
    }))
  }, [projects, insights])
  const perAgentTotals = useMemo(() => {
    const map = new Map<string, { tokens: number; cost: number }>()
    for (const s of insights?.perSession ?? []) {
      const u = map.get(s.agent) ?? { tokens: 0, cost: 0 }
      u.tokens += s.tokens
      u.cost += s.estCostUsd ?? 0
      map.set(s.agent, u)
    }
    // Drop agents with no real usage in this window instead of showing an
    // all-empty tile — a session can legitimately land in perSession with
    // 0 tokens (started, never completed a turn).
    return [...map.entries()].filter(([, u]) => u.tokens > 0).sort((a, b) => b[1].tokens - a[1].tokens)
  }, [insights])
  const totalUsageTokens = useMemo(() => perAgentTotals.reduce((n, [, u]) => n + u.tokens, 0), [perAgentTotals])
  const totalUsageCost = useMemo(() => perAgentTotals.reduce((n, [, u]) => n + u.cost, 0), [perAgentTotals])

  function dailyUsageForAgent(agent: string): { tokens: number[]; costs: number[] } {
    const tokens = Array(windowDays).fill(0)
    const costs = Array(windowDays).fill(0)
    for (const s of insights?.perSession ?? []) {
      if (s.agent !== agent) continue
      const idx = Math.floor((s.ts - start) / DAY)
      if (idx >= 0 && idx < windowDays) {
        tokens[idx] += s.tokens
        costs[idx] += s.estCostUsd ?? 0
      }
    }
    return { tokens, costs }
  }

  // Same perSession rows back every day-level activity view below — no
  // extra fetch needed since the whole window is already in memory.
  const sessionCountsByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of insights?.perSession ?? []) {
      const k = dateKey(s.ts)
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    return map
  }, [insights])

  // Needs attention — derived from the worktree scan; omitted entirely when empty.
  const attention = useMemo(() => {
    const items: {
      key: string
      path: string
      kind: 'uncommitted' | 'unmerged'
      title: string
      why: string
      meta: string
      idleDays: number
      ahead: number
    }[] = []
    for (const repo of repos) {
      for (const wt of repo.worktrees) {
        if (wt.isPrimary) continue
        const idleDays = wt.lastCommitTs ? Math.floor((Date.now() - wt.lastCommitTs * 1000) / DAY) : null
        if (wt.isDirty) {
          items.push({
            key: `${wt.path}:dirty`,
            path: wt.path,
            kind: 'uncommitted',
            title: `${wt.branch ?? wt.path}`,
            why: `Has edited files that were never committed${idleDays !== null && idleDays > 7 ? ` — sitting for ${idleDays} days, risk of losing work` : ' — commit or stash them'}`,
            meta: `${repo.repoName}${idleDays !== null ? ` · last commit ${idleDays}d ago` : ''}`,
            idleDays: idleDays ?? -1,
            ahead: wt.ahead,
          })
        } else if (!wt.isMerged && wt.ahead > 0) {
          items.push({
            key: `${wt.path}:ahead`,
            path: wt.path,
            kind: 'unmerged',
            title: `${wt.branch ?? wt.path}`,
            why: `${wt.ahead} finished commit${wt.ahead > 1 ? 's' : ''} not yet merged into ${repo.baseBranch} — merge or open a PR`,
            meta: repo.repoName,
            idleDays: idleDays ?? -1,
            ahead: wt.ahead,
          })
        }
      }
    }
    // Uncommitted work first (data-loss risk); within uncommitted, longest-idle
    // first; within unmerged, most stranded commits first.
    items.sort((a, b) => {
      const kindOrder = (a.kind === 'uncommitted' ? 0 : 1) - (b.kind === 'uncommitted' ? 0 : 1)
      if (kindOrder !== 0) return kindOrder
      return a.kind === 'uncommitted' ? b.idleDays - a.idleDays : b.ahead - a.ahead
    })
    return items.slice(0, 5)
  }, [repos])

  // Every project touched in the selected window, most-recent first — not
  // just ones with a session file that changed in the last 5 minutes
  // ("live"). That stricter definition made this tile show only 1 project
  // for someone genuinely working across several, since "live" drops the
  // instant you stop typing. The green dot still flags sessions that are
  // live right now; it's no longer a filter.
  const orderedProjects = projects

  const branchFor = (project: string): string | null => {
    for (const repo of repos) {
      const wt = repo.worktrees.find(w => w.path === project)
      if (wt?.branch) return wt.branch
    }
    return null
  }

  const handleResume = async (p: ProjectAgg) => {
    const latest = p.sessions[0]
    try {
      await invoke('resume_in_terminal', { project: p.project, sessionId: latest.sessionId, agent: latest.agent })
      setCopiedResume(p.project)
      setTimeout(() => setCopiedResume(null), 1500)
    } catch {
      try {
        const cmd = await invoke<string>('get_resume_command', { project: p.project, sessionId: latest.sessionId, agent: latest.agent })
        await navigator.clipboard.writeText(cmd)
        setCopiedResume(p.project)
        setTimeout(() => setCopiedResume(null), 1500)
      } catch { /* clipboard requires focus */ }
    }
  }

  // Activity calendar month navigation — anchored to the window's own end
  // month (capped at "now") for month/last3/advanced, fixed (no nav) for
  // prevMonth. An Advanced range entirely in the past opens on the month it
  // actually covers, not a blank current month. Clamped so you can't browse
  // before the selected window's own start or past its end.
  const calendarAnchor = tab === 'prevMonth' ? addMonths(new Date(), -1) : startOfMonth(new Date(effectiveEnd))
  const calendarMonth = addMonths(calendarAnchor, monthOffset)
  const windowStartMonth = startOfMonth(new Date(start))
  const canGoPrevMonth = tab !== 'prevMonth' && addMonths(calendarMonth, -1) >= windowStartMonth
  const canGoNextMonth = tab !== 'prevMonth' && calendarMonth < startOfMonth(new Date(effectiveEnd))

  const minIso = firstSessionTs != null ? toISODateLocal(firstSessionTs) : undefined
  const todayIso = toISODateLocal(Date.now())

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-3 flex-shrink-0 flex items-start justify-between gap-3 border-b border-[var(--c-border-sub)]">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight">My Work</h2>
          <p className="text-[14px] text-[var(--c-text-2)] mt-0.5">
            Everything happening across your projects
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 flex-wrap justify-end">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => selectTab(t.id)}
                className={`text-[13px] px-3 py-1 rounded-full border transition-colors ${tab === t.id ? 'border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
              >
                {t.id === 'advanced' && customRange
                  ? `${new Date(customRange.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}–${new Date(customRange.end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                  : t.label}
              </button>
            ))}
          </div>
          <RefreshButton onClick={onRefresh} busy={loading} />
        </div>
      </div>

      {showAdvancedPicker && (
        <div className="px-6 py-2.5 flex-shrink-0 flex items-center gap-2 flex-wrap border-b border-[var(--c-border-sub)] bg-[var(--c-surface-2)]/30">
          <input
            id="my-work-adv-start" type="date" min={minIso} max={todayIso}
            defaultValue={customRange ? toISODateLocal(customRange.start) : undefined}
            className="text-[12px] px-2 py-1 rounded-md border border-[var(--c-border)] bg-[var(--c-surface-2)] text-[var(--c-text-2)]"
          />
          <span className="text-[12px] text-[var(--c-text-3)]">to</span>
          <input
            id="my-work-adv-end" type="date" min={minIso} max={todayIso}
            defaultValue={customRange ? toISODateLocal(customRange.end) : undefined}
            className="text-[12px] px-2 py-1 rounded-md border border-[var(--c-border)] bg-[var(--c-surface-2)] text-[var(--c-text-2)]"
          />
          <button
            onClick={() => {
              const s = (document.getElementById('my-work-adv-start') as HTMLInputElement)?.value
              const e = (document.getElementById('my-work-adv-end') as HTMLInputElement)?.value
              applyCustomRange(s, e)
            }}
            className="text-[12px] px-2.5 py-1 rounded-md bg-[var(--c-accent)]/15 text-[var(--c-accent)] font-medium hover:bg-[var(--c-accent)]/25"
          >
            Apply
          </button>
          <span className="text-[11px] text-[var(--c-text-3)]">
            max 3 months{firstSessionTs != null && ` · no data before ${new Date(firstSessionTs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
        {loading && (
          <>
            <SkeletonTiles count={4} />
            <SkeletonCards count={3} />
          </>
        )}

        {!loading && sessions.length === 0 && (
          <p className="text-[14px] text-[var(--c-text-2)] text-center py-10">
            Nothing in progress. Start a session from any repo to see it here.
          </p>
        )}

        {!loading && sessions.length > 0 && (
          <>
            {/* Attention — full-width band, always first, any window */}
            {attention.length > 0 && (
              <div className="rounded-xl border p-3 mb-3" style={{ borderColor: 'color-mix(in srgb, #f59e0b 30%, transparent)' }}>
                <p className="text-[12px] font-bold text-amber-400 mb-2">⚠ Attention ({attention.length})</p>
                <div className="flex gap-2 flex-wrap">
                  {attention.map(a => (
                    <button
                      key={a.key}
                      onClick={() => onFocusWorktree(a.path)}
                      title={`${a.meta}\n${a.why}`}
                      className="font-mono text-[11px] px-2 py-1 rounded-md bg-[var(--c-surface-2)] hover:bg-[var(--c-surface-2)]/80 transition-colors truncate max-w-[220px]"
                    >
                      {a.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Active projects — dynamic column count, up to 6 across, shrinks as more show up */}
            {orderedProjects.length > 0 && (
              <div className="rounded-xl border border-[var(--c-border)] p-3 mb-4">
                <p className="text-[12px] font-semibold mb-2.5">
                  Active projects{orderedProjects.length > 12 ? ` · showing 12 of ${orderedProjects.length}` : ''}
                </p>
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(6, orderedProjects.length)},1fr)` }}>
                  {orderedProjects.slice(0, 12).map((p, i) => {
                    const branch = branchFor(p.project)
                    const live = p.sessions.some(s => s.isLive)
                    return (
                      <div
                        key={p.project}
                        className={`rounded-xl border bg-[var(--c-surface-2)]/40 p-2.5 min-w-0 ${live ? 'border-emerald-500/30' : 'border-[var(--c-border)]'}`}
                      >
                        <button
                          onClick={() => onOpenSession(p.sessions[0])}
                          title="Open latest transcript in Sessions"
                          className="w-full flex items-center gap-1.5 mb-1.5 text-left group/card min-w-0"
                        >
                          <span
                            className="w-5 h-5 rounded-md flex items-center justify-center font-mono font-bold text-[11px] text-black/80 shrink-0"
                            style={{ background: PALETTE[i % PALETTE.length] }}
                          >
                            {p.name.charAt(0).toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[12.5px] font-semibold truncate group-hover/card:text-[var(--c-accent)] transition-colors">{p.name}</div>
                          </div>
                          {live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
                        </button>
                        {branch && <div className="text-[10px] font-mono text-[var(--c-text-3)] truncate mb-1">⌥ {branch}</div>}
                        <div className="flex items-center gap-1 mb-1.5 min-w-0">
                          {[...new Set(p.sessions.map(s => s.agent))].slice(0, 2).map(a => (
                            <AgentBadge key={a} agent={a} />
                          ))}
                          <span className="text-[10px] text-[var(--c-text-3)] truncate">{relativeTime(p.lastTs)}</span>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          <button
                            onClick={() => handleResume(p)}
                            className={`text-[10.5px] px-2 py-0.5 rounded-md font-medium transition-colors ${copiedResume === p.project ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[var(--c-accent)]/15 text-[var(--c-accent)] hover:bg-[var(--c-accent)]/25'}`}
                          >
                            {copiedResume === p.project ? '✓' : '▶'}
                          </button>
                          {vscodeAvailable && (
                            <button
                              onClick={() => invoke('open_in_vscode', { path: p.project }).catch(() => showToast('error', 'Could not open VS Code'))}
                              title="Open in VS Code"
                              className="text-[10.5px] px-2 py-0.5 rounded-md border border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
                            >
                              VS
                            </button>
                          )}
                          <button
                            onClick={() => invoke('reveal_in_finder', { path: p.project }).catch(() => showToast('error', 'Could not reveal in Finder'))}
                            title="Reveal in Finder"
                            aria-label="Reveal in Finder"
                            className="px-1.5 py-0.5 rounded-md border border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                              className="w-3 h-3">
                              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Empty window — say so instead of rendering hollow cards below */}
            {windowed.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--c-border)] px-4 py-3 mb-3 text-center">
                <p className="text-[14px] text-[var(--c-text-2)]">
                  No sessions {tabLabel.toLowerCase() === 'today' ? 'yet today' : `in ${tabLabel.toLowerCase()}`}.
                </p>
              </div>
            )}

            {windowed.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 text-center py-3">
                    <div className="text-[22px] font-bold tabular-nums">{stats.sessions}</div>
                    <div className="text-[11px] text-[var(--c-text-3)] uppercase tracking-wide">Sessions</div>
                  </div>
                  <button
                    onClick={() => goTo('agents')}
                    className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 text-center py-3 hover:bg-[var(--c-accent)]/8 transition-colors"
                  >
                    <div className="text-[22px] font-bold tabular-nums text-emerald-400">{stats.live}</div>
                    <div className="text-[11px] text-[var(--c-text-3)] uppercase tracking-wide">Live · {agentMix.length} agent{agentMix.length === 1 ? '' : 's'}</div>
                  </button>
                </div>

                {/* Top 5 sessions / Top 5 repos — side by side, ranked by real tokens */}
                <div className="grid grid-cols-2 gap-3">
                  <Card title="Top 5 sessions" sub="Based on token usage">
                    {topSessions.length === 0 ? (
                      <p className="text-[12px] text-[var(--c-text-3)] py-1.5">No sessions in this period</p>
                    ) : (
                      <div>
                        {topSessions.map((s, i) => (
                          <button
                            key={s.sessionId}
                            onClick={() => onOpenSessionById(s.sessionId)}
                            title={s.display}
                            className={`w-full flex items-center gap-2 py-1.5 text-left hover:bg-[var(--c-hover)] -mx-1 px-1 rounded-md ${i < topSessions.length - 1 ? 'border-b border-[var(--c-border-sub)]' : ''}`}
                          >
                            <span className="text-[10.5px] font-mono text-[var(--c-text-3)] w-3.5 shrink-0">{i + 1}</span>
                            <span className="text-[12px] flex-1 min-w-0 truncate">{preview(s.display)}</span>
                            <span className="flex items-center gap-1.5 shrink-0">
                              <AgentBadge agent={s.agent} />
                              <span className="text-[10px] text-[var(--c-text-3)] max-w-[70px] truncate">{s.projectName || s.project}</span>
                              <span className="text-[11px] font-mono text-[var(--c-text-2)]">{formatTokens(s.tokens)}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </Card>
                  <Card title="Top 5 repos worked on" sub="Most recently worked on">
                    {topRepos.length === 0 ? (
                      <p className="text-[12px] text-[var(--c-text-3)] py-1.5">No activity in this period</p>
                    ) : (
                      <div>
                        {topRepos.map((p, i) => (
                          <button
                            key={p.project}
                            onClick={() => onOpenSessionsForProject(p.projectName || p.project, p.project)}
                            className={`w-full flex items-center gap-2 py-1.5 text-left hover:bg-[var(--c-hover)] -mx-1 px-1 rounded-md ${i < topRepos.length - 1 ? 'border-b border-[var(--c-border-sub)]' : ''}`}
                          >
                            <span className="text-[10.5px] font-mono text-[var(--c-text-3)] w-3.5 shrink-0">{i + 1}</span>
                            <span
                              className="w-[18px] h-[18px] rounded-md flex items-center justify-center font-mono font-bold text-[10px] text-black/80 shrink-0"
                              style={{ background: PALETTE[i % PALETTE.length] }}
                            >
                              {(p.projectName || p.project).charAt(0).toUpperCase()}
                            </span>
                            <span className="text-[12px] flex-1 min-w-0 truncate">{p.projectName || p.project}</span>
                            <span className="text-[10.5px] text-[var(--c-text-3)] shrink-0">{relativeTime(p.lastTs)}</span>
                            <span className="text-[11px] font-mono text-[var(--c-text-2)] shrink-0">{formatTokens(p.tokens)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>

                {/* Usage & cost — per-agent tiles, real tokens + cost */}
                {perAgentTotals.length > 0 && (
                  <Card title="Usage & cost">
                    <div className="flex items-baseline gap-2 mb-3">
                      <span className="text-[18px] font-bold">{formatTokens(totalUsageTokens)}</span>
                      <span className="text-[12px] text-[var(--c-text-3)]">· ${totalUsageCost.toFixed(2)} estimated</span>
                    </div>
                    {/* Capped + wrapping, like Active projects — this has to hold up
                        whether someone uses 1 agent or all 9 supported ones. Each
                        tile carries a full chart, so cap tighter than the plainer
                        project tiles (4 vs 6) to keep the y-axis legible. */}
                    <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${Math.min(4, perAgentTotals.length)},1fr)` }}>
                      {perAgentTotals.map(([agent, u]) => {
                        const { label, hex } = agentColor(agent)
                        const expanded = expandedAgent === agent
                        const daily = dailyUsageForAgent(agent)
                        return (
                          <div
                            key={agent}
                            className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 p-2.5 min-w-0"
                            style={expanded ? { gridColumn: '1 / -1' } : undefined}
                          >
                            <button
                              onClick={() => setExpandedAgent(expanded ? null : agent)}
                              className="w-full flex items-center justify-between gap-1.5 mb-1"
                            >
                              <span className="flex items-center gap-1.5 min-w-0">
                                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: hex }} />
                                <span className="text-[12.5px] font-semibold truncate">{label}</span>
                              </span>
                              <span className="text-[10px] text-[var(--c-text-3)] shrink-0">{expanded ? '‹ collapse' : 'expand ›'}</span>
                            </button>
                            <div className="text-[10.5px] text-[var(--c-text-3)] mb-1.5">
                              {formatTokens(u.tokens)} · ${u.cost.toFixed(2)}
                            </div>
                            <DailyBars
                              values={daily.tokens}
                              costs={daily.costs}
                              start={start}
                              color={hex}
                              height={expanded ? 90 : 40}
                              maxBars={expanded ? undefined : 16}
                              formatValue={v => formatTokens(v)}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </Card>
                )}

                {windowCommits.length > 0 && (
                  <Card title="Commits per day" sub="All branches, all repos">
                    <CommitBars commitSecs={windowCommits} daysBack={windowDays} start={start} />
                  </Card>
                )}

                {/* Activity — always last; shape follows the selected window */}
                <Card title="Activity">
                  {(tab === 'today' || tab === 'yesterday') ? (
                    <ActivityAgentCount
                      count={agentMix.length}
                      label={tab === 'today' ? 'active today' : 'active yesterday'}
                    />
                  ) : tab === 'week' ? (
                    <ActivityWeekRow sessionCounts={sessionCountsByDay} />
                  ) : (
                    <ActivityCalendar
                      sessionCounts={sessionCountsByDay}
                      monthDate={calendarMonth}
                      onNavigate={d => setMonthOffset(o => o + d)}
                      canGoPrev={canGoPrevMonth}
                      canGoNext={canGoNextMonth}
                    />
                  )}
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
