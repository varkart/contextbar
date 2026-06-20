import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface AuditEvent {
  id: number
  ts_ms: number
  event_type: string
  tool_id: string
  item_name: string
  detail: string | null
}

const EVENT_COLORS: Record<string, string> = {
  skill_toggled:   'text-indigo-400 bg-indigo-500/10',
  mcp_toggled:     'text-violet-400 bg-violet-500/10',
  permission_set:  'text-amber-400  bg-amber-500/10',
  config_written:  'text-emerald-400 bg-emerald-500/10',
}

function eventColor(type: string) {
  return EVENT_COLORS[type] ?? 'text-[var(--c-text-3)] bg-[var(--c-surface)]'
}

function relativeTime(tsMs: number): string {
  const diffSec = Math.floor((Date.now() - tsMs) / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return new Date(tsMs).toLocaleDateString()
}

export default function LogsPanel(_: { onBack: () => void }) {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    invoke<AuditEvent[]>('get_audit_log', { limit: 200 })
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
      <div className="flex items-center justify-end px-4 py-2 border-b border-[var(--c-border)] flex-shrink-0">
        {!loading && (
          <span className="text-[12px] text-[var(--c-text-3)] tabular-nums">{events.length}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="px-4 py-4 space-y-2 animate-pulse">
            {[1,2,3,4].map(i => <div key={i} className="h-3 bg-[var(--c-skeleton)] rounded w-3/4" />)}
          </div>
        )}
        {!loading && events.length === 0 && (
          <p className="px-4 py-8 text-[13px] text-[var(--c-text-3)] text-center">No activity yet</p>
        )}
        {!loading && events.length > 0 && (
          <div className="divide-y divide-[var(--c-border-sub)]">
            {events.map(ev => (
              <div key={ev.id} className="px-4 py-2 flex items-start gap-2.5">
                <div className="flex flex-col flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${eventColor(ev.event_type)}`}>
                      {ev.event_type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[11px] text-[var(--c-text-3)] font-mono">{ev.tool_id}</span>
                  </div>
                  <p className="text-[13px] font-mono text-[var(--c-text-2)] truncate">{ev.item_name}</p>
                  {ev.detail && (
                    <p className="text-[11px] text-[var(--c-text-3)] truncate mt-0.5">{ev.detail}</p>
                  )}
                </div>
                <span className="text-[11px] text-[var(--c-text-3)] flex-shrink-0 tabular-nums mt-0.5">
                  {relativeTime(ev.ts_ms)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
