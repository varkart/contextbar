import { useMemo } from 'react'

const DAY = 86_400_000
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 p-4">
      <h3 className="text-[13px] font-semibold mb-0.5">{title}</h3>
      {sub && <p className="text-[11px] text-[var(--c-text-3)] mb-3">{sub}</p>}
      {children}
    </div>
  )
}

export function HBar({ name, value, pct, color, hint }: {
  name: string
  value: string
  pct: number
  color: string
  hint?: string
}) {
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

/** Weekday × hour prompt-density grid from raw timestamps (ms), local time. */
export function ActivityHeatmap({ timestamps }: { timestamps: number[] }) {
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
    <div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: '30px repeat(24, 1fr)' }}>
        {DAY_LABELS.map((label, di) => (
          <div key={label} className="contents">
            <span className="text-[9px] font-mono text-[var(--c-text-3)] self-center">{label}</span>
            {grid[di].map((v, h) => {
              const alpha = v === 0 ? 0 : 0.2 + 0.8 * (v / Math.max(1, max))
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
    </div>
  )
}

/** Daily commit bars for the trailing `daysBack` days from raw unix-second timestamps. */
export function CommitBars({ commitSecs, daysBack = 14 }: { commitSecs: number[]; daysBack?: number }) {
  const { buckets, max, total } = useMemo(() => {
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    const start = midnight.getTime() - (daysBack - 1) * DAY
    const buckets = Array(daysBack).fill(0)
    for (const sec of commitSecs) {
      const idx = Math.floor((sec * 1000 - start) / DAY)
      if (idx >= 0 && idx < daysBack) buckets[idx]++
    }
    return { buckets, max: Math.max(1, ...buckets), total: buckets.reduce((a: number, b: number) => a + b, 0) }
  }, [commitSecs, daysBack])

  return (
    <div>
      <div className="flex items-end gap-1 h-24 mt-2">
        {buckets.map((v, i) => (
          <div
            key={i}
            title={`${v} commit${v === 1 ? '' : 's'}`}
            className="flex-1 rounded-t-sm bg-[var(--c-accent)]/20 border-t-2 border-[var(--c-accent)]"
            style={{ height: `${Math.max(4, (v / max) * 100)}%`, opacity: v === 0 ? 0.25 : 1 }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[9px] font-mono text-[var(--c-text-3)] mt-1">
        <span>{daysBack - 1}d ago</span><span>today · {total} total</span>
      </div>
    </div>
  )
}
