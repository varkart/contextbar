import { useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface DoctorItem {
  id: string
  label: string
  status: 'ok' | 'warn' | 'error'
  detail?: string
  fixHint?: string
}

interface DoctorSection {
  title: string
  items: DoctorItem[]
}

type RunState = 'idle' | 'running' | 'done'

function StatusIcon({ status }: { status: DoctorItem['status'] }) {
  if (status === 'ok') {
    return (
      <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    )
  }
  if (status === 'warn') {
    return (
      <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    )
  }
  return (
    <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-3)] px-3 pt-4 pb-1 first:pt-2">
      {children}
    </p>
  )
}

export default function DoctorView({ onBack }: { onBack: () => void }) {
  const [runState, setRunState] = useState<RunState>('idle')
  const [sections, setSections] = useState<DoctorSection[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expandedHints, setExpandedHints] = useState<Set<string>>(new Set())

  const runDoctor = useCallback(async () => {
    setRunState('running')
    setError(null)
    setSections([])
    setExpandedHints(new Set())
    try {
      const result = await invoke<DoctorSection[]>('run_doctor')
      setSections(result)
      setRunState('done')
    } catch (e) {
      setError(String(e))
      setRunState('idle')
    }
  }, [])

  const toggleHint = (id: string) => {
    setExpandedHints(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const issueCount = sections.reduce(
    (n, s) => n + s.items.filter(i => i.status !== 'ok').length,
    0
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--c-border)]">
        <button
          onClick={onBack}
          className="p-1 rounded hover:bg-[var(--c-surface-2)] text-[var(--c-text-3)] hover:text-[var(--c-text-1)] transition-colors"
          aria-label="Back"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-[13px] font-semibold text-[var(--c-text-1)] flex-1">Doctor</span>
        {runState === 'done' && (
          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
            issueCount === 0
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-red-500/10 text-red-400'
          }`}>
            {issueCount === 0 ? 'All clear' : `${issueCount} issue${issueCount > 1 ? 's' : ''}`}
          </span>
        )}
        <button
          onClick={runDoctor}
          disabled={runState === 'running'}
          className="text-[12px] px-2 py-1 rounded-md bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {runState === 'running' ? 'Running…' : runState === 'done' ? 'Re-run' : 'Run'}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {runState === 'idle' && !error && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--c-text-3)] px-6 text-center">
            <svg className="w-8 h-8 opacity-40" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[13px]">Checks runtimes, PATH, and active MCP commands</p>
            <button
              onClick={runDoctor}
              className="text-[13px] px-4 py-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-400 transition-colors font-medium"
            >
              Run Doctor
            </button>
          </div>
        )}

        {runState === 'running' && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--c-text-3)]">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <p className="text-[13px]">Scanning environment…</p>
          </div>
        )}

        {error && (
          <div className="m-3 p-3 rounded-lg bg-red-500/10 text-red-400 text-[12px]">
            {error}
          </div>
        )}

        {runState === 'done' && sections.map(section => (
          <div key={section.title}>
            <SectionLabel>{section.title}</SectionLabel>
            <div className="divide-y divide-[var(--c-border-sub)] mx-2 rounded-lg overflow-hidden border border-[var(--c-border)]">
              {section.items.map(item => (
                <div key={item.id} className="bg-[var(--c-surface-1)]">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <StatusIcon status={item.status} />
                    <span className="text-[12px] text-[var(--c-text-1)] flex-1 min-w-0 truncate">
                      {item.label}
                    </span>
                    {item.detail && (
                      <span className="text-[11px] text-[var(--c-text-3)] flex-shrink-0 max-w-[120px] truncate">
                        {item.detail}
                      </span>
                    )}
                    {item.fixHint && (
                      <button
                        onClick={() => toggleHint(item.id)}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 flex-shrink-0"
                        aria-label="Show fix"
                      >
                        {expandedHints.has(item.id) ? 'Hide' : 'Fix'}
                      </button>
                    )}
                  </div>
                  {item.fixHint && expandedHints.has(item.id) && (
                    <div className="px-3 pb-2 ml-5">
                      <p className="text-[11px] text-amber-400 bg-amber-500/5 rounded px-2 py-1.5 leading-relaxed">
                        {item.fixHint}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
