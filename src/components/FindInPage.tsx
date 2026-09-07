import { useEffect, useRef, useState } from 'react'

/** Dispatched with the live query string whenever the find bar's text
 *  changes (never for an empty query). Any component with content that's
 *  collapsed by default (e.g. the transcript's WorkGroup) should listen for this and
 *  open itself when its own text contains the query — otherwise a match
 *  that only exists in already-loaded data, but isn't in the DOM yet, can
 *  never be found or highlighted. */
export const FIND_QUERY_EVENT = 'contextbar:find-query'

const HIGHLIGHT_ALL = 'contextbar-find-match'
const HIGHLIGHT_CURRENT = 'contextbar-find-current'

/** Search input is debounced by this much before a query re-triggers the
 *  expand-and-search pass — typing several keystrokes in quick succession
 *  should only pay for one walk of the DOM, not one per keystroke. */
const DEBOUNCE_MS = 150

/** Hard cap on how many matches we'll collect/highlight. A short, common
 *  query (a single letter) can otherwise match hundreds of times even
 *  within one transcript, and building/registering that many Ranges is
 *  real work — better to say "500+ matches, narrow your search" than to
 *  make every keystroke expensive. */
const MAX_MATCHES = 500

/** True when the CSS Custom Highlight API is available — it lets us mark
 *  arbitrary text ranges as "highlighted" purely via CSS, without touching
 *  the DOM nodes themselves. That matters here specifically because the
 *  matched text lives inside React-rendered trees: wrapping it in <mark>
 *  elements the usual find-in-page way would edit nodes behind React's
 *  back and risk breaking on the next re-render. Ranges are just pointers
 *  into existing text nodes, so React never notices them. */
function highlightApiAvailable(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined'
}

function isVisible(el: Element): boolean {
  const style = window.getComputedStyle(el)
  return style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0
}

/** Every occurrence of `query` (case-insensitive) in the visible text of
 *  `root`, as Ranges into the live DOM — not copies, so scrolling one into
 *  view or restyling it via the Highlight API affects the real page.
 *  Stops early past MAX_MATCHES. */
function findMatches(root: Element, query: string): Range[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const ranges: Range[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement
      if (!parent || !isVisible(parent)) return NodeFilter.FILTER_REJECT
      if (parent.closest('[data-find-ignore]')) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  let node: Node | null
  outer: while ((node = walker.nextNode())) {
    const text = node.textContent ?? ''
    const lower = text.toLowerCase()
    let idx = 0
    while ((idx = lower.indexOf(q, idx)) !== -1) {
      const range = document.createRange()
      range.setStart(node, idx)
      range.setEnd(node, idx + q.length)
      ranges.push(range)
      idx += q.length
      if (ranges.length >= MAX_MATCHES) break outer
    }
  }
  return ranges
}

function clearHighlights() {
  if (!highlightApiAvailable()) return
  CSS.highlights.delete(HIGHLIGHT_ALL)
  CSS.highlights.delete(HIGHLIGHT_CURRENT)
}

interface FindInPageProps {
  open: boolean
  onClose: () => void
  /** Element to search within — deliberately scoped (e.g. one session's
   *  transcript container), not the whole page. Searching an entire
   *  list-heavy view (a page full of session rows, repo cards, etc.) makes
   *  a short query match hundreds/thousands of unrelated snippets, which is
   *  both useless and slow. */
  container: HTMLElement | null
}

/** Find-in-page overlay scoped to a single container element (typically one
 *  open session's transcript). Collapsible sections within that container
 *  (like a run of tool calls) broadcast FIND_QUERY_EVENT to themselves first
 *  and open if they match, so "currently rendered" ends up covering
 *  everything already loaded for this session, not just what happens to be
 *  expanded when you start typing. */
export default function FindInPage({ open, onClose, container }: FindInPageProps) {
  const [query, setQuery] = useState('')
  const [ranges, setRanges] = useState<Range[]>([])
  const [matchIndex, setMatchIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.select())
    } else {
      setQuery('')
      setRanges([])
      setMatchIndex(-1)
      clearHighlights()
    }
  }, [open])

  // Escape should close the bar even if focus hasn't landed on the input
  // yet (it's moved there async, via rAF, right after `open` flips true) —
  // relying solely on the input's own onKeyDown would miss that window.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Debounce, then let collapsed content open itself for this query, then
  // search on the next frame once any newly-opened content has painted. A
  // fresh array is always produced here (even when the match count is
  // unchanged), so the highlight effect below — keyed on this array's
  // identity — never misses an update the way keying on just a count would.
  useEffect(() => {
    if (!open || !container) return
    if (!query.trim()) {
      setRanges([])
      setMatchIndex(-1)
      return
    }
    let cancelled = false
    const frames: number[] = []
    const debounce = window.setTimeout(() => {
      // Collapsed content can be nested (a tool-call group must open before
      // its individual calls' input/output — which collapse independently —
      // even exist to receive this event themselves), so one dispatch only
      // reaches the outermost layer. Re-dispatch a few times, one paint
      // apart, so each newly-mounted layer gets its own turn to see the
      // query and expand before we finally search.
      const rounds = 3
      const roundTrip = (n: number) => {
        if (cancelled) return
        window.dispatchEvent(new CustomEvent(FIND_QUERY_EVENT, { detail: query }))
        if (n < rounds) {
          frames.push(requestAnimationFrame(() => roundTrip(n + 1)))
        } else {
          frames.push(requestAnimationFrame(() => {
            if (cancelled || !container) return
            const found = findMatches(container, query)
            setRanges(found)
            setMatchIndex(found.length > 0 ? 0 : -1)
          }))
        }
      }
      roundTrip(1)
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(debounce)
      frames.forEach(cancelAnimationFrame)
    }
  }, [open, query, container])

  // Apply/move the highlight whenever the match set or active index changes.
  useEffect(() => {
    const current = matchIndex >= 0 ? ranges[matchIndex] : undefined
    if (!highlightApiAvailable()) {
      current?.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }
    if (ranges.length === 0) {
      clearHighlights()
      return
    }
    CSS.highlights.set(HIGHLIGHT_ALL, new Highlight(...ranges))
    if (current) {
      CSS.highlights.set(HIGHLIGHT_CURRENT, new Highlight(current))
      current.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    } else {
      CSS.highlights.delete(HIGHLIGHT_CURRENT)
    }
  }, [ranges, matchIndex])

  // Belt-and-suspenders: always clear highlights on unmount, even if `open`
  // never transitioned back to false first (e.g. the session view closes
  // out from under the bar).
  useEffect(() => () => clearHighlights(), [])

  const step = (delta: number) => {
    if (ranges.length === 0) return
    setMatchIndex(i => ((i < 0 ? 0 : i) + delta + ranges.length) % ranges.length)
  }

  if (!open) return null

  return (
    <div
      data-find-ignore
      className="fixed top-3 right-3 z-50 flex items-center gap-1 bg-[var(--c-surface)] border border-[var(--c-border)] rounded-xl shadow-lg px-2 py-1.5"
    >
      <input
        ref={inputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => {
          // Escape is handled window-wide above (focus can land here async);
          // Enter only makes sense while this input itself is focused.
          if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1) }
        }}
        placeholder="Find in session"
        className="w-40 bg-transparent outline-none text-[13px] text-[var(--c-text)] placeholder:text-[var(--c-text-3)] px-1"
      />
      <span className="text-[11px] text-[var(--c-text-3)] tabular-nums w-16 text-center shrink-0">
        {!query.trim() ? '' : ranges.length === 0 ? 'No results' : `${matchIndex + 1}/${ranges.length}${ranges.length >= MAX_MATCHES ? '+' : ''}`}
      </span>
      <button
        onClick={() => step(-1)}
        disabled={ranges.length === 0}
        aria-label="Previous match"
        className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--c-text-3)] hover:text-[var(--c-text)] hover:bg-[var(--c-surface-2)] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
      >
        ↑
      </button>
      <button
        onClick={() => step(1)}
        disabled={ranges.length === 0}
        aria-label="Next match"
        className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--c-text-3)] hover:text-[var(--c-text)] hover:bg-[var(--c-surface-2)] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
      >
        ↓
      </button>
      <button
        onClick={onClose}
        aria-label="Close find"
        className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--c-text-3)] hover:text-[var(--c-text)] hover:bg-[var(--c-surface-2)] transition-colors"
      >
        ×
      </button>
    </div>
  )
}
