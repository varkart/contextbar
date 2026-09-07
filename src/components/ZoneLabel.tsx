/** Tiny caption that marks a control group as either "narrows what you see"
 *  (Filter) or "changes state" (Actions). Paired with a faint tinted band for
 *  filters and an amber left rail for actions in the Skills / MCP list views. */
export default function ZoneLabel({ kind }: { kind: 'filter' | 'actions' }) {
  const filter = kind === 'filter'
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.09em] ${
        filter ? 'text-[var(--c-text-3)]/80' : 'text-amber-500/85'
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-3 h-3"
        aria-hidden="true"
      >
        {filter ? (
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        ) : (
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        )}
      </svg>
      {filter ? 'Filter' : 'Actions'}
    </span>
  )
}
