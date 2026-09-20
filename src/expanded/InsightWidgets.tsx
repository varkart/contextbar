import { useState, useMemo } from 'react'
import type { TokenPoint } from '../types'
import { formatTokens } from '../components/history/SessionStats'

const DAY = 86_400_000

/** Evenly-spaced bar indices (first, last, and up to 4 in between) to label
 *  on a bar chart's x-axis, so comparing two points doesn't require hovering
 *  every bar in between. */
function axisTickIndices(count: number): Set<number> {
  if (count <= 1) return new Set([0])
  const ticks = Math.min(6, count)
  const idxs = new Set<number>()
  for (let i = 0; i < ticks; i++) idxs.add(Math.round((i * (count - 1)) / (ticks - 1)))
  return idxs
}

/** Dashed gridline — thick + high-contrast enough to actually read against
 *  the chart background, unlike a 1px `border-dashed` in the subtle border
 *  color which disappears entirely. */
const GRIDLINE_STYLE = { borderTop: '2px dashed var(--c-border)' }

export function shortModel(model: string): string {
  return model.replace(/^claude-/, '').replace(/-\d{8}$/, '')
}

/** Pulsing placeholder block — shape the caller's own layout, don't invent one. */
export function SkeletonBar({ width = '100%', height = '10px', className = '' }: {
  width?: string
  height?: string
  className?: string
}) {
  return (
    <div
      className={`animate-pulse rounded bg-[var(--c-surface-2)] ${className}`}
      style={{ width, height }}
    />
  )
}

/** Row of tile-shaped skeletons matching <Tile>'s footprint. */
export function SkeletonTiles({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-2.5 mb-5" style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 px-3 py-2.5 text-center">
          <SkeletonBar width="40%" height="16px" className="mx-auto" />
          <SkeletonBar width="70%" height="9px" className="mx-auto mt-2" />
        </div>
      ))}
    </div>
  )
}

/** List-row skeletons matching a two-line title + meta row shape. */
export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="px-3 py-2.5 border-b border-[var(--c-border)]/50 last:border-0">
          <SkeletonBar width={`${70 + (i % 3) * 8}%`} height="12px" />
          <SkeletonBar width="35%" height="9px" className="mt-2" />
        </div>
      ))}
    </div>
  )
}

/** Card-shaped skeletons matching a repo/session-group card footprint. */
export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 px-4 py-3.5">
          <SkeletonBar width="35%" height="13px" />
          <SkeletonBar width="55%" height="9px" className="mt-2.5" />
        </div>
      ))}
    </div>
  )
}

export function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 p-4">
      <h3 className="text-[14px] font-semibold mb-0.5">{title}</h3>
      {sub && <p className="text-[12px] text-[var(--c-text-3)] mb-3">{sub}</p>}
      {children}
    </div>
  )
}

/** Labeled horizontal bar: name + value sit directly above their bar so the
 *  association is unambiguous. Width capped so bars stay readable in
 *  full-width sections. */
export function HBar({ name, value, pct, color, hint, onClick }: {
  name: string
  value: string
  pct: number
  color: string
  hint?: string
  /** When set, the whole bar becomes a button — used to jump from a usage
   *  insight to that skill's / MCP's detail page. */
  onClick?: () => void
}) {
  const inner = (
    <>
      <div className="flex items-baseline justify-between gap-2 text-[12px] mb-0.5">
        <span className={`font-medium truncate ${onClick ? 'text-[var(--c-accent)] group-hover/hbar:underline' : 'text-[var(--c-text-2)]'}`}>{name}</span>
        <span className="font-mono text-[var(--c-text-3)] shrink-0 flex items-center gap-1">
          {value}
          {onClick && <span aria-hidden className="text-[var(--c-accent)] group-hover/hbar:translate-x-0.5 transition-transform">›</span>}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--c-surface-2)] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.max(1.5, pct)}%`, background: color }} />
      </div>
    </>
  )
  if (onClick) {
    return (
      <button onClick={onClick} title={hint ?? `Open ${name}`} className="group/hbar block w-full text-left mb-2 min-w-0 max-w-md -mx-1.5 px-1.5 py-1 rounded-md hover:bg-[var(--c-hover)] transition-colors cursor-pointer">
        {inner}
      </button>
    )
  }
  return <div className="mb-2 min-w-0 max-w-md" title={hint}>{inner}</div>
}

/** Refresh button with feedback: spins while the refresh runs (min 600ms so
 *  it's visible even when data returns instantly), then flashes a checkmark. */
export function RefreshButton({ onClick, busy }: {
  onClick: () => void | Promise<unknown>
  busy?: boolean
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')

  const handle = async () => {
    if (state === 'busy') return
    setState('busy')
    const started = Date.now()
    try {
      await onClick()
    } catch { /* sections surface their own errors */ }
    const remaining = Math.max(0, 600 - (Date.now() - started))
    setTimeout(() => {
      setState('done')
      setTimeout(() => setState('idle'), 1200)
    }, remaining)
  }

  const spinning = state === 'busy' || (state === 'idle' && !!busy)
  const done = state === 'done'

  return (
    <button
      onClick={handle}
      title={done ? 'Refreshed' : 'Refresh'}
      aria-label="Refresh"
      aria-busy={spinning}
      className={`p-1.5 rounded-md border transition-colors flex-shrink-0 ${done ? 'border-emerald-500/40 text-emerald-400' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] hover:border-[var(--c-text-3)]/50'}`}
    >
      {done ? (
        <svg
          xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className="w-3.5 h-3.5"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`}
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <polyline points="21 3 21 9 15 9" />
        </svg>
      )}
    </button>
  )
}

/** Collapsible insights strip — collapsed by default, remembers state. */
export function Collapsible({ id, label, children }: {
  id: string
  label: string
  children: React.ReactNode
}) {
  const key = `contextbar:insights:${id}`
  const [open, setOpen] = useState(() => localStorage.getItem(key) === '1')
  const toggle = () => {
    const next = !open
    setOpen(next)
    localStorage.setItem(key, next ? '1' : '0')
  }
  return (
    <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-2 px-3.5 py-2 text-left hover:bg-[var(--c-surface-2)]/80 transition-colors"
        aria-expanded={open}
      >
        <span className={`text-[11px] text-[var(--c-text-3)] transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">▶</span>
        <span className="text-[12.5px] font-semibold text-[var(--c-text-2)]">{label}</span>
        {!open && <span className="text-[11px] text-[var(--c-text-3)] ml-auto">click to expand</span>}
      </button>
      {open && <div className="px-3.5 pb-3">{children}</div>}
    </div>
  )
}

/** Right-aligned readout line that charts update on hover. */
function HoverReadout({ text, placeholder }: { text: string | null; placeholder: string }) {
  return (
    <div className="h-4 mb-1 text-right">
      <span className={`text-[11.5px] font-mono ${text ? 'text-[var(--c-text-2)]' : 'text-[var(--c-text-3)] opacity-50'}`}>
        {text ?? placeholder}
      </span>
    </div>
  )
}

type TrendBucket = 'day' | 'week' | 'month'

const TREND_CONFIG: Record<TrendBucket, { count: number; label: string }> = {
  day: { count: 14, label: 'Last 14 days' },
  week: { count: 12, label: 'Last 12 weeks' },
  month: { count: 6, label: 'Last 6 months' },
}

function bucketStart(bucket: TrendBucket, index: number, count: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (bucket === 'day') {
    d.setDate(d.getDate() - (count - 1 - index))
  } else if (bucket === 'week') {
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // Monday of this week
    d.setDate(d.getDate() - (count - 1 - index) * 7)
  } else {
    d.setDate(1)
    d.setMonth(d.getMonth() - (count - 1 - index))
  }
  return d
}

/** Token usage bars with a day/week/month bucket toggle, local time. */
export function TokenTrend({ points }: { points: TokenPoint[] }) {
  const [bucket, setBucket] = useState<TrendBucket>('day')
  const [hover, setHover] = useState<string | null>(null)
  const { count } = TREND_CONFIG[bucket]

  const { buckets, max } = useMemo(() => {
    const starts = Array.from({ length: count }, (_, i) => bucketStart(bucket, i, count).getTime())
    const ends = [...starts.slice(1), Number.MAX_SAFE_INTEGER]
    const buckets = starts.map(() => 0)
    for (const p of points) {
      for (let i = count - 1; i >= 0; i--) {
        if (p.tsMs >= starts[i] && p.tsMs < ends[i]) {
          buckets[i] += p.tokens
          break
        }
      }
    }
    return { buckets, max: Math.max(1, ...buckets) }
  }, [points, bucket, count])

  const fmtLabel = (i: number) => {
    const d = bucketStart(bucket, i, count)
    if (bucket === 'month') return d.toLocaleDateString(undefined, { month: 'short' })
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  return (
    <div onMouseLeave={() => setHover(null)}>
      <div className="flex gap-1 mb-1 items-center">
        {(Object.keys(TREND_CONFIG) as TrendBucket[]).map(b => (
          <button
            key={b}
            onClick={() => setBucket(b)}
            className={`text-[11px] px-2 py-0.5 rounded-full border capitalize transition-colors ${bucket === b ? 'border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
          >
            {b}
          </button>
        ))}
        <div className="flex-1">
          <HoverReadout text={hover} placeholder="hover a bar" />
        </div>
      </div>
      <div className="flex items-end gap-1 h-24">
        {buckets.map((v, i) => (
          <div
            key={i}
            onMouseEnter={() => setHover(`${fmtLabel(i)} · ${formatTokens(v)} tokens`)}
            className="flex-1 rounded-sm min-w-[3px] hover:ring-1 hover:ring-[var(--c-accent)]"
            style={{
              height: v === 0 ? '3px' : `${Math.max(8, (v / max) * 100)}%`,
              background: v === 0 ? 'var(--c-surface-2)' : 'linear-gradient(to top, #6366f1, #a5b4fc)',
            }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[9.5px] font-mono text-[var(--c-text-3)] mt-1">
        <span>{fmtLabel(0)}</span><span>{fmtLabel(count - 1)}</span>
      </div>
    </div>
  )
}

/** Generic daily bar chart with a y-axis (max/half/0) and a per-bar hover
 *  tooltip — value (+ optional $ cost) above the bar, date below it.
 *  Downsamples to `maxBars` buckets (summing per bucket, `costs` summed in
 *  lockstep) when the window is wide, so bars stay readable instead of
 *  shrinking to hairlines; a wide window still reads as a shape, just not
 *  single-day resolution. */
export function DailyBars({ values, costs, start, color, height = 64, maxBars, formatValue }: {
  values: number[]
  /** Parallel to `values` — shown as "· $x.xx" next to the value on hover. */
  costs?: number[]
  start: number
  color: string
  height?: number
  maxBars?: number
  formatValue: (v: number) => string
}) {
  const { buckets, bucketCosts, groupSize } = useMemo(() => {
    if (!maxBars || values.length <= maxBars) return { buckets: values, bucketCosts: costs, groupSize: 1 }
    const groupSize = Math.ceil(values.length / maxBars)
    const buckets: number[] = []
    const bucketCosts: number[] = []
    for (let i = 0; i < values.length; i += groupSize) {
      buckets.push(values.slice(i, i + groupSize).reduce((a, b) => a + b, 0))
      if (costs) bucketCosts.push(costs.slice(i, i + groupSize).reduce((a, b) => a + b, 0))
    }
    return { buckets, bucketCosts: costs ? bucketCosts : undefined, groupSize }
  }, [values, costs, maxBars])
  const max = Math.max(1, ...buckets)
  const days = values.length

  const dayLabel = (i: number) => new Date(start + i * DAY).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const bucketLabel = (bi: number) => {
    const s = bi * groupSize, e = Math.min(days - 1, s + groupSize - 1)
    return groupSize > 1 ? `${dayLabel(s)} – ${dayLabel(e)}` : dayLabel(s)
  }
  const tickLabel = (bi: number) => dayLabel(bi * groupSize).replace(/^\w+, /, '')
  const tickIndices = useMemo(() => axisTickIndices(buckets.length), [buckets.length])

  return (
    <div>
      <div className="flex items-stretch gap-1.5">
        <div className="flex flex-col justify-between items-end text-[8px] font-mono text-[var(--c-text-3)] shrink-0" style={{ height }}>
          <span>{formatValue(max)}</span>
          <span>{formatValue(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="relative flex items-end gap-px border-l border-[var(--c-border-sub)] pl-1" style={{ height }}>
            <div className="absolute left-1 right-0 top-0" style={GRIDLINE_STYLE} />
            <div className="absolute left-1 right-0 top-1/2" style={GRIDLINE_STYLE} />
            <div className="absolute left-1 right-0 bottom-0" style={GRIDLINE_STYLE} />
            {buckets.map((v, i) => (
              <div
                key={i}
                className="relative group flex-1 rounded-sm min-w-[1px]"
                style={{ height: v === 0 ? '2px' : `${Math.max(4, (v / max) * 100)}%`, background: v === 0 ? 'var(--c-surface-2)' : color }}
              >
                <span className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-mono text-[var(--c-text-2)] whitespace-nowrap pointer-events-none z-10">
                  {formatValue(v)}{bucketCosts ? ` · $${bucketCosts[i].toFixed(2)}` : ''}
                </span>
                {/* Bars with a permanent x-axis tick already show their date below the chart — repeating it here on hover would overlap it. */}
                {!tickIndices.has(i) && (
                  <span className="absolute top-full mt-[18px] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-mono text-[var(--c-text-3)] whitespace-nowrap pointer-events-none z-10">
                    {bucketLabel(i)}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-px pl-1 mt-1">
            {buckets.map((_, i) => (
              <div key={i} className="flex-1 min-w-[1px] text-center text-[8px] font-mono text-[var(--c-text-3)] truncate">
                {tickIndices.has(i) ? tickLabel(i) : ' '}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Multi-agent daily bar chart — each bar stacks one color segment per
 *  active agent (or renders as a single solid color when only one agent is
 *  active, e.g. a filter chip other than "All"). Shares DailyBars' axis/
 *  gridline/hover-vs-tick-label conventions so the two charts read the same
 *  way side by side. Used by Usage & cost and Hours spent, which both need
 *  "everyone stacked" plus a per-agent filter over the same day grid. */
export function AgentStackedBars({ seriesByDay, activeAgents, colorFor, start, height = 90, formatValue }: {
  /** One entry per day; each maps agent id → that agent's value for the day. */
  seriesByDay: Record<string, number>[]
  activeAgents: string[]
  colorFor: (agent: string) => string
  start: number
  height?: number
  formatValue: (v: number) => string
}) {
  const totals = useMemo(
    () => seriesByDay.map(day => activeAgents.reduce((sum, a) => sum + (day[a] ?? 0), 0)),
    [seriesByDay, activeAgents]
  )
  const max = Math.max(1, ...totals)
  const days = seriesByDay.length

  const dayLabel = (i: number) => new Date(start + i * DAY).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const tickLabel = (i: number) => dayLabel(i).replace(/^\w+, /, '')
  const tickIndices = useMemo(() => axisTickIndices(days), [days])

  return (
    <div>
      <div className="flex items-stretch gap-1.5">
        <div className="flex flex-col justify-between items-end text-[8px] font-mono text-[var(--c-text-3)] shrink-0" style={{ height }}>
          <span>{formatValue(max)}</span>
          <span>{formatValue(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="relative flex items-end gap-px border-l border-[var(--c-border-sub)] pl-1" style={{ height }}>
            <div className="absolute left-1 right-0 top-0" style={GRIDLINE_STYLE} />
            <div className="absolute left-1 right-0 top-1/2" style={GRIDLINE_STYLE} />
            <div className="absolute left-1 right-0 bottom-0" style={GRIDLINE_STYLE} />
            {totals.map((total, i) => (
              <div
                key={i}
                className="relative group flex-1 min-w-[1px]"
                style={{ height: total === 0 ? '2px' : `${Math.max(4, (total / max) * 100)}%` }}
              >
                {/* Stack clipped to the bar's rounded shape — kept separate
                    from the tooltip spans below, which must NOT be clipped
                    since they're positioned outside this box (bottom-full/
                    top-full). */}
                <div className="w-full h-full rounded-sm overflow-hidden flex flex-col-reverse">
                  {total === 0 ? (
                    <div className="flex-1" style={{ background: 'var(--c-surface-2)' }} />
                  ) : (
                    activeAgents
                      .filter(a => (seriesByDay[i][a] ?? 0) > 0)
                      .map(a => (
                        <div key={a} style={{ height: `${((seriesByDay[i][a] ?? 0) / total) * 100}%`, background: colorFor(a) }} />
                      ))
                  )}
                </div>
                <span className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-mono text-[var(--c-text-2)] whitespace-nowrap pointer-events-none z-10">
                  {formatValue(total)}
                </span>
                {!tickIndices.has(i) && (
                  <span className="absolute top-full mt-[18px] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-mono text-[var(--c-text-3)] whitespace-nowrap pointer-events-none z-10">
                    {dayLabel(i)}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-px pl-1 mt-1">
            {seriesByDay.map((_, i) => (
              <div key={i} className="flex-1 min-w-[1px] text-center text-[8px] font-mono text-[var(--c-text-3)] truncate">
                {tickIndices.has(i) ? tickLabel(i) : ' '}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Ranked horizontal bars showing each agent's share of a total — the
 *  "Usage per agent" tile. Widths are relative to the largest agent, not to
 *  100%, so the leader always reads as a full-length bar. */
export function RankedAgentBars({ items }: {
  items: { agent: string; label: string; color: string; value: number; formatted: string; pct: number }[]
}) {
  const max = Math.max(1, ...items.map(i => i.value))
  return (
    <div className="flex flex-col gap-1.5">
      {items.map(item => (
        <div key={item.agent} className="flex items-center gap-2 text-[11px]">
          <span className="w-16 shrink-0 truncate">{item.label}</span>
          <div className="flex-1 h-2.5 rounded-full bg-[var(--c-surface-2)] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(item.value / max) * 100}%`, background: item.color }} />
          </div>
          <span className="w-24 shrink-0 text-right font-mono text-[10px] text-[var(--c-text-3)]">
            {item.formatted} · {item.pct}%
          </span>
        </div>
      ))}
    </div>
  )
}

const ACTIVITY_LEVEL_COLORS = [
  'var(--c-surface-2)',
  'color-mix(in srgb, #34d399 25%, var(--c-surface-2))',
  'color-mix(in srgb, #34d399 50%, var(--c-surface-2))',
  'color-mix(in srgb, #34d399 75%, var(--c-surface-2))',
  '#34d399',
]
const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const NAV_BUTTON_CLASS = 'w-6 h-6 flex items-center justify-center rounded-md border border-[var(--c-border)] text-[var(--c-text-2)] disabled:opacity-30 disabled:cursor-default hover:border-[var(--c-text-3)] hover:text-[var(--c-text)] transition-colors'

/** Plain "‹"/"›" glyphs render inconsistently thin/off-center across fonts —
 *  an explicit stroked chevron reads clearly at any size. */
function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className="w-3.5 h-3.5">
      <polyline points={direction === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </svg>
  )
}

function activityLevel(sessionCount: number): number {
  if (sessionCount <= 0) return 0
  if (sessionCount === 1) return 1
  if (sessionCount === 2) return 2
  if (sessionCount <= 4) return 3
  return 4
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** GitHub-contribution-graph visual language (small square, discrete green
 *  steps, Less→More legend) applied to a real per-day session-count map —
 *  not GitHub's own 12-months-by-week layout, just the look. `sessionCounts`
 *  keys are `dateKey()` strings. */
export function ActivityCalendar({ sessionCounts, monthDate, onNavigate, canGoPrev, canGoNext }: {
  sessionCounts: Map<string, number>
  monthDate: Date
  onNavigate: (delta: number) => void
  canGoPrev: boolean
  canGoNext: boolean
}) {
  const [hover, setHover] = useState<string | null>(null)
  const year = monthDate.getFullYear(), month = monthDate.getMonth()
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const cells: (number | null)[] = Array(firstDow).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1))
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-semibold">{monthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
        <span
          className={`text-[11px] transition-colors ${hover ? 'font-semibold text-[var(--c-accent)]' : 'text-[var(--c-text-3)]'}`}
        >
          {hover ?? '⟶ hover a day for details'}
        </span>
      </div>
      <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
        {DOW_LABELS.map((d, i) => <div key={i} className="text-center text-[10px] font-medium text-[var(--c-text-3)]">{d}</div>)}
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }} onMouseLeave={() => setHover(null)}>
        {cells.map((d, i) => {
          if (d === null) return <div key={i} style={{ aspectRatio: '1' }} />
          const date = new Date(year, month, d)
          const isFuture = date > today
          const isToday = date.getTime() === today.getTime()
          const count = sessionCounts.get(dateKey(date)) ?? 0
          const level = isFuture ? 0 : activityLevel(count)
          return (
            <div
              key={i}
              onMouseEnter={() => !isFuture && setHover(`${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${count} session${count === 1 ? '' : 's'}`)}
              title={isFuture ? '' : `${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${count} session${count === 1 ? '' : 's'}`}
              className={isFuture ? '' : 'hover:ring-2 hover:ring-[var(--c-accent)] hover:scale-110 transition-transform cursor-default'}
              style={{
                aspectRatio: '1', borderRadius: 4,
                background: isFuture ? 'transparent' : ACTIVITY_LEVEL_COLORS[level],
                border: isToday ? '1.5px solid var(--c-accent)' : isFuture ? '1px dashed color-mix(in srgb, var(--c-text-3) 40%, transparent)' : '1px solid transparent',
              }}
            />
          )
        })}
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-[3px] text-[9px] text-[var(--c-text-3)]">
          <span>Less</span>
          {ACTIVITY_LEVEL_COLORS.map((c, i) => <span key={i} style={{ width: 10, height: 10, borderRadius: 2, background: c, display: 'inline-block' }} />)}
          <span>More</span>
        </div>
        {/* Month nav sits here, not up by the title — you decide you want a
            different month only after scanning this grid, so that's where
            the controls for it belong. See AGENTS.md "act on user focus." */}
        <div className="flex items-center gap-1">
          <button onClick={() => onNavigate(-1)} disabled={!canGoPrev} title="Previous month" aria-label="Previous month" className={NAV_BUTTON_CLASS}>
            <ChevronIcon direction="left" />
          </button>
          <button onClick={() => onNavigate(1)} disabled={!canGoNext} title="Next month" aria-label="Next month" className={NAV_BUTTON_CLASS}>
            <ChevronIcon direction="right" />
          </button>
        </div>
      </div>
    </div>
  )
}

/** This-week row (Sun–Sat) — same cells as ActivityCalendar, no month framing. */
export function ActivityWeekRow({ sessionCounts }: { sessionCounts: Map<string, number> }) {
  const [hover, setHover] = useState<string | null>(null)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const sun = new Date(today); sun.setDate(today.getDate() - today.getDay())
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(sun); d.setDate(sun.getDate() + i); return d })

  return (
    <div>
      <div className={`text-right h-3 mb-1.5 text-[11px] transition-colors ${hover ? 'font-semibold text-[var(--c-accent)]' : 'text-[var(--c-text-3)]'}`}>
        {hover ?? '⟶ hover a day for details'}
      </div>
      <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
        {DOW_LABELS.map((d, i) => <div key={i} className="text-center text-[10px] font-medium text-[var(--c-text-3)]">{d}</div>)}
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }} onMouseLeave={() => setHover(null)}>
        {days.map((date, i) => {
          const isFuture = date > today
          const isToday = date.getTime() === today.getTime()
          const count = sessionCounts.get(dateKey(date)) ?? 0
          const level = isFuture ? 0 : activityLevel(count)
          return (
            <div
              key={i}
              onMouseEnter={() => !isFuture && setHover(`${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${count} session${count === 1 ? '' : 's'}`)}
              className={isFuture ? '' : 'hover:ring-2 hover:ring-[var(--c-accent)] hover:scale-110 transition-transform cursor-default'}
              style={{
                aspectRatio: '1', borderRadius: 4,
                background: isFuture ? 'transparent' : ACTIVITY_LEVEL_COLORS[level],
                border: isToday ? '1.5px solid var(--c-accent)' : isFuture ? '1px dashed color-mix(in srgb, var(--c-text-3) 40%, transparent)' : '1px solid transparent',
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

/** Today/Yesterday collapse Activity to the one number those windows answer. */
export function ActivityAgentCount({ count, label }: { count: number; label: string }) {
  return (
    <div className="text-center py-2.5">
      <div className="text-[32px] font-bold leading-none">{count}</div>
      <div className="text-[11px] text-[var(--c-text-3)] mt-1">agent{count === 1 ? '' : 's'} {label}</div>
    </div>
  )
}

/** Daily commit bars for the trailing `daysBack` days from raw unix-second
 *  timestamps. Hover a bar: commit count above it, date below it. `start`
 *  (ms) anchors the buckets to the actual selected window — defaults to
 *  "ending today" when the caller doesn't have a specific window (e.g. a
 *  fixed past range like Previous Month wouldn't line up otherwise). */
export function CommitBars({ commitSecs, daysBack = 14, start }: { commitSecs: number[]; daysBack?: number; start?: number }) {
  const { buckets, max, total, rangeStart } = useMemo(() => {
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    const rangeStart = start ?? (midnight.getTime() - (daysBack - 1) * DAY)
    const buckets = Array(daysBack).fill(0)
    for (const sec of commitSecs) {
      const idx = Math.floor((sec * 1000 - rangeStart) / DAY)
      if (idx >= 0 && idx < daysBack) buckets[idx]++
    }
    return { buckets, max: Math.max(1, ...buckets), total: buckets.reduce((a: number, b: number) => a + b, 0), rangeStart }
  }, [commitSecs, daysBack, start])

  const dayLabel = (i: number) =>
    new Date(rangeStart + i * DAY).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const tickLabel = (i: number) => dayLabel(i).replace(/^\w+, /, '')
  const tickIndices = useMemo(() => axisTickIndices(buckets.length), [buckets.length])
  const chartHeight = 96

  return (
    <div>
      <div className="flex items-stretch gap-1.5">
        <div className="flex flex-col justify-between items-end text-[8px] font-mono text-[var(--c-text-3)] shrink-0" style={{ height: chartHeight }}>
          <span>{max}</span>
          <span>{Math.round(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="relative flex items-end gap-1 border-l border-[var(--c-border-sub)] pl-1" style={{ height: chartHeight }}>
            <div className="absolute left-1 right-0 top-0" style={GRIDLINE_STYLE} />
            <div className="absolute left-1 right-0 top-1/2" style={GRIDLINE_STYLE} />
            <div className="absolute left-1 right-0 bottom-0" style={GRIDLINE_STYLE} />
            {buckets.map((v, i) => (
              <div
                key={i}
                className="relative group flex-1 rounded-sm min-w-[3px] hover:ring-1 hover:ring-emerald-400"
                style={{
                  height: v === 0 ? '3px' : `${Math.max(8, (v / max) * 100)}%`,
                  background: v === 0 ? 'var(--c-surface-2)' : 'linear-gradient(to top, #059669, #34d399)',
                }}
              >
                <span className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-mono text-[var(--c-text-2)] whitespace-nowrap pointer-events-none z-10">
                  {v} commit{v === 1 ? '' : 's'}
                </span>
                {!tickIndices.has(i) && (
                  <span className="absolute top-full mt-[18px] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-mono text-[var(--c-text-3)] whitespace-nowrap pointer-events-none z-10">
                    {dayLabel(i)}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-1 pl-1 mt-1">
            {buckets.map((_, i) => (
              <div key={i} className="flex-1 min-w-[3px] text-center text-[8px] font-mono text-[var(--c-text-3)] truncate">
                {tickIndices.has(i) ? tickLabel(i) : ' '}
              </div>
            ))}
          </div>
          <div className="text-right text-[9.5px] font-mono text-[var(--c-text-3)] mt-1">{total} total</div>
        </div>
      </div>
    </div>
  )
}
