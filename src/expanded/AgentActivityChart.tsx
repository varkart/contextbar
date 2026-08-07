import { useState, useEffect, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { AgentActivityPoint } from '../types'
import { agentColor } from '../constants/agentColors'

type Range = '7d' | '30d' | '3mo' | '6mo' | '1yr'

const RANGE_DAYS: Record<Range, number> = {
  '7d': 7,
  '30d': 30,
  '3mo': 90,
  '6mo': 180,
  '1yr': 365,
}

const RANGE_LABEL: Record<Range, string> = {
  '7d': '7d',
  '30d': '30d',
  '3mo': '3mo',
  '6mo': '6mo',
  '1yr': '1yr',
}

function dayKey(tsMs: number): string {
  // en-CA formats as YYYY-MM-DD in the browser's local timezone.
  return new Date(tsMs).toLocaleDateString('en-CA')
}

function fmtMinutes(m: number): string {
  if (m <= 0) return '0m'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`
}

/**
 * Estimated active time per agent, per day — stacked bars over a selectable
 * lookback window. "Estimated" because duration is a first-prompt→last-
 * prompt span per session (capped at 4h), not tracked wall-clock time.
 */
export default function AgentActivityChart() {
  const [range, setRange] = useState<Range>('30d')
  const [points, setPoints] = useState<AgentActivityPoint[] | 'loading'>('loading')
  const [hover, setHover] = useState<string | null>(null)

  useEffect(() => {
    setPoints('loading')
    const sinceMs = Date.now() - RANGE_DAYS[range] * 86_400_000
    invoke<AgentActivityPoint[]>('get_agent_activity', { sinceMs })
      .then(setPoints)
      .catch(() => setPoints([]))
  }, [range])

  const { days, agentsPresent, maxMinutes, totalsByAgent } = useMemo(() => {
    const nDays = RANGE_DAYS[range]
    const dayKeys = Array.from({ length: nDays }, (_, i) => {
      const d = new Date(Date.now() - (nDays - 1 - i) * 86_400_000)
      return d.toLocaleDateString('en-CA')
    })
    const byDay = new Map<string, Map<string, number>>(dayKeys.map(k => [k, new Map()]))
    const agents = new Set<string>()
    const totals = new Map<string, number>()
    if (Array.isArray(points)) {
      for (const p of points) {
        const key = dayKey(p.tsMs)
        const bucket = byDay.get(key)
        if (!bucket) continue // outside the day grid (range/tz edge)
        bucket.set(p.agent, (bucket.get(p.agent) ?? 0) + p.minutes)
        agents.add(p.agent)
        totals.set(p.agent, (totals.get(p.agent) ?? 0) + p.minutes)
      }
    }
    const days = dayKeys.map(key => {
      const bucket = byDay.get(key)!
      const total = [...bucket.values()].reduce((a, b) => a + b, 0)
      return { key, bucket, total }
    })
    const maxMinutes = Math.max(1, ...days.map(d => d.total))
    const agentsPresent = [...agents].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0))
    return { days, agentsPresent, maxMinutes, totalsByAgent: totals }
  }, [points, range])

  const fmtDayLabel = (key: string) =>
    new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  return (
    <div onMouseLeave={() => setHover(null)}>
      <div className="flex gap-1 mb-1 items-center">
        {(Object.keys(RANGE_DAYS) as Range[]).map(r => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${range === r ? 'border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
        <div className="flex-1 text-right h-4 mb-0.5">
          <span className={`text-[11.5px] font-mono ${hover ? 'text-[var(--c-text-2)]' : 'text-[var(--c-text-3)] opacity-50'}`}>
            {hover ?? 'hover a day'}
          </span>
        </div>
      </div>

      {points === 'loading' ? (
        <div className="h-24 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-[var(--c-accent)]/40 border-t-[var(--c-accent)] rounded-full animate-spin" />
        </div>
      ) : agentsPresent.length === 0 ? (
        <p className="text-[13px] text-[var(--c-text-3)] h-24 flex items-center justify-center">No session activity in this range</p>
      ) : (
        <>
          <div className="flex items-end gap-px h-24">
            {days.map(({ key, bucket, total }) => (
              <div
                key={key}
                onMouseEnter={() => {
                  const breakdown = agentsPresent
                    .filter(a => (bucket.get(a) ?? 0) > 0)
                    .map(a => `${agentColor(a).label} ${fmtMinutes(bucket.get(a) ?? 0)}`)
                    .join(', ')
                  setHover(`${fmtDayLabel(key)} · ${breakdown || 'no activity'}`)
                }}
                className="flex-1 min-w-[1px] flex flex-col-reverse rounded-sm overflow-hidden hover:ring-1 hover:ring-[var(--c-accent)]"
                style={{ height: total === 0 ? '3px' : `${Math.max(6, (total / maxMinutes) * 100)}%` }}
              >
                {total === 0 ? (
                  <div className="flex-1" style={{ background: 'var(--c-surface-2)' }} />
                ) : (
                  agentsPresent
                    .filter(a => (bucket.get(a) ?? 0) > 0)
                    .map(a => (
                      <div
                        key={a}
                        style={{ height: `${((bucket.get(a) ?? 0) / total) * 100}%`, background: agentColor(a).hex }}
                      />
                    ))
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-3 flex-wrap mt-2 text-[11.5px] text-[var(--c-text-3)]">
            {agentsPresent.map(a => (
              <span key={a} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm" style={{ background: agentColor(a).hex }} />
                {agentColor(a).label} · {fmtMinutes(totalsByAgent.get(a) ?? 0)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
