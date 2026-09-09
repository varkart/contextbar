import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { SessionInsights } from '../types'
import { formatTokens } from '../components/history/SessionStats'
import { HBar } from './InsightWidgets'

type Pivot = 'repos' | 'sessions' | 'tools' | 'skills' | 'mcp'
const PIVOTS: [Pivot, string][] = [
  ['repos', 'Repos'], ['sessions', 'Sessions'], ['tools', 'Tools'], ['skills', 'Skills'], ['mcp', 'MCP'],
]

const MONTH_COUNT = 3

interface Range { key: string; label: string; since: number; until: number }

function monthRanges(): Range[] {
  const now = new Date()
  const out: Range[] = []
  for (let i = 0; i < MONTH_COUNT; i++) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    out.push({
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      label: start.toLocaleString(undefined, { month: 'short', year: 'numeric' }),
      since: start.getTime(),
      until: end.getTime(),
    })
  }
  return out
}

const money = (n?: number | null) => (n == null ? '—' : `$${n.toFixed(2)}`)

/** Drill-down under the "Tokens" tile: pick a calendar month, pivot by
 *  repo / session / tool / skill / MCP, click a repo to see its sessions. */
export default function TokenBreakdownPanel({ onOpenSession }: { onOpenSession?: (id: string) => void }) {
  const ranges = useMemo(monthRanges, [])
  const allRange: Range = useMemo(
    () => ({ key: 'all', label: `Last ${MONTH_COUNT} months`, since: ranges[ranges.length - 1].since, until: Date.now() }),
    [ranges],
  )
  const [month, setMonth] = useState(ranges[0].key)
  const [pivot, setPivot] = useState<Pivot>('repos')
  const [repo, setRepo] = useState<{ project: string; name: string } | null>(null)
  const [byMonth, setByMonth] = useState<Record<string, SessionInsights>>({})

  const range = month === 'all' ? allRange : (ranges.find(r => r.key === month) ?? ranges[0])

  useEffect(() => {
    if (byMonth[month]) return
    let live = true
    invoke<SessionInsights>('get_session_insights', { sinceMs: range.since, untilMs: range.until })
      .then(d => { if (live) setByMonth(m => ({ ...m, [month]: d })) })
      .catch(() => {})
    return () => { live = false }
  }, [month, range.since, range.until, byMonth])

  const data = byMonth[month]

  const reset = () => { setRepo(null); setPivot('repos') }
  const pickMonth = (k: string) => { setMonth(k); reset() }

  type Row = { key: string; name: string; sub: string; value: string; weight: number; onClick?: () => void }
  const rows = useMemo<Row[]>(() => {
    if (!data) return []
    if (repo || pivot === 'sessions') {
      const src = repo ? data.perSession.filter(s => s.project === repo.project) : data.perSession
      return src.map(s => ({
        key: s.sessionId, name: s.display, sub: repo ? s.agent : `${s.agent} · ${s.projectName || '—'}`,
        value: `${formatTokens(s.tokens)} · ${money(s.estCostUsd)}`, weight: s.tokens,
        onClick: onOpenSession ? () => onOpenSession(s.sessionId) : undefined,
      }))
    }
    if (pivot === 'repos') {
      return data.perProject.map(p => ({
        key: p.project, name: p.projectName || p.project,
        sub: `${p.sessions} session${p.sessions === 1 ? '' : 's'}`,
        value: `${formatTokens(p.tokens)} · ${money(p.estCostUsd)}`, weight: p.tokens,
        onClick: () => { setRepo({ project: p.project, name: p.projectName || p.project }); setPivot('sessions') },
      }))
    }
    const counts = pivot === 'tools' ? data.toolCounts : pivot === 'skills' ? data.skillCounts : data.mcpToolCounts
    return counts.map(c => ({ key: c.name, name: c.name, sub: '', value: `${c.count.toLocaleString()} calls`, weight: c.count }))
  }, [data, pivot, repo, onOpenSession])

  const max = Math.max(1, ...rows.map(r => r.weight))
  const totalTokens = data ? data.inputTokens + data.outputTokens : 0
  const countsPivot = !repo && (pivot === 'tools' || pivot === 'skills' || pivot === 'mcp')

  return (
    <div className="mt-2.5 rounded-xl border border-[var(--c-accent)]/25 bg-[var(--c-accent)]/[0.03] overflow-hidden">
      {/* breadcrumb */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--c-border-sub)] text-[11.5px] flex-wrap">
        <button className="text-[var(--c-accent)] hover:underline" onClick={reset}>Tokens</button>
        <span className="opacity-40">›</span>
        {repo ? (
          <>
            <button className="text-[var(--c-accent)] hover:underline" onClick={() => { setRepo(null); setPivot('repos') }}>{range.label}</button>
            <span className="opacity-40">›</span>
            <span className="text-[var(--c-text-2)]">{repo.name}</span>
          </>
        ) : (
          <span className="text-[var(--c-text-2)]">{range.label}</span>
        )}
      </div>

      {/* month chips */}
      <div className="flex items-center gap-1.5 px-3 py-2 flex-wrap">
        <span className="text-[9.5px] uppercase tracking-wider text-[var(--c-text-3)] w-10">Month</span>
        {ranges.map(r => (
          <Chip key={r.key} on={month === r.key} onClick={() => pickMonth(r.key)}>{r.label}</Chip>
        ))}
        <Chip on={month === 'all'} onClick={() => pickMonth('all')}>{allRange.label}</Chip>
      </div>

      {/* pivot chips */}
      {!repo && (
        <div className="flex items-center gap-1.5 px-3 pb-2 flex-wrap">
          <span className="text-[9.5px] uppercase tracking-wider text-[var(--c-text-3)] w-10">Pivot</span>
          {PIVOTS.map(([k, lbl]) => (
            <Chip key={k} on={pivot === k} onClick={() => setPivot(k)}>{lbl}</Chip>
          ))}
        </div>
      )}

      {/* list */}
      <div className="px-3 pb-2">
        {!data ? (
          <p className="text-[12px] text-[var(--c-text-3)] py-3 text-center">Loading {range.label}…</p>
        ) : rows.length === 0 ? (
          <p className="text-[12px] text-[var(--c-text-3)] py-3 text-center">No sessions in {range.label}</p>
        ) : (
          rows.map(r => (
            <HBar
              key={r.key}
              name={r.sub ? `${r.name}  ·  ${r.sub}` : r.name}
              value={r.value}
              pct={(r.weight / max) * 100}
              color="var(--c-accent)"
              onClick={r.onClick}
            />
          ))
        )}
      </div>

      {/* footer */}
      <div className="flex justify-between px-3 py-2 border-t border-[var(--c-border-sub)] text-[11px] text-[var(--c-text-3)]">
        <span>{range.label} · {data?.sessionsAnalyzed ?? 0} sessions</span>
        <span className="font-mono">{formatTokens(totalTokens)} · {money(data?.estCostUsd)}</span>
      </div>
      <p className="px-3 pb-2.5 text-[10px] text-[var(--c-text-3)]">
        {countsPivot
          ? 'Tools / skills / MCP show call counts. Token-weighted attribution lands in a later pass.'
          : 'Tokens + approximate cost (public API list prices; cache reads discounted). Click a repo to see its sessions.'}
      </p>
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-[10.5px] px-2 py-0.5 rounded-full border transition-colors ${
        on
          ? 'border-[var(--c-accent)]/50 bg-[var(--c-accent)]/12 text-[#a5b4fc]'
          : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'
      }`}
    >
      {children}
    </button>
  )
}
