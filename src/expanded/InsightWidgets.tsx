import { useState, useMemo } from 'react'
import type { TokenPoint } from '../types'
import { formatTokens } from '../components/history/SessionStats'

const DAY = 86_400_000
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function shortModel(model: string): string {
  return model.replace(/^claude-/, '').replace(/-\d{8}$/, '')
}

export function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 p-4">
      <h3 className="text-[13px] font-semibold mb-0.5">{title}</h3>
      {sub && <p className="text-[11px] text-[var(--c-text-3)] mb-3">{sub}</p>}
      {children}
    </div>
  )
}

/** Labeled horizontal bar: name + value sit directly above their bar so the
 *  association is unambiguous. Width capped so bars stay readable in
 *  full-width sections. */
export function HBar({ name, value, pct, color, hint }: {
  name: string
  value: string
  pct: number
  color: string
  hint?: string
}) {
  return (
    <div className="mb-2 min-w-0 max-w-md" title={hint}>
      <div className="flex items-baseline justify-between gap-2 text-[11px] mb-0.5">
        <span className="font-medium text-[var(--c-text-2)] truncate">{name}</span>
        <span className="font-mono text-[var(--c-text-3)] shrink-0">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--c-surface-2)] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.max(1.5, pct)}%`, background: color }} />
      </div>
    </div>
  )
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
        <span className={`text-[10px] text-[var(--c-text-3)] transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">▶</span>
        <span className="text-[11.5px] font-semibold text-[var(--c-text-2)]">{label}</span>
        {!open && <span className="text-[10px] text-[var(--c-text-3)] ml-auto">click to expand</span>}
      </button>
      {open && <div className="px-3.5 pb-3">{children}</div>}
    </div>
  )
}

/** Right-aligned readout line that charts update on hover. */
function HoverReadout({ text, placeholder }: { text: string | null; placeholder: string }) {
  return (
    <div className="h-4 mb-1 text-right">
      <span className={`text-[10.5px] font-mono ${text ? 'text-[var(--c-text-2)]' : 'text-[var(--c-text-3)] opacity-50'}`}>
        {text ?? placeholder}
      </span>
    </div>
  )
}

/** Weekday × hour prompt-density grid from raw timestamps (ms), local time. */
export function ActivityHeatmap({ timestamps }: { timestamps: number[] }) {
  const [hover, setHover] = useState<string | null>(null)
  const { grid, max } = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
    let max = 0
    for (const ts of timestamps) {
      const d = new Date(ts)
      const day = (d.getDay() + 6) % 7 // Monday = 0
      const cell = ++grid[day][d.getHours()]
      if (cell > max) max = cell
    }
    return { grid, max }
  }, [timestamps])

  return (
    <div className="min-w-0 overflow-hidden" onMouseLeave={() => setHover(null)}>
      <HoverReadout text={hover} placeholder="hover a cell for details" />
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: '30px repeat(24, minmax(0, 1fr))' }}>
        {DAY_LABELS.map((label, di) => (
          <div key={label} className="contents">
            <span className="text-[9px] font-mono text-[var(--c-text-3)] self-center">{label}</span>
            {grid[di].map((v, h) => {
              const alpha = v === 0 ? 0 : 0.25 + 0.75 * (v / Math.max(1, max))
              return (
                <span
                  key={h}
                  onMouseEnter={() => setHover(`${label} ${h}:00–${h + 1}:00 · ${v} prompt${v === 1 ? '' : 's'}`)}
                  className="h-2.5 w-full rounded-[2px] hover:ring-1 hover:ring-[var(--c-accent)]"
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
            className={`text-[10px] px-2 py-0.5 rounded-full border capitalize transition-colors ${bucket === b ? 'border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
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
      <div className="flex justify-between text-[9px] font-mono text-[var(--c-text-3)] mt-1">
        <span>{fmtLabel(0)}</span><span>{fmtLabel(count - 1)}</span>
      </div>
    </div>
  )
}

/** Daily commit bars for the trailing `daysBack` days from raw unix-second timestamps. */
export function CommitBars({ commitSecs, daysBack = 14 }: { commitSecs: number[]; daysBack?: number }) {
  const [hover, setHover] = useState<string | null>(null)
  const { buckets, max, total, start } = useMemo(() => {
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    const start = midnight.getTime() - (daysBack - 1) * DAY
    const buckets = Array(daysBack).fill(0)
    for (const sec of commitSecs) {
      const idx = Math.floor((sec * 1000 - start) / DAY)
      if (idx >= 0 && idx < daysBack) buckets[idx]++
    }
    return { buckets, max: Math.max(1, ...buckets), total: buckets.reduce((a: number, b: number) => a + b, 0), start }
  }, [commitSecs, daysBack])

  const dayLabel = (i: number) =>
    new Date(start + i * DAY).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div onMouseLeave={() => setHover(null)}>
      <HoverReadout text={hover} placeholder="hover a bar" />
      <div className="flex items-end gap-1 h-24">
        {buckets.map((v, i) => (
          <div
            key={i}
            onMouseEnter={() => setHover(`${dayLabel(i)} · ${v} commit${v === 1 ? '' : 's'}`)}
            className="flex-1 rounded-sm min-w-[3px] hover:ring-1 hover:ring-emerald-400"
            style={{
              height: v === 0 ? '3px' : `${Math.max(8, (v / max) * 100)}%`,
              background: v === 0 ? 'var(--c-surface-2)' : 'linear-gradient(to top, #059669, #34d399)',
            }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[9px] font-mono text-[var(--c-text-3)] mt-1">
        <span>{daysBack - 1}d ago</span><span>today · {total} total</span>
      </div>
    </div>
  )
}
