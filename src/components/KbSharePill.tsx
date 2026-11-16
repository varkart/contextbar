import { shareAudience, shareExplain, type KbItem } from '../kb'
import type { Agent } from '../types'

/**
 * Share switch that says who gets the item: "Share with agents" when
 * private; "Claude +1" style when shared; a warning when shared but no agent
 * has the context-bar skill. The tooltip explains where and why.
 */
export default function KbSharePill({ item, agents, onToggle, compact }: {
  item: KbItem
  agents: Agent[]
  onToggle: (item: KbItem) => void
  compact?: boolean
}) {
  const { readers } = shareAudience(item, agents)
  const size = compact ? 'text-[10px] px-1.5 py-px' : 'text-[11px] px-2 py-0.5'
  let label: string
  let tone: string
  if (!item.shared) {
    label = compact ? 'Share' : 'Share with agents'
    tone = 'border-[var(--c-border)] text-[var(--c-text-3)] opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-[var(--c-text-2)]'
  } else if (readers.length === 0) {
    label = 'Shared · no agent yet'
    tone = 'border-amber-500/40 bg-amber-500/10 text-amber-400'
  } else {
    label = `For ${readers[0].name}${readers.length > 1 ? ` +${readers.length - 1}` : ''}`
    tone = 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
  }
  return (
    <button
      onClick={() => onToggle(item)}
      aria-pressed={item.shared}
      aria-label={item.shared ? 'Shared with agents' : 'Share with agents'}
      title={shareExplain(item, agents)}
      className={`shrink-0 rounded-full border transition-colors whitespace-nowrap ${size} ${tone}`}
    >
      {label}
    </button>
  )
}
