import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { SessionInsights, SessionDrivers, SessionCost, Driver } from '../types'
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
  tool: 'tool', mcp: 'mcp', skill: 'skill', prompt: 'prompt',
  initial: 'init', compaction: 'compact', growth: 'growth', reread: 're-read',
  edit: 'edit', write: 'write', shell: 'shell', search: 'search',
  answer: 'answer', reasoning: 'think',
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
    invoke('warm_session_stats').catch(() => {})
    invoke<SessionInsights>('get_session_insights', { sinceMs: range.since, untilMs: range.until })
      .then(d => { if (live) setByMonth(m => ({ ...m, [month]: d })) })
      .catch(() => {})
    return () => { live = false }
  }, [month, range.since, range.until, byMonth])

  // The stats warm pass runs in the background; when it finishes parsing new
  // sessions, drop the cache so every month refetches with the fresh numbers
  // (this is what fixes prompt counts showing 0 until the parse completes).
  useEffect(() => {
    const un = listen('session-insights-updated', () => setByMonth({}))
    return () => { un.then(f => f()) }
  }, [])

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

// Twin colored columns — Input (blue) and Output (amber) sit side by side so
// which side a row belongs to is a color, not just a section label you have
// to keep track of while scrolling.
const IN_COLOR = '#60a5fa'
const OUT_COLOR = '#f59e0b'

function DriverColumnRows({ rows, color }: { rows: Driver[]; color: string }) {
  const max = Math.max(1, ...rows.map(x => x.tokens))
  if (!rows.length) return <p className="text-[11px] text-[var(--c-text-3)] py-1.5">nothing attributed</p>
  return (
    <>
      {rows.map(dr => (
        <div key={dr.kind + dr.name} className="py-1.5 border-l-2 pl-2" style={{ borderColor: color }}>
          <div className="flex items-baseline justify-between gap-1.5">
            <span className="min-w-0 truncate text-[11.5px] text-[var(--c-text-2)]">
              <span className="text-[8px] font-bold uppercase text-[var(--c-text-3)] mr-1">{DRIVER_LABEL[dr.kind] ?? dr.kind}</span>
              {dr.name}
              {dr.calls > 0 && <span className="text-[10px] text-[var(--c-text-3)]"> · {dr.calls}×</span>}
            </span>
            <span className="shrink-0 text-right text-[10.5px] tabular-nums text-[var(--c-text-3)]">{Math.round(dr.pct)}%</span>
          </div>
          {dr.side === 'input' && dr.rereadTokens != null && dr.rereadTokens > 0 && (
            <div className="text-[10px] text-[var(--c-text-3)]">{formatTokens(dr.createdTokens ?? 0)} new + {formatTokens(dr.rereadTokens)} re-read</div>
          )}
          <div className="mt-1 h-[5px] rounded-full bg-[var(--c-surface-2)] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.max(3, (dr.tokens / max) * 100)}%`, background: color }} />
          </div>
          <div className="mt-0.5 flex justify-between text-[10.5px] tabular-nums text-[var(--c-text-3)]">
            <span>{formatTokens(dr.tokens)}</span><span>{money(dr.approxCostUsd)}</span>
          </div>
          {dr.hint && <p className="mt-1 text-[10.5px] text-amber-400/90">⚠ {dr.hint}</p>}
        </div>
      ))}
    </>
  )
}

function DriverColumn({ label, total, cost, color, rows, arrow }: {
  label: string; total: number; cost: number; color: string; rows: Driver[]; arrow: string
}) {
  return (
    <div className="min-w-0">
      <div className="pt-1.5 border-t-2" style={{ borderColor: color }}>
        <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color }}>{arrow} {label}</div>
        <div className="text-[16px] font-bold text-[var(--c-text)]">
          {formatTokens(total)} <span className="text-[10.5px] font-normal text-[var(--c-text-3)]">· {money(cost)}</span>
        </div>
      </div>
      <div className="mt-1.5">
        <DriverColumnRows rows={rows} color={color} />
      </div>
    </div>
  )
}

function DriverList({ d, onOpen }: { d: SessionDrivers; onOpen?: () => void }) {
  const input = d.drivers.filter(x => x.side === 'input')
  const output = d.drivers.filter(x => x.side === 'output')
  const inputCost = input.reduce((n, x) => n + (x.approxCostUsd ?? 0), 0)
  const outputCost = output.reduce((n, x) => n + (x.approxCostUsd ?? 0), 0)
  return (
    <div className="pt-1">
      <div className="flex items-center justify-between text-[10.5px] text-[var(--c-text-3)] mb-2">
        <span>{d.coarse
          ? 'Coarse — this agent reports no cache detail; splits are estimated from block sizes'
          : 'Approximate — each turn’s new context blamed on its last tool / skill; output split by block size'}</span>
        {onOpen && <button className="text-[var(--c-accent)] hover:underline flex-shrink-0 ml-2" onClick={onOpen}>Open transcript ↗</button>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <DriverColumn label="Input" total={d.inputTokens} cost={inputCost} color={IN_COLOR} rows={input} arrow="↓" />
        <DriverColumn label="Output" total={d.outputTokens} cost={outputCost} color={OUT_COLOR} rows={output} arrow="↑" />
      </div>

      <div className="flex justify-between px-1 pt-2 mt-2 border-t border-[var(--c-border-sub)] text-[11px] text-[var(--c-text-3)]">
        <span>{d.model || 'session'} total</span>
        <span className="font-mono">↓{formatTokens(d.inputTokens)} ↑{formatTokens(d.outputTokens)} · {money(d.totalCostUsd)}</span>
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
