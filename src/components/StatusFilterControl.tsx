export type StatusFilterValue = 'all' | 'active' | 'inactive'

interface Props {
  value: StatusFilterValue
  onChange: (value: StatusFilterValue) => void
  compact?: boolean
}

const OPTIONS: { key: StatusFilterValue; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
]

/** All/Active/Inactive segmented filter — "active" means at least one
 *  agent variant of that skill/MCP is enabled, "inactive" means none are. */
export default function StatusFilterControl({ value, onChange, compact }: Props) {
  return (
    <div data-testid="status-filter" className="inline-flex bg-[var(--c-surface-2)] rounded-md p-0.5 gap-0.5 flex-shrink-0">
      {OPTIONS.map(o => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`font-semibold rounded-[5px] transition-colors ${compact ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-1'} ${
            value === o.key
              ? 'bg-[var(--c-surface)] text-[var(--c-text)] shadow-sm'
              : 'text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
