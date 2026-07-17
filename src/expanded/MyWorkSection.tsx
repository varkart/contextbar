import { useState, useEffect, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { RepoWorktrees, SessionEntry, TokenPoint } from '../types'
import type { Section } from './ExpandedApp'
import { Card, CommitBars, TokenTrend, RefreshButton, SkeletonTiles, SkeletonCards } from './InsightWidgets'
import AgentBadge from '../components/history/AgentBadge'

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

function windowFor(tab: Tab): [number, number] {
  const now = Date.now()
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  const m = midnight.getTime()
  if (tab === 'today') return [m, now]
  if (tab === 'yesterday') return [m - DAY, m]
  if (tab === 'week') {
    const day = (midnight.getDay() + 6) % 7 // Monday = 0
    return [m - day * DAY, now]
  }
  return [now - 7 * DAY, now]
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
  showToast: (type: 'success' | 'error', message: string) => void
}

function todayKey(): string {
  return `contextbar:expanded:peakbanner:${new Date().toISOString().slice(0, 10)}`
}

export default function MyWorkSection({ sessions, repos, loading, goTo, onRefresh, onOpenSession, showToast }: MyWorkSectionProps) {
  const [tab, setTab] = useState<Tab>('today')
  const [copiedResume, setCopiedResume] = useState<string | null>(null)
  const [commitTs, setCommitTs] = useState<number[]>([])
  const [tokenPoints, setTokenPoints] = useState<TokenPoint[]>([])
  const [vscodeAvailable, setVscodeAvailable] = useState(false)
  const [peakDismissed, setPeakDismissed] = useState(() => !!localStorage.getItem(todayKey()))

  useEffect(() => {
    invoke<number[]>('get_commit_activity', { sinceDays: 14 }).then(setCommitTs).catch(() => {})
    invoke<TokenPoint[]>('get_token_activity', { sinceMs: Date.now() - 183 * DAY }).then(setTokenPoints).catch(() => {})
    invoke<boolean>('is_vscode_installed').then(setVscodeAvailable).catch(() => {})
  }, [])

  const tabLabel = TABS.find(t => t.id === tab)?.label ?? ''

  const [start, end] = useMemo(() => windowFor(tab), [tab])
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
  const momentum = useMemo(() => {
    const since = Date.now() - 7 * DAY
    const recent = sessions.filter(s => s.timestamp >= since)
    return groupByProject(recent).slice(0, 5).map(p => {
      const daysActive = new Set(p.sessions.map(s => Math.floor((Date.now() - s.timestamp) / DAY)))
      const cells = Array.from({ length: 7 }, (_, i) => daysActive.has(6 - i))
      let streak = 0
      for (let d = 0; d < 7 && daysActive.has(d); d++) streak++
      const errors = p.sessions.reduce((n, s) => n + s.errorCount, 0)
      const tag = errors === 0 ? 'Smooth' : errors <= 3 ? 'Mixed' : 'Friction'
      return { ...p, cells, streak, tag }
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
          })
        } else if (!wt.isMerged && wt.ahead > 0) {
          items.push({
            key: `${wt.path}:ahead`,
            kind: 'unmerged',
            title: `${wt.branch ?? wt.path}`,
            why: `${wt.ahead} finished commit${wt.ahead > 1 ? 's' : ''} not yet merged into ${repo.baseBranch} — merge or open a PR`,
            meta: repo.repoName,
          })
        }
      }
    }
    // Uncommitted work first — that's the data-loss risk.
    items.sort((a, b) => (a.kind === 'uncommitted' ? 0 : 1) - (b.kind === 'uncommitted' ? 0 : 1))
    return items.slice(0, 5)
  }, [repos])

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
            {/* Stats */}
            <SectionLabel>Overview — {tabLabel}</SectionLabel>
            <div className="grid grid-cols-4 gap-2.5 mb-5">
              <Stat n={String(stats.sessions)} lbl="Sessions" />
              <Stat n={String(stats.prompts)} lbl="Prompts" color="text-amber-400" />
              <Stat n={String(stats.live)} lbl="Live" color={stats.live > 0 ? 'text-emerald-400' : ''} />
              <Stat n={String(stats.projects)} lbl="Projects" color="text-[var(--c-accent)]" />
            </div>

            {/* Agent mix — which agents you used in the window */}
            {agentMix.length > 0 && (
              <div className="mb-5">
                <SectionLabel>Agents — {tabLabel}</SectionLabel>
                <div className="flex h-2.5 rounded-full overflow-hidden mb-2">
                  {agentMix.map(([agent, count]) => (
                    <div
                      key={agent}
                      title={`${agent}: ${count} session${count === 1 ? '' : 's'}`}
                      style={{
                        width: `${Math.max(2, (count / Math.max(1, stats.sessions)) * 100)}%`,
                        background: AGENT_COLORS[agent] ?? '#71717a',
                      }}
                    />
                  ))}
                </div>
                <div className="flex gap-4 flex-wrap">
                  {agentMix.map(([agent, count]) => (
                    <span key={agent} className="text-[11px] text-[var(--c-text-3)] flex items-center gap-1.5 capitalize">
                      <span className="w-2 h-2 rounded-sm inline-block" style={{ background: AGENT_COLORS[agent] ?? '#71717a' }} />
                      {agent} · {count} session{count === 1 ? '' : 's'}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Focus bar — share of prompts per project in the window */}
            {projects.length > 0 && stats.prompts > 0 && (
              <div className="mb-5">
                <SectionLabel>Focus — {tabLabel}</SectionLabel>
                <div className="flex h-2.5 rounded-full overflow-hidden mb-2">
                  {projects.slice(0, PALETTE.length).map((p, i) => (
                    <div
                      key={p.project}
                      style={{ width: `${Math.max(2, (p.prompts / stats.prompts) * 100)}%`, background: PALETTE[i] }}
                    />
                  ))}
                </div>
                <div className="flex gap-4 flex-wrap">
                  {projects.slice(0, PALETTE.length).map((p, i) => (
                    <span key={p.project} className="text-[11px] text-[var(--c-text-3)] flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm inline-block" style={{ background: PALETTE[i] }} />
                      {p.name} {Math.round((p.prompts / stats.prompts) * 100)}%
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Activity: when you work + what lands */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <Card title="Commits per day" sub="All branches, all repos — last 14 days">
                <CommitBars commitSecs={commitTs} />
              </Card>
              <Card title="Token trend" sub="Usage over time, local time">
                <TokenTrend points={tokenPoints} />
              </Card>
            </div>

            {/* Momentum */}
            {momentum.length > 0 && (
              <div className="mb-5">
                <SectionLabel>Momentum — last 7 days</SectionLabel>
                <div className="space-y-1.5">
                  {momentum.map(m => (
                    <div key={m.project} className="flex items-center gap-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 px-3.5 py-2.5">
                      <span className="text-[12.5px] font-mono font-semibold w-32 truncate" title={m.project}>{m.name}</span>
                      <span className="text-[11px] text-[var(--c-text-3)] w-24 shrink-0">
                        {m.streak > 1 ? `${m.streak} day streak` : `${m.cells.filter(Boolean).length}/7 days`}
                      </span>
                      <div className="flex-1 flex gap-1">
                        {m.cells.map((filled, i) => (
                          <span key={i} className={`flex-1 h-1.5 rounded-sm ${filled ? 'bg-emerald-400' : 'bg-[var(--c-border)]'}`} />
                        ))}
                      </div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0 ${m.tag === 'Smooth' ? 'bg-emerald-500/15 text-emerald-400' : m.tag === 'Mixed' ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400'}`}>
                        {m.tag}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Needs attention — omitted entirely when empty */}
            {attention.length > 0 && (
              <div className="mb-5">
                <SectionLabel>Needs attention</SectionLabel>
                <div className="space-y-1.5">
                  {attention.map(a => (
                    <div
                      key={a.key}
                      className={`flex items-start gap-2.5 rounded-xl border border-[var(--c-border)] border-l-2 bg-[var(--c-surface-2)]/40 px-3.5 py-2.5 ${a.kind === 'uncommitted' ? 'border-l-rose-400' : 'border-l-amber-400'}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12.5px] font-mono font-semibold truncate">{a.title}</span>
                          <span className={`text-[9px] font-mono px-1.5 py-px rounded-full ${a.kind === 'uncommitted' ? 'bg-rose-500/15 text-rose-400' : 'bg-amber-500/15 text-amber-400'}`}>
                            {a.kind === 'uncommitted' ? 'uncommitted changes' : 'not merged'}
                          </span>
                        </div>
                        <p className="text-[11.5px] text-[var(--c-text-2)] mt-0.5">{a.why}</p>
                        <p className="text-[10.5px] text-[var(--c-text-3)] mt-0.5">{a.meta}</p>
                      </div>
                      <button
                        onClick={() => goTo('worktrees')}
                        className="text-[11px] text-[var(--c-accent)] font-medium hover:underline shrink-0 mt-0.5"
                      >
                        Open in Repos →
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active projects */}
            {projects.length > 0 && (
              <div className="mb-5">
                <SectionLabel>Active projects — {tabLabel}</SectionLabel>
                <div className="space-y-2">
                  {projects.slice(0, 8).map((p, i) => {
                    const branch = branchFor(p.project)
                    const live = p.sessions.some(s => s.isLive)
                    return (
                      <div key={p.project} className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 p-3.5">
                        <button
                          onClick={() => onOpenSession(p.sessions[0])}
                          title="Open latest transcript in Sessions"
                          className="w-full flex items-center gap-2.5 mb-2 text-left group/card"
                        >
                          <span
                            className="w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-[12px] text-black/80 shrink-0"
                            style={{ background: PALETTE[i % PALETTE.length] }}
                          >
                            {p.name.charAt(0).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold truncate group-hover/card:text-[var(--c-accent)] transition-colors">{p.name}</div>
                            {branch && <div className="text-[11px] font-mono text-[var(--c-text-3)] truncate">⌥ {branch}</div>}
                          </div>
                          <div className="ml-auto flex items-center gap-1.5 shrink-0">
                            {[...new Set(p.sessions.map(s => s.agent))].map(a => (
                              <AgentBadge key={a} agent={a} />
                            ))}
                            {live && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">live</span>
                            )}
                            <span className="text-[10px] text-[var(--c-text-3)] opacity-0 group-hover/card:opacity-100 transition-opacity">transcript →</span>
                          </div>
                        </button>
                        <p className="text-[11px] text-[var(--c-text-3)] mb-2">
                          {relativeTime(p.lastTs)} · {p.sessions.length} session{p.sessions.length > 1 ? 's' : ''} · {p.prompts} prompt{p.prompts === 1 ? '' : 's'}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleResume(p)}
                            className={`text-[11px] px-3 py-1.5 rounded-md font-medium transition-colors ${copiedResume === p.project ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[var(--c-accent)]/15 text-[var(--c-accent)] hover:bg-[var(--c-accent)]/25'}`}
                          >
                            {copiedResume === p.project ? '✓ Opened' : '▶ Resume'}
                          </button>
                          {vscodeAvailable && (
                            <button
                              onClick={() => invoke('open_in_vscode', { path: p.project }).catch(() => showToast('error', 'Could not open VS Code'))}
                              title="Open project in Visual Studio Code"
                              className="text-[11px] px-3 py-1.5 rounded-md border border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
                            >
                              VS Code
                            </button>
                          )}
                          <button
                            onClick={() => invoke('reveal_in_finder', { path: p.project }).catch(() => showToast('error', 'Could not reveal in Finder'))}
                            className="text-[11px] px-3 py-1.5 rounded-md border border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
                          >
                            Reveal in Finder
                          </button>
                        </div>
                      </div>
                    )
                  })}
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
    <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 px-3 py-3 text-center">
      <div className={`text-[17px] font-semibold tabular-nums ${color ?? ''}`}>{n}</div>
      <div className="text-[10px] text-[var(--c-text-3)] uppercase tracking-wider mt-0.5">{lbl}</div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-mono text-[var(--c-text-3)] uppercase tracking-wider mb-2">{children}</p>
  )
}
