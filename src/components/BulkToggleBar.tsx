import { useState } from 'react'

export type BulkMode = 'enable' | 'disable'

export interface BulkDescribe {
  changeCount: number
  changedAgentIds: string[]
  untouchedAgentIds: string[]
  /** Set when changeCount === 1, for nicer toast copy ("Enabled xlsx for Claude Code"). */
  singleName?: string
}

interface Props {
  /** 'skill' | 'MCP' — singular, pluralized internally. */
  noun: string
  agentName: (toolId: string) => string
  describeBulk: (mode: BulkMode) => BulkDescribe
  /** Performs the writes + refresh, then returns the pre-mutation description for the toast. */
  applyBulk: (mode: BulkMode) => Promise<BulkDescribe>
}

function agentLabels(ids: string[], agentName: (id: string) => string): string {
  return ids.map(agentName).join(', ')
}

function ConfirmMessage({ noun, mode, desc, agentName }: { noun: string; mode: BulkMode; desc: BulkDescribe; agentName: (id: string) => string }) {
  if (desc.changeCount === 0) {
    return <>Every {noun} is already {mode === 'enable' ? 'on' : 'off'} for every agent that has one configured — nothing to {mode}.</>
  }
  const verb = mode === 'enable' ? 'Turn on' : 'Turn off'
  const fromState = mode === 'enable' ? 'off' : 'on'
  const changedLabel = agentLabels(desc.changedAgentIds, agentName)
  const untouchedLabel = agentLabels(desc.untouchedAgentIds, agentName)
  return (
    <>
      {verb} every {noun} that's currently {fromState}, for every agent it's installed on — <b>{desc.changeCount} {noun}{desc.changeCount === 1 ? '' : 's'}</b> will change {desc.changedAgentIds.length === 1 ? 'for' : 'across'} <b>{changedLabel}</b>.
      {desc.untouchedAgentIds.length > 0 && <> {untouchedLabel} already {desc.untouchedAgentIds.length === 1 ? 'has' : 'have'} everything {mode === 'enable' ? 'on' : 'off'}.</>}
    </>
  )
}

function ToastMessage({ noun, mode, desc, agentName }: { noun: string; mode: BulkMode; desc: BulkDescribe; agentName: (id: string) => string }) {
  const verbPast = mode === 'enable' ? 'Enabled' : 'Disabled'
  const changedLabel = agentLabels(desc.changedAgentIds, agentName)
  const untouchedLabel = agentLabels(desc.untouchedAgentIds, agentName)
  return (
    <>
      {desc.changeCount === 0 ? (
        <>Nothing to {mode} — already up to date.</>
      ) : desc.changeCount === 1 && desc.singleName ? (
        <>{verbPast} <b>{desc.singleName}</b> for <b>{changedLabel}</b></>
      ) : (
        <>{verbPast} <b>{desc.changeCount} {noun}{desc.changeCount === 1 ? '' : 's'}</b> across <b>{changedLabel}</b></>
      )}
      {desc.untouchedAgentIds.length > 0
        ? <> — {untouchedLabel} already had everything {mode === 'enable' ? 'on' : 'off'}.</>
        : desc.changeCount > 0 && '.'}
    </>
  )
}

/** Page-level "Enable all / Disable all" toolbar with a confirm step and a result toast, shared by the Skills and MCPs list pages. */
export default function BulkToggleBar({ noun, agentName, describeBulk, applyBulk }: Props) {
  const [confirmMode, setConfirmMode] = useState<BulkMode | null>(null)
  const [running, setRunning] = useState(false)
  const [toast, setToast] = useState<{ mode: BulkMode; desc: BulkDescribe } | null>(null)

  const desc = confirmMode ? describeBulk(confirmMode) : null

  const handleApply = async () => {
    if (!confirmMode) return
    const mode = confirmMode
    setConfirmMode(null)
    setRunning(true)
    const result = await applyBulk(mode)
    setRunning(false)
    setToast({ mode, desc: result })
  }

  return (
    <div className="px-3 pt-2 flex-shrink-0">
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[var(--c-surface)] border border-[var(--c-border-sub)]">
        <span className="text-[11px] text-[var(--c-text-3)] mr-0.5">Bulk, across all agents:</span>
        <button
          onClick={() => setConfirmMode('enable')}
          disabled={running}
          className="text-[11.5px] font-medium px-2.5 py-1 rounded-md border border-[var(--c-border)] text-[var(--c-text-2)] hover:border-emerald-500/50 hover:text-emerald-500 transition-colors disabled:opacity-50"
        >
          Enable all
        </button>
        <button
          onClick={() => setConfirmMode('disable')}
          disabled={running}
          className="text-[11.5px] font-medium px-2.5 py-1 rounded-md border border-[var(--c-border)] text-[var(--c-text-2)] hover:border-rose-500/50 hover:text-rose-500 transition-colors disabled:opacity-50"
        >
          Disable all
        </button>
      </div>

      {confirmMode && desc && (
        <div
          className={`mt-2 flex items-center gap-3 px-3 py-2 rounded-md text-[12px] leading-relaxed [&_b]:text-[var(--c-text)] [&_b]:font-semibold ${
            confirmMode === 'enable'
              ? 'bg-emerald-500/8 border border-emerald-500/25 text-[var(--c-text-2)]'
              : 'bg-rose-500/8 border border-rose-500/25 text-[var(--c-text-2)]'
          }`}
        >
          <p className="flex-1 min-w-0 m-0">
            <ConfirmMessage noun={noun} mode={confirmMode} desc={desc} agentName={agentName} />
          </p>
          <div className="flex gap-1.5 flex-shrink-0">
            <button
              onClick={() => setConfirmMode(null)}
              className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-[var(--c-surface-2)] text-[var(--c-text-2)] hover:opacity-80 transition-opacity"
            >
              {desc.changeCount === 0 ? 'Dismiss' : 'Cancel'}
            </button>
            {desc.changeCount > 0 && (
              <button
                onClick={handleApply}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-md text-white transition-opacity hover:opacity-90 ${
                  confirmMode === 'enable' ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              >
                {confirmMode === 'enable' ? 'Enable all' : 'Disable all'}
              </button>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 max-w-sm bg-[var(--c-bg)] border border-[var(--c-border)] rounded-lg px-3 py-2.5 text-[11.5px] shadow-xl">
          <span className="text-emerald-500 font-bold flex-shrink-0">✓</span>
          <span className="flex-1 text-[var(--c-text-2)] leading-relaxed [&_b]:text-[var(--c-text)] [&_b]:font-semibold">
            <ToastMessage noun={noun} mode={toast.mode} desc={toast.desc} agentName={agentName} />
          </span>
          <button onClick={() => setToast(null)} aria-label="Dismiss" className="text-[var(--c-text-3)] hover:text-[var(--c-text-2)] flex-shrink-0">✕</button>
        </div>
      )}
    </div>
  )
}
