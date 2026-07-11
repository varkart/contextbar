import { useState, useEffect, useCallback, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { SessionInsights } from '../types'
import { formatTokens } from '../components/history/SessionStats'
import { Tile, TileRow } from './InsightTiles'

const DAY = 86_400_000
const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
]
const BAR_COLORS = ['#6366f1', '#e8a94a', '#d98fd9', '#2dd4bf', '#fb7185', '#8fbf6b']
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function InsightsSection() {
  const [days, setDays] = useState(30)
  const [insights, setInsights] = useState<SessionInsights | null>(null)
  const [promptTs, setPromptTs] = useState<number[]>([])
  const [commitTs, setCommitTs] = useState<number[]>([])

  const fetchAll = useCallback((d: number) => {
    const sinceMs = Date.now() - d * DAY
    invoke<SessionInsights>('get_session_insights', { sinceMs }).then(setInsights).catch(() => {})
    invoke<number[]>('get_prompt_timestamps', { sinceMs }).then(setPromptTs).catch(() => {})
    invoke<number[]>('get_commit_activity', { sinceDays: 14 }).then(setCommitTs).catch(() => {})
  }, [])

  useEffect(() => {
    invoke('warm_session_stats').catch(() => {})
    fetchAll(days)
  }, [fetchAll, days])

  useEffect(() => {
    const unlisten = listen('session-insights-updated', () => fetchAll(days))
    return () => { unlisten.then(fn => fn()) }
  }, [fetchAll, days])

  // Heatmap: weekday × hour prompt density in local time.
  const heatmap = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
    let max = 0
    for (const ts of promptTs) {
      const d = new Date(ts)
      const day = (d.getDay() + 6) % 7 // Monday = 0
      const cell = ++grid[day][d.getHours()]
      if (cell > max) max = cell
    }
    return { grid, max }
  }, [promptTs])

  // Commits per local day, last 14 days.
  const commitDays = useMemo(() => {
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    const start = midnight.getTime() - 13 * DAY
    const buckets = Array(14).fill(0)
    for (const sec of commitTs) {
      const idx = Math.floor((sec * 1000 - start) / DAY)
      if (idx >= 0 && idx < 14) buckets[idx]++
    }
    return { buckets, max: Math.max(1, ...buckets), total: buckets.reduce((a, b) => a + b, 0) }
  }, [commitTs])

  const totalSessions = insights?.perModel.reduce((n, m) => n + m.sessions, 0) ?? 0
  const totalTokens = (insights?.inputTokens ?? 0) + (insights?.outputTokens ?? 0)
  const maxProject = Math.max(1, ...(insights?.perProject.map(p => p.tokens) ?? [1]))
  const maxTool = Math.max(1, ...(insights?.toolCounts.map(t => t.count) ?? [1]))
  const maxMcp = Math.max(1, ...(insights?.mcpToolCounts.map(t => t.count) ?? [1]))

  const analyzing = !insights || insights.sessionsAnalyzed === 0

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-3 flex-shrink-0 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold tracking-tight">Insights</h2>
          <p className="text-[12px] text-[var(--c-text-3)] mt-0.5">
            Tokens, cost, tools and activity across your sessions
          </p>
        </div>
        <div className="flex gap-1.5">
          {RANGES.map(r => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`text-[11px] px-3 py-1 rounded-full border transition-colors ${days === r.days ? 'border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {analyzing && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="w-4 h-4 border-2 border-[var(--c-accent)]/40 border-t-[var(--c-accent)] rounded-full animate-spin" />
            <p className="text-[12px] text-[var(--c-text-3)]">
              Analyzing session files — first run parses everything once, then it's cached
            </p>
          </div>
        )}

        {!analyzing && insights && (
          <>
            {/* Headline tiles */}
            <TileRow className="mb-4">
              <Tile value={insights.sessionsAnalyzed} label="Sessions analyzed" />
              <Tile value={formatTokens(totalTokens)} label="Tokens (in+out)" color="text-[var(--c-accent)]" />
              <Tile value={`$${insights.estCostUsd.toFixed(2)}`} label="Est. cost" color="text-amber-400" hint="Approximate — public API list prices; cache reads discounted" />
              <Tile value={`${Math.round(insights.cacheReadRatio * 100)}%`} label="Cache-read ratio" color="text-emerald-400" hint="Share of input served from prompt cache" />
              <Tile value={insights.avgToolCalls.toFixed(0)} label="Avg tool calls" />
              <Tile value={insights.heaviest ? formatTokens(insights.heaviest.tokens) : '—'} label="Heaviest session" hint={insights.heaviest?.display} />
            </TileRow>

            <div className="grid grid-cols-2 gap-3 mb-3">
              {/* Heatmap */}
              <Card title="Activity heatmap" sub="Prompts by weekday × hour (local time)">
                <div className="grid gap-[3px]" style={{ gridTemplateColumns: '30px repeat(24, 1fr)' }}>
                  {DAY_LABELS.map((label, di) => (
                    <div key={label} className="contents">
                      <span className="text-[9px] font-mono text-[var(--c-text-3)] self-center">{label}</span>
                      {heatmap.grid[di].map((v, h) => {
                        const alpha = v === 0 ? 0 : 0.2 + 0.8 * (v / heatmap.max)
                        return (
                          <span
                            key={h}
                            title={`${label} ${h}:00 — ${v} prompt${v === 1 ? '' : 's'}`}
                            className="aspect-square rounded-[2px]"
                            style={{ background: v === 0 ? 'var(--c-surface-2)' : `rgba(129,140,248,${alpha.toFixed(2)})` }}
                          />
                        )
                      })}
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[9px] font-mono text-[var(--c-text-3)] mt-1.5 pl-[33px]">
                  <span>0</span><span>6</span><span>12</span><span>18</span><span>23</span>
                </div>
              </Card>

              {/* Model mix */}
              <Card title="Model mix" sub={`${totalSessions} sessions by model`}>
                <div className="flex h-3.5 rounded-md overflow-hidden mb-2">
                  {insights.perModel.map((m, i) => (
                    <div
                      key={m.model}
                      title={`${m.model}: ${m.sessions} sessions`}
                      style={{ width: `${Math.max(2, (m.sessions / Math.max(1, totalSessions)) * 100)}%`, background: BAR_COLORS[i % BAR_COLORS.length] }}
                    />
                  ))}
                </div>
                <div className="flex gap-3 flex-wrap mb-4">
                  {insights.perModel.map((m, i) => (
                    <span key={m.model} className="text-[11px] text-[var(--c-text-3)] flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm" style={{ background: BAR_COLORS[i % BAR_COLORS.length] }} />
                      {shortModel(m.model)} {Math.round((m.sessions / Math.max(1, totalSessions)) * 100)}%
                    </span>
                  ))}
                </div>
                <p className="text-[10px] font-mono text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">Cost by model</p>
                <div>
                  {insights.perModel.map(m => (
                    <div key={m.model} className="flex justify-between text-[11px] py-1 border-b border-[var(--c-border)]/50 last:border-0">
                      <span className="text-[var(--c-text-2)]">{shortModel(m.model)}</span>
                      <span className="font-mono text-[var(--c-text-3)]">
                        {formatTokens(m.inputTokens)} in · {formatTokens(m.outputTokens)} out · {m.estCostUsd != null ? `$${m.estCostUsd.toFixed(2)}` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              {/* Tokens by project */}
              <Card title="Tokens by project" sub="Input + output, cache excluded">
                {insights.perProject.map((p, i) => (
                  <HBar
                    key={p.project}
                    name={p.projectName}
                    value={formatTokens(p.tokens)}
                    pct={(p.tokens / maxProject) * 100}
                    color={BAR_COLORS[i % BAR_COLORS.length]}
                    hint={p.project}
                  />
                ))}
              </Card>

              {/* Commits */}
              <Card title="Commits per day" sub={`All branches, all repos — last 14 days · total ${commitDays.total}`}>
                <div className="flex items-end gap-1 h-24 mt-2">
                  {commitDays.buckets.map((v, i) => (
                    <div
                      key={i}
                      title={`${v} commit${v === 1 ? '' : 's'}`}
                      className="flex-1 rounded-t-sm bg-[var(--c-accent)]/20 border-t-2 border-[var(--c-accent)]"
                      style={{ height: `${Math.max(4, (v / commitDays.max) * 100)}%`, opacity: v === 0 ? 0.25 : 1 }}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-[9px] font-mono text-[var(--c-text-3)] mt-1">
                  <span>13d ago</span><span>today</span>
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Top tools */}
              <Card title="Top tools" sub="What Claude does in your sessions">
                {insights.toolCounts.length === 0 && <Empty />}
                {insights.toolCounts.map(t => (
                  <HBar key={t.name} name={t.name} value={String(t.count)} pct={(t.count / maxTool) * 100} color="var(--c-accent)" />
                ))}
              </Card>

              {/* MCP tools */}
              <Card title="MCP servers called" sub="Grouped by server — unused configured servers are cleanup candidates">
                {insights.mcpToolCounts.length === 0 && <Empty label="No MCP tool calls in this range" />}
                {insights.mcpToolCounts.map(t => (
                  <HBar key={t.name} name={t.name} value={String(t.count)} pct={(t.count / maxMcp) * 100} color="#2dd4bf" />
                ))}
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function shortModel(model: string): string {
  return model.replace(/^claude-/, '').replace(/-\d{8}$/, '')
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 p-4">
      <h3 className="text-[13px] font-semibold mb-0.5">{title}</h3>
      {sub && <p className="text-[11px] text-[var(--c-text-3)] mb-3">{sub}</p>}
      {children}
    </div>
  )
}

function HBar({ name, value, pct, color, hint }: { name: string; value: string; pct: number; color: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-1.5 text-[11px]" title={hint}>
      <span className="w-24 shrink-0 text-right font-mono text-[var(--c-text-3)] truncate">{name}</span>
      <div className="flex-1 h-3.5 rounded bg-[var(--c-surface-2)] overflow-hidden">
        <div className="h-full rounded" style={{ width: `${Math.max(1, pct)}%`, background: color }} />
      </div>
      <span className="w-14 shrink-0 font-mono text-[var(--c-text-3)]">{value}</span>
    </div>
  )
}

function Empty({ label = 'No data in this range' }: { label?: string }) {
  return <p className="text-[11px] text-[var(--c-text-3)] py-4 text-center">{label}</p>
}
