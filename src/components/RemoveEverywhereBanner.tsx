interface Props {
  /** 'skill' | 'MCP' — singular, used in the warning copy. */
  noun: string
  name: string
  /** Every agent this item is currently installed on. */
  agentNames: string[]
  running: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

/** Warning + confirm step for permanently removing a skill/MCP from every
 *  agent it's installed on and deleting its file(s) from disk — shown
 *  wherever that action is triggered (list row or detail page), so the
 *  wording and behavior are identical regardless of entry point. */
export default function RemoveEverywhereBanner({ noun, name, agentNames, running, error, onConfirm, onCancel }: Props) {
  const agentList = agentNames.join(', ')
  const scope = agentNames.length <= 1
    ? agentList || 'the agent it\'s on'
    : `all ${agentNames.length} agents it's on (${agentList})`

  return (
    <div className="p-3 rounded-lg bg-rose-500/8 border border-rose-500/25 space-y-2">
      <p className="text-[12px] text-rose-400 leading-relaxed">
        <span className="font-semibold">Remove completely?</span> This disables and permanently removes the {noun}{' '}
        <span className="font-mono">{name}</span> from {scope}, and deletes {agentNames.length === 1 ? 'its file' : 'its files'} from
        your machine. This can't be undone.
      </p>
      {error && <p className="text-[11px] text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={running}
          className="flex-1 py-1.5 rounded text-[12px] font-medium bg-[var(--c-surface)] border border-[var(--c-border)] text-[var(--c-text-2)] hover:bg-[var(--c-hover)] transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={running}
          className="flex-1 py-1.5 rounded text-[12px] font-semibold bg-rose-500 text-white hover:bg-rose-600 transition-colors disabled:opacity-50"
        >
          {running ? 'Removing…' : 'Remove completely'}
        </button>
      </div>
    </div>
  )
}
