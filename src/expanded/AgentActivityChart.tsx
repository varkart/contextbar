import { useState, useEffect, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { AgentActivityPoint } from '../types'
import { agentColor } from '../constants/agentColors'
import { AgentStackedBars } from './InsightWidgets'

const DAY = 86_400_000

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
 * Shares AgentStackedBars with Usage & cost / Hours spent on My Work, so
 * the axis labels, dotted gridlines, and per-bar hover positioning (value
 * above, date below) all read the same way across the app.
 */
export default function AgentActivityChart() {
  const [range, setRange] = useState<Range>('30d')
  const [points, setPoints] = useState<AgentActivityPoint[] | 'loading'>('loading')

  useEffect(() => {
    setPoints('loading')
    const sinceMs = Date.now() - RANGE_DAYS[range] * 86_400_000
    invoke<AgentActivityPoint[]>('get_agent_activity', { sinceMs })
      .then(setPoints)
      .catch(() => setPoints([]))
  }, [range])

  const { start, seriesByDay, agentsPresent, totalsByAgent, breakdownByDay } = useMemo(() => {
    const nDays = RANGE_DAYS[range]
    // Local midnight `nDays - 1` days ago — day index 0 of the grid below.
    const anchor = new Date()
    anchor.setHours(0, 0, 0, 0)
    anchor.setDate(anchor.getDate() - (nDays - 1))
    const start = anchor.getTime()
    const dayKeys = Array.from({ length: nDays }, (_, i) => dayKey(start + i * DAY))

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
    const agentsPresent = [...agents].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0))
    const seriesByDay = dayKeys.map(key => Object.fromEntries(byDay.get(key) ?? []))
    const breakdownByDay = dayKeys.map((_, i) => {
      const bucket = byDay.get(dayKeys[i])!
      const parts = agentsPresent
        .filter(a => (bucket.get(a) ?? 0) > 0)
        .map(a => `${agentColor(a).label} ${fmtMinutes(bucket.get(a) ?? 0)}`)
      return parts.length ? parts.join(', ') : 'no activity'
    })
    return { start, seriesByDay, agentsPresent, totalsByAgent: totals, breakdownByDay }
  }, [points, range])

  return (
    <div>
      <div className="flex gap-1 mb-2 items-center">
        {(Object.keys(RANGE_DAYS) as Range[]).map(r => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${range === r ? 'border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      {points === 'loading' ? (
        <div className="h-24 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-[var(--c-accent)]/40 border-t-[var(--c-accent)] rounded-full animate-spin" />
        </div>
      ) : agentsPresent.length === 0 ? (
        <p className="text-[13px] text-[var(--c-text-3)] h-24 flex items-center justify-center">No session activity in this range</p>
      ) : (
        <>
          <AgentStackedBars
            seriesByDay={seriesByDay}
            activeAgents={agentsPresent}
            colorFor={a => agentColor(a).hex}
            start={start}
            formatValue={fmtMinutes}
            tooltipFor={i => breakdownByDay[i]}
          />
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
