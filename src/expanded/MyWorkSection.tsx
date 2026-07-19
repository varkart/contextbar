import { useState, useEffect, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { RepoWorktrees, SessionEntry } from '../types'
import type { Section } from './ExpandedApp'
import { Card, CommitBars, RefreshButton, SkeletonTiles, SkeletonCards } from './InsightWidgets'
import AgentBadge from '../components/history/AgentBadge'
import { formatTokens } from '../components/history/SessionStats'

const DAY = 86_400_000
const PALETTE = ['#6366f1', '#e8a94a', '#d98fd9', '#5fc9b8', '#7aa2e8', '#8fbf6b']
const AGENT_COLORS: Record<string, string> = { claude: '#818cf8', codex: '#34d399', gemini: '#38bdf8', agy: '#e879f9' }

type Tab = 'today' | 'yesterday' | 'week' | 'last7'
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This Week' },
  { id: 'last7', label: 'Last 7 Days' },
]

// Open-ended windows (today/week/last7) end at Infinity, not a captured
// Date.now() — otherwise a live session whose timestamp advances past the
// frozen end silently falls out of the window after every refresh.
function windowFor(tab: Tab): [number, number] {
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  const m = midnight.getTime()
  if (tab === 'today') return [m, Infinity]
  if (tab === 'yesterday') return [m - DAY, m]
  if (tab === 'week') {
    const day = (midnight.getDay() + 6) % 7 // Monday = 0
    return [m - day * DAY, Infinity]
  }
  return [Date.now() - 7 * DAY, Infinity]
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
  onOpenSessionsForProject: (name: string, path: string) => void
  showToast: (type: 'success' | 'error', message: string) => void
}

function todayKey(): string {
  return `contextbar:expanded:peakbanner:${new Date().toISOString().slice(0, 10)}`
}

export default function MyWorkSection({ sessions, repos, loading, goTo, onRefresh, onOpenSession, onOpenSessionsForProject, showToast }: MyWorkSectionProps) {
  const [tab, setTab] = useState<Tab>('today')
  const [copiedResume, setCopiedResume] = useState<string | null>(null)
  const [commitTs, setCommitTs] = useState<number[]>([])
  const [vscodeAvailable, setVscodeAvailable] = useState(false)
  const [peakDismissed, setPeakDismissed] = useState(() => !!localStorage.getItem(todayKey()))

  useEffect(() => {
    invoke<number[]>('get_commit_activity', { sinceDays: 14 }).then(setCommitTs).catch(() => {})
    invoke<boolean>('is_vscode_installed').then(setVscodeAvailable).catch(() => {})
  }, [sessions])

  const tabLabel = TABS.find(t => t.id === tab)?.label ?? ''

  // Recomputed on every session refresh so day boundaries stay current
  // (midnight rollover, rolling last-7-days start).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const [start, end] = useMemo(() => windowFor(tab), [tab, sessions])
  const windowed = useMemo(
    () => sessions.filter(s => s.timestamp >= start && s.timestamp < end),
    [sessions, start, end]
  )
  const projects = useMemo(() => groupByProject(windowed), [windowed])

  const stats = useMemo(() => ({
    sessions: windowed.length,
    prompts: windowed.reduce((n, s) => n + s.promptCount, 0),
    live: windowed.filter(s => s.isLive).length,
    projects: projects.length,
  }), [windowed, projects])

  // Per-agent usage inside the selected window.
  const windowedUsage = useMemo(() => {
    const map = new Map<string, { sessions: number; prompts: number; tokens: number }>()
    for (const s of windowed) {
      const u = map.get(s.agent) ?? { sessions: 0, prompts: 0, tokens: 0 }
      u.sessions += 1
      u.prompts += s.promptCount
      u.tokens += s.totalTokens
      map.set(s.agent, u)
    }
    // Sort and share by prompts: token counts are not comparable across
    // agents (Claude list entries carry 0; Codex reports cumulative context).
    return [...map.entries()].sort((a, b) => b[1].prompts - a[1].prompts || b[1].sessions - a[1].sessions)
  }, [windowed])

  // Commits restricted to the selected window; bar chart spans exactly it.
  const windowCommits = useMemo(
    () => commitTs.filter(sec => sec * 1000 >= start && sec * 1000 < end),
    [commitTs, start, end]
  )
  const windowDays = Math.max(1, Math.ceil((Date.now() - start) / DAY))

  // Peak-end banner — always summarizes "today", independent of the
  // selected tab, so it doesn't disappear when browsing other windows.
  const peakSummary = useMemo(() => {
    const [start, end] = windowFor('today')
    const today = sessions.filter(s => s.timestamp >= start && s.timestamp < end)
    if (!today.length) return null
    const todayProjects = groupByProject(today)
    return {
      sessionCount: today.length,
      prompts: today.reduce((n, s) => n + s.promptCount, 0),
      projectCount: todayProjects.length,
      topProject: todayProjects[0]?.name ?? null,
    }
  }, [sessions])

  const dismissPeakBanner = () => {
    localStorage.setItem(todayKey(), '1')
    setPeakDismissed(true)
  }

  // Session share per agent in the selected window
  const agentMix = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of windowed) counts.set(s.agent, (counts.get(s.agent) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [windowed])

  // Momentum always looks at the trailing 7 days, independent of the tab.
  // Cells run today-first: index 0 = today, index 6 = six days ago.
  const momentum = useMemo(() => {
    const since = Date.now() - 7 * DAY
    const recent = sessions.filter(s => s.timestamp >= since)
    return groupByProject(recent).slice(0, 5).map(p => {
      const daysActive = new Set(p.sessions.map(s => Math.floor((Date.now() - s.timestamp) / DAY)))
      const cells = Array.from({ length: 7 }, (_, i) => daysActive.has(i))
      let streak = 0
      for (let d = 0; d < 7 && daysActive.has(d); d++) streak++
      const errors = p.sessions.reduce((n, s) => n + s.errorCount, 0)
      const tag = errors === 0 ? 'Smooth' : errors <= 3 ? 'Mixed' : 'Friction'
      const activeDayLabels = [...daysActive].sort((a, b) => a - b)
        .map(d => d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`)
      const tooltip = [
        `${p.sessions.length} session${p.sessions.length === 1 ? '' : 's'} · ${p.prompts} prompt${p.prompts === 1 ? '' : 's'}`,
        errors > 0 ? `${errors} error${errors === 1 ? '' : 's'}` : 'no errors',
        `active: ${activeDayLabels.join(', ')}`,
        streak > 1 ? `${streak}-day streak` : null,
        'click to view sessions',
      ].filter(Boolean).join('\n')
      return { ...p, cells, streak, tag, tooltip }
    })
  }, [sessions])

  // Needs attention — derived from the worktree scan; omitted entirely when empty.
  const attention = useMemo(() => {
    const items: {
      key: string
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

  // Live projects float above everything, then most recently active.
  const orderedProjects = useMemo(() => {
    const isLive = (p: ProjectAgg) => p.sessions.some(s => s.isLive)
    return [...projects].sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || b.lastTs - a.lastTs)
  }, [projects])

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
      const cmd = `cd "${p.project}" && claude --resume ${latest.sessionId}`
      try {
        await navigator.clipboard.writeText(cmd)
        setCopiedResume(p.project)
        setTimeout(() => setCopiedResume(null), 1500)
      } catch { /* clipboard requires focus */ }
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-3 flex-shrink-0 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold tracking-tight">My Work</h2>
          <p className="text-[12px] text-[var(--c-text-3)] mt-0.5">
            Everything happening across your projects
          </p>
        </div>
        <RefreshButton onClick={onRefresh} busy={loading} />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {!loading && peakSummary && !peakDismissed && (
          <div className="flex items-center gap-3 rounded-xl border border-indigo-400/30 bg-gradient-to-br from-indigo-400/10 to-fuchsia-400/10 px-4 py-3 mb-4">
            <span className="text-[19px] leading-none">🎯</span>
            <div className="flex-1 min-w-0">
              <b className="text-[12.5px] font-semibold">Nice work today</b>
              <p className="text-[11.5px] text-[var(--c-text-2)] mt-0.5">
                {peakSummary.sessionCount} session{peakSummary.sessionCount === 1 ? '' : 's'}
                {peakSummary.prompts > 0 && `, ${peakSummary.prompts} prompt${peakSummary.prompts === 1 ? '' : 's'}`}
                {peakSummary.topProject && (
                  <> across {peakSummary.projectCount} project{peakSummary.projectCount === 1 ? '' : 's'} — most active on{' '}
                    <b className="text-indigo-400">{peakSummary.topProject}</b>
                  </>
                )}
              </p>
            </div>
            <button
              onClick={dismissPeakBanner}
              aria-label="Dismiss"
              className="text-[var(--c-text-3)] hover:text-[var(--c-text)] transition-colors flex-shrink-0"
            >
              ✕
            </button>
          </div>
        )}
        {/* Time tabs */}
        <div className="flex gap-1.5 mb-4">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-[11px] px-3 py-1 rounded-full border transition-colors ${tab === t.id ? 'border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <>
            <SkeletonTiles count={4} />
            <SkeletonCards count={3} />
          </>
        )}

        {!loading && sessions.length === 0 && (
          <p className="text-[12px] text-[var(--c-text-3)] text-center py-10">
            Nothing in progress. Start a session from any repo to see it here.
          </p>
        )}

        {!loading && sessions.length > 0 && (
          <>
            {/* Stat strip — sessions / live / projects + agent chips */}
            <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 grid grid-cols-4 divide-x divide-[var(--c-border)]/60 mb-3">
              <Stat n={String(stats.sessions)} lbl="Sessions" />
              <Stat n={String(stats.live)} lbl="Live" color={stats.live > 0 ? 'text-emerald-400' : ''} />
              <Stat n={String(stats.projects)} lbl="Projects" color="text-[var(--c-accent)]" />
              <button
                onClick={() => goTo('agents')}
                title="Open the Agents section"
                className="px-3 py-3 text-center rounded-r-xl hover:bg-[var(--c-accent)]/8 transition-colors group/agents"
              >
                <div className="text-[17px] font-semibold tabular-nums group-hover/agents:text-[var(--c-accent)] transition-colors">
                  {agentMix.length}
                </div>
                <div className="text-[10px] text-[var(--c-text-3)] uppercase tracking-wider mt-0.5">
                  Agents <span className="opacity-0 group-hover/agents:opacity-100 transition-opacity">→</span>
                </div>
              </button>
            </div>

            {/* Empty window — say so instead of rendering hollow cards */}
            {windowed.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--c-border)] px-4 py-3 mb-3 text-center">
                <p className="text-[12px] text-[var(--c-text-3)]">
                  No sessions {tabLabel.toLowerCase() === 'today' ? 'yet today' : tabLabel.toLowerCase()}.
                  {(momentum.length > 0 || attention.length > 0) && (
                    <>{' '}
                      {[momentum.length > 0 && '7-day momentum', attention.length > 0 && 'repo attention']
                        .filter(Boolean).join(' and ')} below {momentum.length > 0 && attention.length > 0 ? 'are' : 'is'} window-independent.
                    </>
                  )}
                </p>
              </div>
            )}

            {/* Active projects — the actionable block, directly under the stats */}
            {orderedProjects.length > 0 && (
              <div className="mb-4">
                <SectionLabel>
                  Active projects — {tabLabel}{orderedProjects.length > 9 ? ` · showing 9 of ${orderedProjects.length}` : ''}
                </SectionLabel>
                <div className="grid grid-cols-3 gap-3">
                  {orderedProjects.slice(0, 9).map((p, i) => {
                    const branch = branchFor(p.project)
                    const live = p.sessions.some(s => s.isLive)
                    return (
                      <div
                        key={p.project}
                        className={`rounded-xl border bg-[var(--c-surface-2)]/40 p-3 ${live ? 'border-emerald-500/30 shadow-[0_0_14px_rgba(52,211,153,0.07)]' : 'border-[var(--c-border)]'}`}
                      >
                        <button
                          onClick={() => onOpenSession(p.sessions[0])}
                          title="Open latest transcript in Sessions"
                          className="w-full flex items-center gap-2 mb-1.5 text-left group/card"
                        >
                          <span
                            className="w-6 h-6 rounded-md flex items-center justify-center font-mono font-bold text-[11px] text-black/80 shrink-0"
                            style={{ background: PALETTE[i % PALETTE.length] }}
                          >
                            {p.name.charAt(0).toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[12.5px] font-semibold truncate group-hover/card:text-[var(--c-accent)] transition-colors">{p.name}</div>
                          </div>
                          {live && (
                            <span className="text-[9px] font-mono px-1.5 py-px rounded-full bg-emerald-500/15 text-emerald-400 shrink-0">● live</span>
                          )}
                        </button>
                        {branch && <div className="text-[10px] font-mono text-[var(--c-text-3)] truncate mb-1">⌥ {branch}</div>}
                        <div className="flex items-center gap-1.5 mb-1.5">
                          {[...new Set(p.sessions.map(s => s.agent))].map(a => (
                            <AgentBadge key={a} agent={a} />
                          ))}
                          <span className="text-[10px] text-[var(--c-text-3)] truncate">
                            {relativeTime(p.lastTs)} · {p.sessions.length} sess · {p.prompts} prompts
                          </span>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleResume(p)}
                            className={`text-[10.5px] px-2.5 py-1 rounded-md font-medium transition-colors ${copiedResume === p.project ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[var(--c-accent)]/15 text-[var(--c-accent)] hover:bg-[var(--c-accent)]/25'}`}
                          >
                            {copiedResume === p.project ? '✓ Opened' : '▶ Resume'}
                          </button>
                          {vscodeAvailable && (
                            <button
                              onClick={() => invoke('open_in_vscode', { path: p.project }).catch(() => showToast('error', 'Could not open VS Code'))}
                              title="Open project in Visual Studio Code"
                              className="text-[10.5px] px-2.5 py-1 rounded-md border border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
                            >
                              VS Code
                            </button>
                          )}
                          <button
                            onClick={() => invoke('reveal_in_finder', { path: p.project }).catch(() => showToast('error', 'Could not reveal in Finder'))}
                            title="Reveal in Finder"
                            className="text-[10.5px] px-2 py-1 rounded-md border border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
                          >
                            ⌖
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Insights — risk first, then windowed charts, then 7-day momentum */}
            {(windowedUsage.length > 0 || windowCommits.length > 0 || attention.length > 0 || momentum.length > 0) && (
            <div>
            <SectionLabel>Insights</SectionLabel>
            <div className="grid grid-cols-3 gap-3 items-start">
              {/* Needs attention */}
              {attention.length > 0 && (
                <BentoCard label="Needs attention — any window" accent="text-amber-400">
                  <div className="space-y-2">
                    {attention.map(a => (
                      <button
                        key={a.key}
                        onClick={() => goTo('worktrees')}
                        title={a.why}
                        className={`w-full text-left rounded-lg border-l-2 bg-[var(--c-surface-2)]/60 px-2.5 py-2 hover:bg-[var(--c-surface-2)] transition-colors ${a.kind === 'uncommitted' ? 'border-l-rose-400' : 'border-l-amber-400'}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[11.5px] font-mono font-semibold truncate">{a.title}</span>
                          <span className={`text-[9px] font-mono px-1.5 py-px rounded-full shrink-0 ${a.kind === 'uncommitted' ? 'bg-rose-500/15 text-rose-400' : 'bg-amber-500/15 text-amber-400'}`}>
                            {a.kind === 'uncommitted' ? 'uncommitted' : 'not merged'}
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--c-text-3)] mt-0.5 truncate">{a.meta}</p>
                      </button>
                    ))}
                  </div>
                </BentoCard>
              )}

              {/* Usage by agent — follows the selected window */}
              {windowedUsage.length > 0 && (
                <BentoCard label={`Usage by agent — ${tabLabel}`}>
                  <div className="space-y-2.5">
                    {windowedUsage.map(([agent, u]) => {
                      const totalPrompts = windowedUsage.reduce((n, [, x]) => n + x.prompts, 0)
                      const totalSessions = windowedUsage.reduce((n, [, x]) => n + x.sessions, 0)
                      const pct = totalPrompts > 0
                        ? (u.prompts / totalPrompts) * 100
                        : (u.sessions / Math.max(1, totalSessions)) * 100
                      return (
                        <div key={agent}>
                          <div className="flex items-baseline justify-between mb-1">
                            <span className="text-[11px] font-medium capitalize flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-sm inline-block" style={{ background: AGENT_COLORS[agent] ?? '#71717a' }} />
                              {agent}
                            </span>
                            <span className="text-[10px] text-[var(--c-text-3)] tabular-nums">
                              {u.sessions} sess · {u.prompts} prompts{u.tokens > 0 ? ` · ${formatTokens(u.tokens)}` : ''}
                            </span>
                          </div>
                          <div className="h-1 rounded-full bg-[var(--c-border)] overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.max(3, pct)}%`, background: AGENT_COLORS[agent] ?? '#71717a' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </BentoCard>
              )}

              {/* Momentum — today-first cells, click through to sessions */}
              {momentum.length > 0 && (
                <BentoCard label="Momentum — last 7 days · today first">
                  <div className="space-y-1">
                    {momentum.map(m => (
                      <button
                        key={m.project}
                        onClick={() => onOpenSessionsForProject(m.name, m.project)}
                        title={m.tooltip}
                        className="w-full flex items-center gap-2 rounded-md px-1.5 py-1.5 -mx-1.5 hover:bg-[var(--c-surface-2)] transition-colors text-left group/mom"
                      >
                        <span className="text-[11px] font-mono font-semibold w-24 truncate group-hover/mom:text-[var(--c-accent)] transition-colors">{m.name}</span>
                        <div className="flex-1 flex gap-0.5">
                          {m.cells.map((filled, i) => (
                            <span key={i} className={`flex-1 h-1.5 rounded-sm ${filled ? 'bg-emerald-400' : 'bg-[var(--c-border)]'}`} />
                          ))}
                        </div>
                        <span className={`text-[9px] font-mono px-1.5 py-px rounded-full shrink-0 ${m.tag === 'Smooth' ? 'bg-emerald-500/15 text-emerald-400' : m.tag === 'Mixed' ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400'}`}>
                          {m.tag}
                        </span>
                      </button>
                    ))}
                    <p className="text-[9px] text-[var(--c-text-3)] pt-1">← today · 6d ago →</p>
                  </div>
                </BentoCard>
              )}

              {windowCommits.length > 0 && (
                <Card title={`Commits per day — ${tabLabel}`} sub="All branches, all repos">
                  <CommitBars commitSecs={windowCommits} daysBack={windowDays} />
                </Card>
              )}
            </div>
            </div>
            )}


          </>
        )}
      </div>
    </div>
  )
}

function Stat({ n, lbl, color }: { n: string; lbl: string; color?: string }) {
  return (
    <div className="px-3 py-3 text-center">
      <div className={`text-[17px] font-semibold tabular-nums ${color ?? ''}`}>{n}</div>
      <div className="text-[10px] text-[var(--c-text-3)] uppercase tracking-wider mt-0.5">{lbl}</div>
    </div>
  )
}

function BentoCard({ label, accent, children }: { label: string; accent?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 p-3.5">
      <p className={`text-[10px] font-mono uppercase tracking-wider mb-2.5 ${accent ?? 'text-[var(--c-text-3)]'}`}>{label}</p>
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-mono text-[var(--c-text-3)] uppercase tracking-wider mb-2">{children}</p>
  )
}
