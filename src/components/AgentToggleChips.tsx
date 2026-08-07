import { agentColor } from '../constants/agentColors'

export interface ToggleChipItem {
  toolId: string
  active: boolean
}

interface Props {
  items: ToggleChipItem[]
  itemName: string
  /** Currently in-flight tool id, disables that chip and shows a spinner. */
  togglingId?: string | null
  onToggle: (toolId: string) => void
}

function MiniSpinner() {
  return (
    <svg className="w-2.5 h-2.5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

/** One clickable chip per agent a skill/MCP is installed on — solid when active, dim + struck through when off. */
export default function AgentToggleChips({ items, itemName, togglingId, onToggle }: Props) {
  return (
    <span className="flex gap-1 flex-wrap justify-end">
      {items.map(item => {
        const colors = agentColor(item.toolId)
        const busy = togglingId === item.toolId
        return (
          <button
            key={item.toolId}
            type="button"
            onClick={e => {
              e.stopPropagation()
              onToggle(item.toolId)
            }}
            disabled={busy}
            aria-label={`${item.active ? 'Disable' : 'Enable'} ${itemName} for ${colors.label}`}
            className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-md transition-colors disabled:opacity-50 ${
              item.active
                ? `${colors.bg} ${colors.text}`
                : 'bg-[var(--c-surface-2)] text-[var(--c-text-3)] line-through decoration-[var(--c-text-3)] hover:text-[var(--c-text-2)]'
            }`}
          >
            {busy && <MiniSpinner />}
            {colors.label}
          </button>
        )
      })}
    </span>
  )
}
