import type { Agent } from '../types'
import { KB_SORT_LABELS, agentsWithKbSkill, names, type KbItem, type KbQuery, type KbShareFilter, type KbSort } from '../kb'

/**
 * Search + share/tag filter + sort for a todo or note list, with a bulk
 * share action over everything the filter matches (not just the page shown).
 */
export default function KbFilterBar({ query, setQuery, tags, sorts, matched, total, onBulkShare, compact, agents = [] }: {
  query: KbQuery
  setQuery: (p: Partial<KbQuery>) => void
  tags: string[]
  sorts: KbSort[]
  /** Items matching the current filter. */
  matched: KbItem[]
  total: number
  onBulkShare: (items: KbItem[], shared: boolean) => void
  compact?: boolean
  agents?: Agent[]
}) {
  const readers = agentsWithKbSkill(agents)
  const who = readers.length ? names(readers) : 'your agents (after installing the context-bar skill)'
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
          <option value="shared">Shared with agents</option>
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
                title={`${who} will read ${unshared.length === 1 ? 'it' : 'these'} at the start of each session, so you don't repeat yourself.`}
                className="text-emerald-400 hover:underline"
              >
                Share {unshared.length}{scope && ` ${scope}`} with agents
              </button>
            ) : (
              <button onClick={() => onBulkShare(matched, false)} title="Agents stop seeing these. Only you will." className="hover:text-[var(--c-text-2)] hover:underline">
                Make {matched.length}{scope && ` ${scope}`} private
              </button>
            )}
          </span>
        )}
      </div>
      <p className={`${compact ? 'text-[10.5px]' : 'text-[11.5px]'} text-[var(--c-text-3)] leading-snug`}>
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 align-middle" />
        {readers.length
          ? <>Shared items are read by <b className="font-medium text-[var(--c-text-2)]">{names(readers)}</b> at the start of each session, so you don't repeat yourself.</>
          : <>Shared items are for your agents, but none has the context-bar skill yet. Install it from Notes &amp; Todos in the window.</>}
      </p>
    </div>
  )
}
