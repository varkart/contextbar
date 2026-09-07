import { forwardRef, useEffect, useState } from 'react'
import Markdown from '../../Markdown'
import type { TranscriptTurn } from './model'
import { previewLine } from './model'
import WorkGroup from './WorkGroup'
import EventCard from './EventCard'
import { FIND_QUERY_EVENT } from '../../FindInPage'

interface TurnRowProps {
  turn: TranscriptTurn
  isLast: boolean
  hidden: boolean
}

function timeLabel(ts?: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** One transcript turn: screenplay role gutter + hairline spine + body.
 *  `hidden` (from the toolbar filters) keeps the node in the DOM — the
 *  prompt-jump nav still needs its offset — but out of view.
 *  A chevron folds the turn down to its first line so a long conversation
 *  can be skimmed with only the interesting turns expanded. */
const TurnRow = forwardRef<HTMLDivElement, TurnRowProps>(function TurnRow(
  { turn, isLast, hidden }, ref,
) {
  const user = turn.role === 'user'
  const [collapsed, setCollapsed] = useState(false)

  // Collapsed body isn't in the DOM — reopen it when find-in-page has a
  // query that matches this turn's content.
  useEffect(() => {
    const handler = (e: Event) => {
      if (!collapsed) return
      const q = (e as CustomEvent<string>).detail.trim().toLowerCase()
      if (q && turn.haystack.includes(q)) setCollapsed(false)
    }
    window.addEventListener(FIND_QUERY_EVENT, handler)
    return () => window.removeEventListener(FIND_QUERY_EVENT, handler)
  }, [collapsed, turn.haystack])

  return (
    <div
      ref={ref}
      data-turn
      data-role={turn.role}
      className={`turn border-t border-[var(--c-border-sub)] ${hidden ? 'hidden' : ''}`}
    >
      <div className="flex gap-3 px-5 py-2.5">
        <button
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? 'Expand turn' : 'Collapse turn'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand turn' : 'Collapse turn'}
          className={`w-14 shrink-0 text-left text-[9px] font-bold tracking-wide pt-0.5 group/turn ${user ? 'text-[var(--c-accent)]' : 'text-[var(--c-text-3)]'}`}
        >
          <span className="flex items-center gap-1">
            <span className={`inline-block text-[7px] leading-none text-[var(--c-text-3)] group-hover/turn:text-[var(--c-text-2)] transition-transform ${collapsed ? '' : 'rotate-90'}`}>▶</span>
            {user ? 'YOU' : 'CLAUDE'}
          </span>
          <span className="block font-normal text-[var(--c-text-3)] mt-0.5 pl-[10px]">{timeLabel(turn.time)}</span>
        </button>

        <div className="relative w-2.5 shrink-0">
          <div
            className="absolute left-1 top-[-10px] w-px bg-[var(--c-border)]"
            style={{ bottom: isLast ? '8px' : '-10px' }}
          />
          <div className={`absolute left-[1px] top-1 w-[7px] h-[7px] rounded-full ${user ? 'bg-[var(--c-accent)]' : 'bg-[var(--c-text-3)]'}`} />
        </div>

        <div className="flex-1 min-w-0">
          {collapsed ? (
            <button
              onClick={() => setCollapsed(false)}
              className="w-full text-left text-[12px] text-[var(--c-text-3)] truncate hover:text-[var(--c-text-2)] transition-colors"
              title="Expand turn"
            >
              {previewLine(turn)}
            </button>
          ) : (
            <>
              {turn.text && <Markdown>{turn.text}</Markdown>}
              {turn.segments.map((seg, i) =>
                seg.type === 'event'
                  ? <EventCard key={i} step={seg.step} />
                  : <WorkGroup key={i} steps={seg.steps} />,
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
})

export default TurnRow
