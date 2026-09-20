import { useState, useEffect, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { RepoWorktrees, SessionEntry, SessionInsights, AgentActivityPoint } from '../types'
import type { CommitEntry } from '../types'
import type { Section } from './ExpandedApp'
import {
  Card, CommitBars, RefreshButton, SkeletonTiles, SkeletonCards,
  ActivityCalendar, ActivityWeekRow, ActivityAgentCount,
  AgentStackedBars, RankedAgentBars, DailyBars,
} from './InsightWidgets'
import AgentBadge from '../components/history/AgentBadge'
import { formatTokens } from '../components/history/SessionStats'
import { agentColor } from '../constants/agentColors'
import { usePaletteIndex } from '../constants/agentColorPalettes'

const DAY = 86_400_000
const PALETTE = ['#6366f1', '#e8a94a', '#d98fd9', '#5fc9b8', '#7aa2e8', '#8fbf6b']
const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
// Tall enough for one row of project tiles including the optional branch
// line, short enough to reliably clip a second row before it peeks through.
const PROJECT_TILE_ROW_HEIGHT = 122
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

/** Time-weighted average concurrent sessions per agent per day, from each
 *  session's (start, end) interval — start = last-activity minus estimated
 *  duration, end = last-activity. One entry per day (index 0 = `start`'s
 *  calendar day); each maps agent → that agent's average concurrency that
 *  day (e.g. two of its sessions open the whole day sums to 2.0, one open
 *  half the day is 0.5). Valid to sum *across* agents too, since concurrency
 *  at any instant is additive — "All" can reuse plain per-agent stacking. */
export function computeDailyConcurrency(
  activity: { tsMs: number; agent: string; minutes: number }[],
  start: number,
  windowDays: number
): Record<string, number>[] {
  const days: Record<string, number>[] = Array.from({ length: windowDays }, () => ({}))
  for (const p of activity) {
    const sessionStart = p.tsMs - p.minutes * 60_000
    const sessionEnd = p.tsMs
    if (sessionEnd <= sessionStart) continue // unknown/zero duration — no overlap to attribute
    const firstIdx = Math.max(0, Math.floor((sessionStart - start) / DAY))
    const lastIdx = Math.min(windowDays - 1, Math.floor((sessionEnd - start) / DAY))
    for (let idx = firstIdx; idx <= lastIdx; idx++) {
      const dayStart = start + idx * DAY
      const overlapMs = Math.min(sessionEnd, dayStart + DAY) - Math.max(sessionStart, dayStart)
      if (overlapMs > 0) days[idx][p.agent] = (days[idx][p.agent] ?? 0) + overlapMs / DAY
    }
  }
  return days
}

/** Highest number of sessions truly open *at the same instant* on each day —
 *  a sweep-line over each session's (start, end) interval, not a sum. This
 *  is deliberately not additive across agents the way computeDailyConcurrency
 *  is (two agents peaking at different moments of the day don't add up to a
 *  combined peak), so callers pre-filter `activity` to whichever agent(s)
 *  they want the peak computed over — "All" means pass every session in and
 *  sweep them together, not sum each agent's own peak. */
export function computeDailyMaxConcurrency(
  activity: { tsMs: number; agent: string; minutes: number }[],
  start: number,
  windowDays: number
): number[] {
  const result = new Array(windowDays).fill(0)
  for (let idx = 0; idx < windowDays; idx++) {
    const dayStart = start + idx * DAY
    const dayEnd = dayStart + DAY
    const events: [number, number][] = []
    for (const p of activity) {
      const sessionStart = p.tsMs - p.minutes * 60_000
      const sessionEnd = p.tsMs
      if (sessionEnd <= sessionStart) continue
      const clampedStart = Math.max(sessionStart, dayStart)
      const clampedEnd = Math.min(sessionEnd, dayEnd)
      if (clampedEnd <= clampedStart) continue
      events.push([clampedStart, 1])
      events.push([clampedEnd, -1])
    }
    // Ties at the same instant: process the end (-1) before the start (+1),
    // so a session ending exactly when another begins doesn't count as
    // briefly overlapping.
    events.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    let running = 0
    let max = 0
    for (const [, delta] of events) {
      running += delta
      if (running > max) max = running
    }
    result[idx] = max
  }
  return result
}

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
  // Unused directly — agentColor() reads the active palette internally, this
  // just forces a re-render (and thus a fresh agentColor() call) when the
  // user changes it in Settings while this view is mounted.
  usePaletteIndex()
  const [tab, setTab] = useState<Tab>('month')
  const [copiedResume, setCopiedResume] = useState<string | null>(null)
  const [commits, setCommits] = useState<CommitEntry[]>([])
  const [vscodeAvailable, setVscodeAvailable] = useState(false)
  const [firstSessionTs, setFirstSessionTs] = useState<number | null>(null)
  const [customRange, setCustomRange] = useState<{ start: number; end: number } | null>(null)
  const [showAdvancedPicker, setShowAdvancedPicker] = useState(false)
  const [monthOffset, setMonthOffset] = useState(0)
  const [usageAgentFilter, setUsageAgentFilter] = useState('all')
  const [hoursAgentFilter, setHoursAgentFilter] = useState('all')
  const [commitsRepoFilter, setCommitsRepoFilter] = useState('all')
  const [concurrencyAgentFilter, setConcurrencyAgentFilter] = useState('all')
  const [projectsExpanded, setProjectsExpanded] = useState(false)
  const [agentActivity, setAgentActivity] = useState<AgentActivityPoint[]>([])

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
    invoke<CommitEntry[]>('get_commit_activity', { sinceDays: windowDays }).then(setCommits).catch(() => {})
  }, [windowDays])
  const windowCommitEntries = useMemo(
    () => commits.filter(c => c.ts * 1000 >= start && c.ts * 1000 < end),
    [commits, start, end]
  )
  const commitRepos = useMemo(
    () => [...new Set(windowCommitEntries.map(c => c.repoName))].sort(),
    [windowCommitEntries]
  )
  const windowCommits = useMemo(
    () => windowCommitEntries
      .filter(c => commitsRepoFilter === 'all' || c.repoName === commitsRepoFilter)
      .map(c => c.ts),
    [windowCommitEntries, commitsRepoFilter]
  )

  // Hours spent per agent — live from each source's own list() (no DB cache
  // involved, same pipeline the per-agent Activity chart in Tools uses), so
  // it needs its own upper-bound filter the same way commits does above.
  useEffect(() => {
    invoke<AgentActivityPoint[]>('get_agent_activity', { sinceMs: start }).then(setAgentActivity).catch(() => {})
  }, [start])
  const windowActivity = useMemo(
    () => agentActivity.filter(p => p.tsMs >= start && p.tsMs < end),
    [agentActivity, start, end]
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

  // One entry per day, each mapping agent → tokens that day — feeds the
  // unified (filterable) Usage & cost chart instead of a DailyBars-per-agent
  // loop, so "All" renders every agent stacked in one chart.
  const dailyUsageMatrix = useMemo(() => {
    const days: Record<string, number>[] = Array.from({ length: windowDays }, () => ({}))
    for (const s of insights?.perSession ?? []) {
      const idx = Math.floor((s.ts - start) / DAY)
      if (idx >= 0 && idx < windowDays) days[idx][s.agent] = (days[idx][s.agent] ?? 0) + s.tokens
    }
    return days
  }, [insights, start, windowDays])
  const usageActiveAgents = usageAgentFilter === 'all' ? perAgentTotals.map(([a]) => a) : [usageAgentFilter]

  // Same shape, in hours, from get_agent_activity — see the comment above
  // its fetch effect for why this doesn't reuse the token-cost aggregator.
  const hoursAgents = useMemo(() => {
    const totals = new Map<string, number>()
    for (const p of windowActivity) totals.set(p.agent, (totals.get(p.agent) ?? 0) + p.minutes)
    return [...totals.entries()].filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]).map(([a]) => a)
  }, [windowActivity])
  const dailyHoursMatrix = useMemo(() => {
    const days: Record<string, number>[] = Array.from({ length: windowDays }, () => ({}))
    for (const p of windowActivity) {
      const idx = Math.floor((p.tsMs - start) / DAY)
      if (idx >= 0 && idx < windowDays) days[idx][p.agent] = (days[idx][p.agent] ?? 0) + p.minutes / 60
    }
    return days
  }, [windowActivity, start, windowDays])
  const hoursActiveAgents = hoursAgentFilter === 'all' ? hoursAgents : [hoursAgentFilter]
  const totalHours = useMemo(
    () => windowActivity
      .filter(p => hoursAgentFilter === 'all' || p.agent === hoursAgentFilter)
      .reduce((sum, p) => sum + p.minutes, 0) / 60,
    [windowActivity, hoursAgentFilter]
  )
  // Day-level windows (Today/Yesterday) are a single number — an average
  // over one day is meaningless. Week shows the daily average; month-and-up
  // also shows a weekly average, since a month of daily numbers is too
  // noisy to compare at a glance without it.
  const hoursGranularity: 'day' | 'week' | 'month' =
    tab === 'today' || tab === 'yesterday' ? 'day' : tab === 'week' ? 'week' : 'month'

  // Parallel sessions — headline metric is the true peak (sweep-line max
  // overlap, see computeDailyMaxConcurrency), not an average: the question
  // that actually matters day to day is "did I ever have 2+ sessions open
  // at once," not a time-weighted number that reads as ~0 for anyone who
  // mostly works one session at a time. The time-weighted average from
  // computeDailyConcurrency still backs the small "avg" subtext.
  const concurrencyAgents = useMemo(() => {
    const totals = new Map<string, number>()
    for (const p of windowActivity) totals.set(p.agent, (totals.get(p.agent) ?? 0) + p.minutes)
    return [...totals.entries()].filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]).map(([a]) => a)
  }, [windowActivity])
  const concurrencyFilteredActivity = useMemo(
    () => concurrencyAgentFilter === 'all' ? windowActivity : windowActivity.filter(p => p.agent === concurrencyAgentFilter),
    [windowActivity, concurrencyAgentFilter]
  )
  const dailyMaxConcurrency = useMemo(
    () => computeDailyMaxConcurrency(concurrencyFilteredActivity, start, windowDays),
    [concurrencyFilteredActivity, start, windowDays]
  )
  const concurrencyStats = useMemo(() => {
    const avgSeries = computeDailyConcurrency(concurrencyFilteredActivity, start, windowDays)
    const dailyAvgTotals = avgSeries.map(day => Object.values(day).reduce((s, v) => s + v, 0))
    const avg = dailyAvgTotals.length > 0 ? dailyAvgTotals.reduce((a, b) => a + b, 0) / dailyAvgTotals.length : 0
    const peak = Math.max(0, ...dailyMaxConcurrency)
    const peakDayIdx = dailyMaxConcurrency.indexOf(peak)
    const daysWithOverlap = dailyMaxConcurrency.filter(v => v >= 2).length
    // Which agent's own sessions most often overlapped with each other —
    // its own peak-overlap-with-itself, not its share of total activity.
    const mostParallelAgent = concurrencyAgents.length > 0
      ? concurrencyAgents.reduce((best, a) => {
          const ownPeak = Math.max(0, ...computeDailyMaxConcurrency(windowActivity.filter(p => p.agent === a), start, windowDays))
          return ownPeak > best.peak ? { agent: a, peak: ownPeak } : best
        }, { agent: concurrencyAgents[0], peak: -1 }).agent
      : null
    return { avg, peak, peakDayIdx, daysWithOverlap, mostParallelAgent }
  }, [concurrencyFilteredActivity, windowActivity, concurrencyAgents, start, windowDays, dailyMaxConcurrency])

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

  // "This period" side panel next to the Activity calendar — same
  // sessionCountsByDay the calendar cells render, so the numbers agree with
  // what's visually right next to them.
  const activityStats = useMemo(() => {
    let streak = 0
    for (let d = new Date(effectiveEnd); sessionCountsByDay.get(dateKey(d.getTime())); d.setDate(d.getDate() - 1)) {
      streak++
    }
    const byWeekday = new Array(7).fill(0)
    for (const [key, count] of sessionCountsByDay) byWeekday[new Date(`${key}T00:00:00`).getDay()] += count
    const topWeekday = byWeekday.some(c => c > 0)
      ? WEEKDAY_LABELS[byWeekday.indexOf(Math.max(...byWeekday))]
      : null
    return { streak, topWeekday, sessions: stats.sessions, topAgent: perAgentTotals[0]?.[0] ?? null }
  }, [sessionCountsByDay, effectiveEnd, stats.sessions, perAgentTotals])

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

            {/* Active projects — width-based columns (auto-fill). Collapsed
                to a single row by default (overflow clipped to one tile's
                height) regardless of window width, so a narrow window
                doesn't push the rest of the page down under extra rows of
                project tiles; "Show all" reveals the rest on demand. */}
            {orderedProjects.length > 0 && (
              <div className="rounded-xl border border-[var(--c-border)] p-3 mb-4">
                <p className="text-[12px] font-semibold mb-2.5">
                  Active projects{orderedProjects.length > 12 ? ` · showing 12 of ${orderedProjects.length}` : ''}
                </p>
                <div
                  className="grid gap-3"
                  style={{
                    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                    maxHeight: projectsExpanded ? 'none' : PROJECT_TILE_ROW_HEIGHT,
                    overflow: 'hidden',
                  }}
                >
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
                        <div className="flex items-center flex-wrap gap-1 mb-1.5 min-w-0">
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
                {orderedProjects.length > 6 && (
                  <div className="flex justify-center mt-2.5">
                    <button
                      onClick={() => setProjectsExpanded(e => !e)}
                      className="text-[10.5px] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
                    >
                      {projectsExpanded ? 'Show less' : `Show all (${Math.min(orderedProjects.length, 12)})`}
                    </button>
                  </div>
                )}
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

                {/* Usage & cost / Commits per day — half row each, so both
                    fit without one crowding the other out. */}
                <div className="grid grid-cols-2 gap-3">
                  {perAgentTotals.length > 0 && (
                    <Card title="Usage & cost">
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-[18px] font-bold">{formatTokens(totalUsageTokens)}</span>
                        <span className="text-[12px] text-[var(--c-text-3)]">· ${totalUsageCost.toFixed(2)} estimated</span>
                      </div>
                      <AgentFilterChips
                        agents={perAgentTotals.map(([a]) => a)}
                        value={usageAgentFilter}
                        onChange={setUsageAgentFilter}
                      />
                      <AgentStackedBars
                        seriesByDay={dailyUsageMatrix}
                        activeAgents={usageActiveAgents}
                        colorFor={a => agentColor(a).hex}
                        start={start}
                        formatValue={v => formatTokens(v)}
                      />
                    </Card>
                  )}

                  {windowCommitEntries.length > 0 && (
                    <Card title="Commits per day" sub="All branches, selected repo">
                      {commitRepos.length > 1 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          <FilterChip label="All" active={commitsRepoFilter === 'all'} onClick={() => setCommitsRepoFilter('all')} />
                          {commitRepos.map(r => (
                            <FilterChip key={r} label={r} active={commitsRepoFilter === r} onClick={() => setCommitsRepoFilter(r)} />
                          ))}
                        </div>
                      )}
                      <CommitBars commitSecs={windowCommits} daysBack={windowDays} start={start} />
                    </Card>
                  )}
                </div>

                {/* Usage per agent / Hours spent — half row each. */}
                <div className="grid grid-cols-2 gap-3">
                  {perAgentTotals.length === 1 ? (
                    <Card title="Usage per agent">
                      {(() => {
                        const [agent, u] = perAgentTotals[0]
                        const { label, hex } = agentColor(agent)
                        const avgPerSession = stats.sessions > 0 ? u.tokens / stats.sessions : 0
                        return (
                          <>
                            <div className="flex items-center gap-2 mb-2.5">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: hex }} />
                              <span className="text-[13px] font-semibold">{label}</span>
                              <span className="text-[11px] text-[var(--c-text-3)]">— only agent used this window</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <StatBox value={formatTokens(u.tokens)} label="total tokens" color={hex} />
                              <StatBox value={`$${u.cost.toFixed(2)}`} label="estimated cost" hint="Estimated from this model's published per-token pricing — not a billed amount." />
                              <StatBox value={stats.sessions} label={`session${stats.sessions === 1 ? '' : 's'}`} />
                              <StatBox value={formatTokens(avgPerSession)} label="avg tokens / session" />
                            </div>
                          </>
                        )
                      })()}
                    </Card>
                  ) : perAgentTotals.length > 1 && (
                    <Card title="Usage per agent" sub="Share of total tokens, this window">
                      <RankedAgentBars
                        items={perAgentTotals.map(([agent, u]) => {
                          const { label, hex } = agentColor(agent)
                          return {
                            agent, label, color: hex, value: u.tokens,
                            formatted: formatTokens(u.tokens),
                            pct: totalUsageTokens > 0 ? Math.round((u.tokens / totalUsageTokens) * 100) : 0,
                          }
                        })}
                      />
                    </Card>
                  )}

                  {hoursAgents.length > 0 && (
                    <Card title="Hours spent">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-[18px] font-bold">{totalHours.toFixed(1)}h</span>
                        <span className="text-[12px] text-[var(--c-text-3)]">across all agents</span>
                      </div>
                      {hoursGranularity !== 'day' && (
                        <div className="flex gap-3 mb-2 text-[10.5px] text-[var(--c-text-2)]">
                          <span title="Total hours in this window divided by the number of days in it.">
                            <b className="font-mono text-[var(--c-text)]">{(totalHours / windowDays).toFixed(1)}h</b> avg / day
                          </span>
                          {hoursGranularity === 'month' && (
                            <span title="Total hours in this window divided by the number of weeks in it.">
                              <b className="font-mono text-[var(--c-text)]">{(totalHours / (windowDays / 7)).toFixed(1)}h</b> avg / week
                            </span>
                          )}
                        </div>
                      )}
                      <AgentFilterChips agents={hoursAgents} value={hoursAgentFilter} onChange={setHoursAgentFilter} />
                      <AgentStackedBars
                        seriesByDay={dailyHoursMatrix}
                        activeAgents={hoursActiveAgents}
                        colorFor={a => agentColor(a).hex}
                        start={start}
                        formatValue={v => `${v.toFixed(1)}h`}
                      />
                    </Card>
                  )}
                </div>

                {/* Parallel sessions / concurrency stats — half row each. */}
                {concurrencyAgents.length > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    <Card title="Parallel sessions" sub="Highest number of sessions open at once, per day">
                      <div className="flex items-baseline gap-2 mb-2">
                        <span
                          className="text-[18px] font-bold"
                          title="The most sessions you had open at the exact same moment, on this window's busiest day."
                        >
                          {concurrencyStats.peak}×
                        </span>
                        <span
                          className="text-[11px] text-[var(--c-text-3)]"
                          title="Time-weighted average across the whole window — how much of the time multiple sessions overlapped, not just whether they ever did. Below 1.0x means you were mostly working one session at a time."
                        >
                          {concurrencyStats.avg.toFixed(2)}× avg concurrent
                        </span>
                      </div>
                      <AgentFilterChips agents={concurrencyAgents} value={concurrencyAgentFilter} onChange={setConcurrencyAgentFilter} />
                      <DailyBars
                        values={dailyMaxConcurrency}
                        start={start}
                        color="var(--c-accent)"
                        formatValue={v => `${v}×`}
                      />
                    </Card>
                    <Card title="Concurrency stats">
                      <div className="grid grid-cols-2 gap-2">
                        <StatBox
                          value={`${concurrencyStats.peak}×`}
                          label="peak concurrent"
                          hint="The most sessions open at the same instant on any single day in this window."
                        />
                        <StatBox
                          value={concurrencyStats.daysWithOverlap}
                          label={`day${concurrencyStats.daysWithOverlap === 1 ? '' : 's'} with overlap`}
                          hint="Days where 2 or more sessions were genuinely open at the same time, even briefly."
                        />
                        <StatBox
                          value={concurrencyStats.peakDayIdx >= 0
                            ? new Date(start + concurrencyStats.peakDayIdx * DAY).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                            : '—'}
                          label="busiest day"
                          hint="The day this window's peak concurrency happened on."
                        />
                        <StatBox
                          value={concurrencyStats.mostParallelAgent ? agentColor(concurrencyStats.mostParallelAgent).label : '—'}
                          label="most parallel agent"
                          color={concurrencyStats.mostParallelAgent ? agentColor(concurrencyStats.mostParallelAgent).hex : undefined}
                          hint="Which agent most often had multiple of its own sessions open at once (e.g. two Claude windows running in parallel) — not just the agent you used most."
                        />
                      </div>
                    </Card>
                  </div>
                )}

                {/* Activity / this-period stats — half row each. */}
                <div className="grid grid-cols-2 gap-3">
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
                  <Card title={tab === 'advanced' ? 'This period' : tabLabel}>
                    <div className="grid grid-cols-2 gap-2">
                      <StatBox
                        value={activityStats.streak}
                        label={`day streak${activityStats.streak === 1 ? '' : 's'}`}
                        hint="Consecutive days with at least one session, counting back from the end of this window."
                      />
                      <StatBox value={activityStats.sessions} label="sessions" hint="Total sessions started in this window, across every agent." />
                      <StatBox
                        value={activityStats.topWeekday ?? '—'}
                        label="most active day"
                        hint="The day of the week with the most sessions, summed across every week in this window."
                      />
                      <StatBox
                        value={activityStats.topAgent ? agentColor(activityStats.topAgent).label : '—'}
                        label="most-used agent"
                        color={activityStats.topAgent ? agentColor(activityStats.topAgent).hex : undefined}
                        hint="The agent with the most tokens used in this window."
                      />
                    </div>
                  </Card>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function FilterChip({ label, active, onClick, dotColor }: {
  label: string
  active: boolean
  onClick: () => void
  dotColor?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1.5 transition-colors ${
        active
          ? 'bg-[var(--c-accent)] border-[var(--c-accent)] text-white'
          : 'border-[var(--c-border)] text-[var(--c-text-2)] hover:border-[var(--c-text-3)]'
      }`}
    >
      {dotColor && <span className="w-1.5 h-1.5 rounded-sm shrink-0" style={{ background: active ? 'white' : dotColor }} />}
      {label}
    </button>
  )
}

/** "All" + one chip per agent, single-select. Shared shape for Usage & cost
 *  and Hours spent — both filter the same way over the same day grid. */
function AgentFilterChips({ agents, value, onChange }: {
  agents: string[]
  value: string
  onChange: (agent: string) => void
}) {
  if (agents.length <= 1) return null
  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      <FilterChip label="All" active={value === 'all'} onClick={() => onChange('all')} />
      {agents.map(a => {
        const { label, hex } = agentColor(a)
        return <FilterChip key={a} label={label} active={value === a} onClick={() => onChange(a)} dotColor={hex} />
      })}
    </div>
  )
}

function StatBox({ value, label, color, hint }: { value: string | number; label: string; color?: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-[var(--c-border-sub)] p-2.5 flex flex-col justify-center gap-0.5" title={hint}>
      <span className="text-[17px] font-bold leading-none" style={color ? { color } : undefined}>{value}</span>
      <span className="text-[9.5px] text-[var(--c-text-3)]">{label}</span>
    </div>
  )
}
