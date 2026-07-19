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
      <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-px" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    )
  }
  if (status === 'warn') {
    return (
      <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-px" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    )
  }
  return (
    <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-px" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function DoctorItemRow({ item }: { item: DoctorItem }) {
  const hasIssue = item.status !== 'ok'
  return (
    <div className="bg-[var(--c-surface-1)] px-3 py-2.5">
      <div className="flex items-start gap-2">
        <StatusIcon status={item.status} />
        <div className="flex-1 min-w-0">
          <span className={`text-[12px] font-medium ${hasIssue ? 'text-[var(--c-text-1)]' : 'text-[var(--c-text-2)]'}`}>
            {item.label}
          </span>
          {item.detail && (
            <p className="text-[11px] text-[var(--c-text-3)] mt-0.5 truncate">{item.detail}</p>
          )}
          {hasIssue && item.fixHint && (
            <p className={`text-[11px] mt-1.5 leading-relaxed px-2 py-1.5 rounded ${
              item.status === 'error'
                ? 'bg-red-500/10 text-red-400'
                : 'bg-amber-500/10 text-[var(--c-text-2)]'
            }`}>
              <span className="font-medium">Fix: </span>{item.fixHint}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function ScoreRing({ passed, total, hasErrors }: { passed: number; total: number; hasErrors: boolean }) {
  const score = total === 0 ? 100 : Math.round((passed / total) * 100)
  const color = score === 100 ? '#34d399' : hasErrors ? '#f87171' : '#fbbf24'
  const circumference = 2 * Math.PI * 15.5
  return (
    <div className="relative w-[96px] h-[96px]">
      <svg viewBox="0 0 36 36" className="w-[96px] h-[96px] -rotate-90">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--c-skeleton)" strokeWidth="3" />
        <circle
          cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[24px] font-bold text-[var(--c-text)] tabular-nums leading-none">{score}</span>
        <span className="text-[8.5px] uppercase tracking-wider text-[var(--c-text-3)] mt-0.5">health</span>
      </div>
    </div>
  )
}

export default function DoctorView({ onBack }: { onBack: () => void }) {
  const [runState, setRunState] = useState<RunState>('idle')
  const [sections, setSections] = useState<DoctorSection[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showAllMcps, setShowAllMcps] = useState(false)
  const [showAllChecks, setShowAllChecks] = useState(false)

  const runDoctor = useCallback(async () => {
    setRunState('running')
    setError(null)
    setSections([])
    setShowAllMcps(false)
    setShowAllChecks(false)
    try {
      const result = await invoke<DoctorSection[]>('run_doctor')
      setSections(result)
      setRunState('done')
    } catch (e) {
      setError(String(e))
      setRunState('idle')
    }
  }, [])

  const allItems = sections.flatMap(s => s.items)
  const issueItemsAll = allItems.filter(i => i.status !== 'ok')
  const issueCount = issueItemsAll.length
  const passedCount = allItems.length - issueCount
  const hasErrors = issueItemsAll.some(i => i.status === 'error')

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
            <div>
              <p className="text-[13px] font-medium text-[var(--c-text-2)]">Environment health check</p>
              <p className="text-[12px] mt-0.5">Shell PATH · required runtimes · active MCP commands</p>
            </div>
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

        {runState === 'done' && (
          <div className="flex flex-col items-center gap-1.5 pt-5 pb-2">
            <ScoreRing passed={passedCount} total={allItems.length} hasErrors={hasErrors} />
            <p className="text-[12px] text-[var(--c-text-2)]">
              {passedCount} of {allItems.length} checks passing
            </p>
          </div>
        )}

        {runState === 'done' && issueItemsAll.length > 0 && (
          <div className="px-3 pt-2 space-y-2">
            {issueItemsAll.map(item => (
              <div
                key={item.id}
                className={`rounded-xl border p-3 ${
                  item.status === 'error'
                    ? 'border-red-500/25 bg-red-500/5'
                    : 'border-amber-500/25 bg-amber-500/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                    item.status === 'error' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'
                  }`}>
                    {item.status === 'error' ? 'error' : 'warning'}
                  </span>
                  <span className="text-[12.5px] font-semibold text-[var(--c-text)] font-mono truncate">{item.label}</span>
                </div>
                {item.detail && (
                  <p className="text-[11px] text-[var(--c-text-2)] mt-1.5 leading-relaxed">{item.detail}</p>
                )}
                {item.fixHint && (
                  <p className="text-[11px] text-[var(--c-text-2)] mt-1.5 leading-relaxed px-2 py-1.5 rounded bg-[var(--c-surface)]">
                    <span className="font-medium text-indigo-400">Fix: </span>{item.fixHint}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {runState === 'done' && (
          <div className="px-3 pt-3 pb-1 text-center">
            <button
              onClick={() => setShowAllChecks(v => !v)}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              {showAllChecks
                ? 'Hide detailed checks'
                : issueCount === 0
                  ? `Everything healthy · show all ${allItems.length} checks`
                  : `Show all ${allItems.length} checks`}
            </button>
          </div>
        )}

        {runState === 'done' && showAllChecks && sections.map(section => {
          const isMcpSection = section.title === 'Active MCPs'
          const issueItems = section.items.filter(i => i.status !== 'ok')
          const displayItems = isMcpSection && !showAllMcps
            ? (issueItems.length > 0 ? issueItems : section.items)
            : section.items
          const hasHiddenOk = isMcpSection && !showAllMcps && issueItems.length > 0 &&
            section.items.length > issueItems.length

          return (
            <div key={section.title}>
              <div className="flex items-center justify-between px-3 pt-4 pb-1 first:pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-3)]">
                  {section.title}
                </p>
                {isMcpSection && section.items.length > 1 && (
                  <button
                    onClick={() => setShowAllMcps(v => !v)}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    {showAllMcps
                      ? 'Show issues only'
                      : `Show all ${section.items.length}`}
                  </button>
                )}
              </div>
              <div className="divide-y divide-[var(--c-border-sub)] mx-2 rounded-lg overflow-hidden border border-[var(--c-border)]">
                {displayItems.map(item => (
                  <DoctorItemRow key={item.id} item={item} />
                ))}
                {hasHiddenOk && (
                  <div className="bg-[var(--c-surface-1)] px-3 py-2 text-[11px] text-[var(--c-text-3)]">
                    {section.items.length - issueItems.length} healthy MCP{section.items.length - issueItems.length > 1 ? 's' : ''} hidden
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {runState === 'done' && <div className="h-4" />}
      </div>
    </div>
  )
}
