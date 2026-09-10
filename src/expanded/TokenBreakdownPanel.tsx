import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { SessionInsights, SessionDrivers, SessionCost } from '../types'
import { formatTokens } from '../components/history/SessionStats'

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

const DRIVER_LABEL: Record<string, string> = {
  tool: 'tool', mcp: 'mcp', skill: 'skill', conversation: 'conv',
  output: 'output', initial: 'init', compaction: 'compact', prompt: 'prompt',
}

/** Drill-down under the "Tokens" tile: pick a calendar month, pivot by
 *  repo / session / tool / skill / MCP, drill a repo into its sessions and a
 *  session into what drove its tokens. */
export default function TokenBreakdownPanel({ onOpenSession }: { onOpenSession?: (id: string) => void }) {
  const ranges = useMemo(monthRanges, [])
  const allRange: Range = useMemo(
    () => ({ key: 'all', label: `Last ${MONTH_COUNT} months`, since: ranges[ranges.length - 1].since, until: Date.now() }),
    [ranges],
  )
  const [month, setMonth] = useState(ranges[0].key)
  const [pivot, setPivot] = useState<Pivot>('repos')
  const [repo, setRepo] = useState<{ project: string; name: string } | null>(null)
  const [session, setSession] = useState<SessionCost | null>(null)
  const [byMonth, setByMonth] = useState<Record<string, SessionInsights>>({})
  const [drivers, setDrivers] = useState<SessionDrivers | null>(null)
  const [driversLoading, setDriversLoading] = useState(false)

  const range = month === 'all' ? allRange : (ranges.find(r => r.key === month) ?? ranges[0])

  useEffect(() => {
    if (byMonth[month]) return
    let live = true
    invoke<SessionInsights>('get_session_insights', { sinceMs: range.since, untilMs: range.until })
      .then(d => { if (live) setByMonth(m => ({ ...m, [month]: d })) })
      .catch(() => {})
    return () => { live = false }
  }, [month, range.since, range.until, byMonth])

  useEffect(() => {
    if (!session) { setDrivers(null); return }
    let live = true
    setDriversLoading(true)
    invoke<SessionDrivers>('get_session_drivers', { sessionId: session.sessionId, agent: session.agent })
      .then(d => { if (live) setDrivers(d) })
      .catch(() => { if (live) setDrivers(null) })
      .finally(() => { if (live) setDriversLoading(false) })
    return () => { live = false }
  }, [session])

  const data = byMonth[month]

  const toRoot = () => { setRepo(null); setSession(null); setPivot('repos') }
  const toMonth = () => { setSession(null); setRepo(null); setPivot('repos') }
  const toRepo = () => setSession(null)
  const pickMonth = (k: string) => { setMonth(k); toRoot() }

  type Row = {
    key: string; name: string; sub: string; weight: number
    tokens?: number; cost?: number | null; input?: number; output?: number; prompts?: number
    calls?: number; onClick?: () => void; session?: SessionCost
  }

  const rows = useMemo<Row[]>(() => {
    if (!data) return []
    if (repo || pivot === 'sessions') {
      const src = repo ? data.perSession.filter(s => s.project === repo.project) : data.perSession
      return src.map(s => ({
        key: s.sessionId, name: s.display, sub: repo ? s.agent : `${s.agent} · ${s.projectName || '—'}`,
        weight: s.tokens, tokens: s.tokens, cost: s.estCostUsd, input: s.inputTokens, output: s.outputTokens,
        prompts: s.prompts, session: s, onClick: () => setSession(s),
      }))
    }
    if (pivot === 'repos') {
      return data.perProject.map(p => ({
        key: p.project, name: p.projectName || p.project,
        sub: `${p.sessions} session${p.sessions === 1 ? '' : 's'}`,
        weight: p.tokens, tokens: p.tokens, cost: p.estCostUsd, input: p.inputTokens, output: p.outputTokens,
        prompts: p.prompts,
        onClick: () => { setRepo({ project: p.project, name: p.projectName || p.project }); setPivot('sessions') },
      }))
    }
    const counts = pivot === 'tools' ? data.toolCounts : pivot === 'skills' ? data.skillCounts : data.mcpToolCounts
    return counts.map(c => ({ key: c.name, name: c.name, sub: '', weight: c.count, calls: c.count }))
  }, [data, pivot, repo])

  const showRight = !session && (!!repo || pivot === 'repos' || pivot === 'sessions')
  const max = Math.max(1, ...rows.map(r => r.weight))
  const totalTokens = data ? data.inputTokens + data.outputTokens : 0
  const countsPivot = !repo && !session && (pivot === 'tools' || pivot === 'skills' || pivot === 'mcp')

  return (
    <div className="mt-2.5 rounded-xl border border-[var(--c-accent)]/25 bg-[var(--c-accent)]/[0.03] overflow-hidden">
      {/* breadcrumb */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--c-border-sub)] text-[11.5px] flex-wrap">
        <Crumb onClick={toRoot}>Tokens</Crumb>
        <span className="opacity-40">›</span>
        {repo || session ? <Crumb onClick={toMonth}>{range.label}</Crumb> : <Cur>{range.label}</Cur>}
        {repo && <><span className="opacity-40">›</span>{session ? <Crumb onClick={toRepo}>{repo.name}</Crumb> : <Cur>{repo.name}</Cur>}</>}
        {session && <><span className="opacity-40">›</span><Cur>{session.display}</Cur></>}
      </div>

      {!session && (
        <>
          <div className="flex items-center gap-1.5 px-3 py-2 flex-wrap">
            <span className="text-[9.5px] uppercase tracking-wider text-[var(--c-text-3)] w-10">Month</span>
            {ranges.map(r => <Chip key={r.key} on={month === r.key} onClick={() => pickMonth(r.key)}>{r.label}</Chip>)}
            <Chip on={month === 'all'} onClick={() => pickMonth('all')}>{allRange.label}</Chip>
          </div>
          {!repo && (
            <div className="flex items-center gap-1.5 px-3 pb-2 flex-wrap">
              <span className="text-[9.5px] uppercase tracking-wider text-[var(--c-text-3)] w-10">Pivot</span>
              {PIVOTS.map(([k, lbl]) => <Chip key={k} on={pivot === k} onClick={() => setPivot(k)}>{lbl}</Chip>)}
            </div>
          )}
        </>
      )}

      {/* body */}
      <div className="px-3 pb-2">
        {session ? (
          driversLoading || !drivers ? (
            <p className="text-[12px] text-[var(--c-text-3)] py-3 text-center">Analysing session…</p>
          ) : (
            <DriverList d={drivers} onOpen={onOpenSession ? () => onOpenSession(session.sessionId) : undefined} />
          )
        ) : !data ? (
          <p className="text-[12px] text-[var(--c-text-3)] py-3 text-center">Loading {range.label}…</p>
        ) : rows.length === 0 ? (
          <p className="text-[12px] text-[var(--c-text-3)] py-3 text-center">No sessions in {range.label}</p>
        ) : (
          <>
            <div className="flex items-center gap-2.5 pb-1 mb-0.5 border-b border-[var(--c-border-sub)] text-[9px] uppercase tracking-wider text-[var(--c-text-3)]">
              <span className="flex-1 min-w-0">{countsPivot ? 'Name' : 'Name · usage'}</span>
              {countsPivot ? (
                <span className="w-20 text-right">Calls</span>
              ) : (
                <>
                  <span className="w-16 text-right">Tokens</span>
                  <span className="w-14 text-right">Cost</span>
                  <span className="w-14 text-right">↓ In</span>
                  <span className="w-14 text-right">↑ Out</span>
                  <span className="w-12 text-right">Prompts</span>
                </>
              )}
            </div>
            {rows.map(r => (
              <Bar key={r.key} row={r} pct={(r.weight / max) * 100} showRight={showRight} />
            ))}
          </>
        )}
      </div>

      {/* footer */}
      {!session && (
        <>
          <div className="flex justify-between px-3 py-2 border-t border-[var(--c-border-sub)] text-[11px] text-[var(--c-text-3)]">
            <span>{range.label} · {data?.sessionsAnalyzed ?? 0} sessions · {data?.perProject.reduce((n, p) => n + p.prompts, 0) ?? 0} prompts</span>
            <span className="font-mono">{formatTokens(totalTokens)} · {money(data?.estCostUsd)}</span>
          </div>
          <p className="px-3 pb-2.5 text-[10px] text-[var(--c-text-3)]">
            {countsPivot
              ? 'Tools / skills / MCP show call counts. Token-weighted attribution lands in a later pass.'
              : 'Approximate cost — public API list prices, cache reads discounted. Click a row to drill.'}
          </p>
        </>
      )}
    </div>
  )
}

function Bar({ row, pct, showRight }: { row: { name: string; sub: string; tokens?: number; cost?: number | null; input?: number; output?: number; prompts?: number; calls?: number; onClick?: () => void }; pct: number; showRight: boolean }) {
  const Tag = row.onClick ? 'button' : 'div'
  const num = 'shrink-0 text-right text-[11px] tabular-nums'
  return (
    <Tag
      onClick={row.onClick}
      className={`w-full flex items-center gap-2.5 py-1 text-left ${row.onClick ? 'hover:opacity-80' : ''}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-[12px] truncate ${row.onClick ? 'text-[var(--c-accent)]' : 'text-[var(--c-text-2)]'}`}>{row.name}</span>
          {row.sub && <span className="text-[10px] text-[var(--c-text-3)] truncate">· {row.sub}</span>}
        </div>
        <div className="mt-0.5 h-[5px] rounded-full bg-[var(--c-surface-2)] overflow-hidden">
          <div className="h-full rounded-full bg-[var(--c-accent)]" style={{ width: `${Math.max(3, pct)}%` }} />
        </div>
      </div>
      {showRight ? (
        <>
          <span className={`${num} w-16 text-[var(--c-text-2)]`}>{formatTokens(row.tokens ?? 0)}</span>
          <span className={`${num} w-14 text-[var(--c-text-3)]`}>{money(row.cost)}</span>
          <span className={`${num} w-14 text-[var(--c-text-3)]`}>{formatTokens(row.input ?? 0)}</span>
          <span className={`${num} w-14 text-[var(--c-text-3)]`}>{formatTokens(row.output ?? 0)}</span>
          <span className={`${num} w-12 text-[var(--c-text-2)]`}>{row.prompts ?? 0}</span>
        </>
      ) : (
        <span className={`${num} w-20 text-[var(--c-text-2)]`}>{(row.calls ?? 0).toLocaleString()}</span>
      )}
    </Tag>
  )
}

function DriverList({ d, onOpen }: { d: SessionDrivers; onOpen?: () => void }) {
  const max = Math.max(1, ...d.drivers.map(x => x.tokens))
  return (
    <div className="pt-1">
      <div className="flex items-center justify-between text-[10.5px] text-[var(--c-text-3)] mb-1">
        <span>{d.coarse ? 'Coarse attribution — this agent reports no cache detail' : 'Each turn’s new context blamed on the last tool / skill — approximate'}</span>
        {onOpen && <button className="text-[var(--c-accent)] hover:underline" onClick={onOpen}>Open transcript ↗</button>}
      </div>
      <div className="flex items-center gap-2.5 pb-1 mb-0.5 border-b border-[var(--c-border-sub)] text-[9px] uppercase tracking-wider text-[var(--c-text-3)]">
        <span className="w-11 shrink-0" />
        <span className="flex-1 min-w-0">Driver</span>
        <span className="w-16 text-right shrink-0">Tokens</span>
        <span className="w-14 text-right shrink-0">Cost</span>
        <span className="w-10 text-right shrink-0">Share</span>
      </div>
      {d.drivers.map(dr => (
        <div key={dr.kind + dr.name} className="py-1">
          <div className="flex items-center gap-2.5">
            <span className="w-11 shrink-0 text-[8.5px] font-bold uppercase text-center px-1 py-px rounded-full bg-[var(--c-surface-2)] text-[var(--c-text-3)]">{DRIVER_LABEL[dr.kind] ?? dr.kind}</span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--c-text-2)]">
              {dr.name}{dr.calls > 0 && <span className="text-[10px] text-[var(--c-text-3)]"> · {dr.calls}×</span>}
            </span>
            <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-[var(--c-text-2)]">{formatTokens(dr.tokens)}</span>
            <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-[var(--c-text-3)]">{money(dr.approxCostUsd)}</span>
            <span className="w-10 shrink-0 text-right text-[10.5px] tabular-nums text-[var(--c-text-3)]">{Math.round(dr.pct)}%</span>
          </div>
          <div className="mt-0.5 ml-[54px] h-[5px] rounded-full bg-[var(--c-surface-2)] overflow-hidden">
            <div className="h-full rounded-full bg-[var(--c-accent)]" style={{ width: `${Math.max(3, (dr.tokens / max) * 100)}%` }} />
          </div>
          {dr.hint && <p className="mt-1 ml-[54px] text-[10.5px] text-amber-400/90">⚠ {dr.hint}</p>}
        </div>
      ))}
      <div className="flex justify-between px-1 pt-2 mt-1 border-t border-[var(--c-border-sub)] text-[11px] text-[var(--c-text-3)]">
        <span>{d.model || 'session'} total</span>
        <span className="font-mono">{formatTokens(d.totalTokens)} · {money(d.totalCostUsd)}</span>
      </div>
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

const Crumb = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button className="text-[var(--c-accent)] hover:underline max-w-[220px] truncate" onClick={onClick}>{children}</button>
)
const Cur = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[var(--c-text-2)] max-w-[220px] truncate">{children}</span>
)
