import { KB_SORT_LABELS, type KbItem, type KbQuery, type KbShareFilter, type KbSort } from '../kb'

/**
 * Search + share/tag filter + sort for a todo or note list, with a bulk
 * share action over everything the filter matches (not just the page shown).
 */
export default function KbFilterBar({ query, setQuery, tags, sorts, matched, total, onBulkShare, compact }: {
  query: KbQuery
  setQuery: (p: Partial<KbQuery>) => void
  tags: string[]
  sorts: KbSort[]
  /** Items matching the current filter. */
  matched: KbItem[]
  total: number
  onBulkShare: (items: KbItem[], shared: boolean) => void
  compact?: boolean
}) {
  const text = compact ? 'text-[11px]' : 'text-[12px]'
  const select = `${text} bg-[var(--c-surface)] border border-[var(--c-border)] rounded-md px-1.5 py-0.5 outline-none focus:border-[var(--c-accent)] text-[var(--c-text-2)]`
  const unshared = matched.filter(i => !i.shared)
  const filtered = !!(query.q.trim() || query.share !== 'all' || query.tag)
  const scope = filtered ? 'shown' : ''

  return (
    <div className={`flex flex-col ${compact ? 'gap-1 mb-1.5' : 'gap-1.5 mb-3'}`}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="relative flex-1 min-w-[110px]">
          <input
            value={query.q}
            onChange={e => setQuery({ q: e.target.value })}
            onKeyDown={e => { if (e.key === 'Escape' && query.q) { e.preventDefault(); setQuery({ q: '' }) } }}
            placeholder="Search"
            aria-label="Search"
            className={`w-full ${text} bg-[var(--c-surface)] border border-[var(--c-border)] rounded-md pl-2 pr-5 py-0.5 outline-none focus:border-[var(--c-accent)]`}
          />
          {query.q && (
            <button onClick={() => setQuery({ q: '' })} aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--c-text-3)] hover:text-[var(--c-text)]">✕</button>
          )}
        </span>
        <select aria-label="Filter by sharing" value={query.share} onChange={e => setQuery({ share: e.target.value as KbShareFilter })} className={select}>
          <option value="all">All</option>
          <option value="shared">Shared</option>
          <option value="private">Private</option>
        </select>
        {tags.length > 0 && (
          <select aria-label="Filter by tag" value={query.tag} onChange={e => setQuery({ tag: e.target.value })} className={select}>
            <option value="">Any tag</option>
            {tags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <select aria-label="Sort" value={query.sort} onChange={e => setQuery({ sort: e.target.value as KbSort })} className={select}>
          {sorts.map(s => <option key={s} value={s}>{KB_SORT_LABELS[s]}</option>)}
        </select>
      </div>
      <div className={`flex items-center gap-2 ${compact ? 'text-[10.5px]' : 'text-[11.5px]'} text-[var(--c-text-3)]`}>
        <span className="tabular-nums">{filtered ? `${matched.length} of ${total}` : `${total} total`}</span>
        {filtered && (
          <button onClick={() => setQuery({ q: '', share: 'all', tag: '' })} className="hover:text-[var(--c-text-2)] hover:underline">Clear filters</button>
        )}
        {matched.length > 0 && (
          <span className="ml-auto flex items-center gap-2">
            {unshared.length > 0 ? (
              <button
                onClick={() => onBulkShare(unshared, true)}
                title="Agents read shared items through the context-bar skill"
                className="text-emerald-400 hover:underline"
              >
                Share all{scope && ` ${scope}`} ({unshared.length})
              </button>
            ) : (
              <button onClick={() => onBulkShare(matched, false)} className="hover:text-[var(--c-text-2)] hover:underline">
                Make all{scope && ` ${scope}`} private ({matched.length})
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
