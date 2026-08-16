import type { EnabledSortMode } from '../hooks/useEnabledSort'

/** "Name" column header that doubles as a sort-mode toggle, shared by the
 *  Skills and MCPs list views. */
export default function SortToggleButton({ sortMode, onToggle, compact }: {
  sortMode: EnabledSortMode
  onToggle: () => void
  compact?: boolean
}) {
  return (
    <button
      onClick={onToggle}
      title={sortMode === 'name' ? 'Sorted by name — click to sort by enabled status' : 'Sorted by enabled status — click to sort by name'}
      className={`flex-1 flex items-center gap-1 font-semibold uppercase tracking-wider text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors ${compact ? 'text-[9.5px]' : 'text-[11px]'}`}
    >
      {sortMode === 'name' ? 'Name' : 'Enabled first'}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        className="w-2.5 h-2.5 flex-shrink-0">
        <polyline points="8 9 12 5 16 9"/><polyline points="16 15 12 19 8 15"/>
      </svg>
    </button>
  )
}
