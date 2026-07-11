import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { SessionInsights } from '../types'
import { formatTokens } from '../components/history/SessionStats'
import { Tile, TileRow } from './InsightTiles'
import { Card, HBar } from './InsightWidgets'

const DAY = 86_400_000
const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
]
const BAR_COLORS = ['#6366f1', '#e8a94a', '#d98fd9', '#2dd4bf', '#fb7185', '#8fbf6b']

export function shortModel(model: string): string {
  return model.replace(/^claude-/, '').replace(/-\d{8}$/, '')
}

export default function InsightsSection() {
  const [days, setDays] = useState(30)
  const [insights, setInsights] = useState<SessionInsights | null>(null)

  const fetchAll = useCallback((d: number) => {
    const sinceMs = Date.now() - d * DAY
    invoke<SessionInsights>('get_session_insights', { sinceMs }).then(setInsights).catch(() => {})
  }, [])

  useEffect(() => {
    invoke('warm_session_stats').catch(() => {})
    fetchAll(days)
  }, [fetchAll, days])

  useEffect(() => {
    const unlisten = listen('session-insights-updated', () => fetchAll(days))
    return () => { unlisten.then(fn => fn()) }
  }, [fetchAll, days])

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
            Tokens, cost and tool usage — activity lives in My Work
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
            <TileRow className="mb-4">
              <Tile value={insights.sessionsAnalyzed} label="Sessions analyzed" />
              <Tile value={formatTokens(totalTokens)} label="Tokens (in+out)" color="text-[var(--c-accent)]" />
              <Tile value={`$${insights.estCostUsd.toFixed(2)}`} label="Est. cost" color="text-amber-400" hint="Approximate — public API list prices; cache reads discounted" />
              <Tile value={`${Math.round(insights.cacheReadRatio * 100)}%`} label="Cache-read ratio" color="text-emerald-400" hint="Share of input served from prompt cache" />
              <Tile value={insights.avgToolCalls.toFixed(0)} label="Avg tool calls" />
              <Tile value={insights.heaviest ? formatTokens(insights.heaviest.tokens) : '—'} label="Heaviest session" hint={insights.heaviest?.display} />
            </TileRow>

            <div className="grid grid-cols-2 gap-3 mb-3">
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

              <Card title="Cost by model" sub={`${totalSessions} sessions analyzed`}>
                {insights.perModel.map(m => (
                  <div key={m.model} className="flex justify-between text-[11px] py-1.5 border-b border-[var(--c-border)]/50 last:border-0">
                    <span className="text-[var(--c-text-2)]">{shortModel(m.model)} <span className="text-[var(--c-text-3)]">· {m.sessions} sessions</span></span>
                    <span className="font-mono text-[var(--c-text-3)]">
                      {formatTokens(m.inputTokens)} in · {formatTokens(m.outputTokens)} out · {m.estCostUsd != null ? `$${m.estCostUsd.toFixed(2)}` : '—'}
                    </span>
                  </div>
                ))}
              </Card>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Card title="Top tools" sub="What Claude does in your sessions">
                {insights.toolCounts.length === 0 && <Empty />}
                {insights.toolCounts.map(t => (
                  <HBar key={t.name} name={t.name} value={String(t.count)} pct={(t.count / maxTool) * 100} color="var(--c-accent)" />
                ))}
              </Card>

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

function Empty({ label = 'No data in this range' }: { label?: string }) {
  return <p className="text-[11px] text-[var(--c-text-3)] py-4 text-center">{label}</p>
}
