export type RoleFilter = 'all' | 'user' | 'assistant'

interface TranscriptToolbarProps {
  q: string
  setQ: (s: string) => void
  role: RoleFilter
  setRole: (r: RoleFilter) => void
  errorsOnly: boolean
  setErrorsOnly: (b: boolean) => void
  eventsOnly: boolean
  setEventsOnly: (b: boolean) => void
  stepsExpanded: boolean
  onToggleSteps: () => void
  onJumpTop: () => void
  onJumpBottom: () => void
  onPrevPrompt: () => void
  onNextPrompt: () => void
  promptPos: string
}

const base =
  'text-[11px] px-2 py-0.5 rounded-md border border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] hover:border-[var(--c-text-3)]/50 transition-colors whitespace-nowrap'
const on =
  'text-[11px] px-2 py-0.5 rounded-md border border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 text-[var(--c-accent)] transition-colors whitespace-nowrap'

export default function TranscriptToolbar(p: TranscriptToolbarProps) {
  return (
    <div className="sticky top-0 z-10 bg-[var(--c-bg)] border-b border-[var(--c-border)] px-3 py-1.5 flex items-center gap-1.5 flex-wrap">
      <input
        value={p.q}
        onChange={e => p.setQ(e.target.value)}
        placeholder="Filter turns…"
        className="text-[11px] px-2 py-1 rounded-md border border-[var(--c-border)] bg-[var(--c-input)] text-[var(--c-text)] outline-none focus:border-[var(--c-accent)]/50 min-w-[130px]"
      />
      <select
        value={p.role}
        onChange={e => p.setRole(e.target.value as RoleFilter)}
        aria-label="Filter by role"
        className="text-[11px] px-1.5 py-1 rounded-md border border-[var(--c-border)] bg-[var(--c-input)] text-[var(--c-text-2)] outline-none focus:border-[var(--c-accent)]/50"
      >
        <option value="all">All roles</option>
        <option value="user">You only</option>
        <option value="assistant">Claude only</option>
      </select>
      <button className={p.errorsOnly ? on : base} onClick={() => p.setErrorsOnly(!p.errorsOnly)} title="Only turns with a failed step">
        ⚠ errors
      </button>
      <button className={p.eventsOnly ? on : base} onClick={() => p.setEventsOnly(!p.eventsOnly)} title="Only turns with a skill or MCP call">
        ◆ events
      </button>
      <span className="w-px h-4 bg-[var(--c-border)]" />
      <button
        className={base}
        onClick={p.onToggleSteps}
        title={p.stepsExpanded ? 'Collapse every work block' : 'Expand every work block'}
      >
        {p.stepsExpanded ? 'collapse steps' : 'expand steps'}
      </button>

      <span className="flex-1" />

      <button className={`${base} font-mono`} onClick={p.onPrevPrompt} aria-label="Previous prompt">◀</button>
      <span className="text-[11px] text-[var(--c-text-3)] tabular-nums w-12 text-center">{p.promptPos}</span>
      <button className={`${base} font-mono`} onClick={p.onNextPrompt} aria-label="Next prompt">▶</button>
      <button className={`${base} font-mono`} onClick={p.onJumpTop} title="Jump to top (g)">⤒</button>
      <button className={`${base} font-mono`} onClick={p.onJumpBottom} title="Jump to bottom (G)">⤓</button>
    </div>
  )
}
