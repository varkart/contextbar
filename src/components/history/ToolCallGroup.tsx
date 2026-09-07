import { useEffect, useState } from 'react'
import type { ContentBlock } from '../../types'
import ToolCallBlock from './ToolCallBlock'
import { FIND_QUERY_EVENT } from '../FindInPage'

interface ToolCallGroupProps {
  blocks: ContentBlock[]
}

/** Collapsed-by-default summary for a run of 3+ sequential tool calls —
 *  common in Codex/agy transcripts, which push one message per tool step
 *  instead of batching them into one turn like Claude does. */
export default function ToolCallGroup({ blocks }: ToolCallGroupProps) {
  const [open, setOpen] = useState(false)
  const errorCount = blocks.filter(b => b.isError).length

  // Collapsed content is invisible to find-on-page (it isn't in the DOM
  // until opened) even though the data is already loaded — so open up
  // whenever the live search query matches something we're hiding.
  useEffect(() => {
    const handler = (e: Event) => {
      const query = (e as CustomEvent<string>).detail.trim().toLowerCase()
      if (!query || open) return
      const haystack = blocks
        .map(b => [b.toolName, b.text, b.toolInput, b.toolResult].filter(Boolean).join(' '))
        .join(' ')
        .toLowerCase()
      if (haystack.includes(query)) setOpen(true)
    }
    window.addEventListener(FIND_QUERY_EVENT, handler)
    return () => window.removeEventListener(FIND_QUERY_EVENT, handler)
  }, [blocks, open])

  const counts = new Map<string, number>()
  for (const b of blocks) {
    const name = b.toolName ?? 'tool'
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const preview = [...counts.entries()]
    .map(([name, n]) => (n > 1 ? `${name} ×${n}` : name))
    .join(', ')

  return (
    <div className="my-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface-2)]/60 hover:bg-[var(--c-surface-2)] transition-colors text-left"
      >
        <span className={`text-[9px] text-[var(--c-text-3)] transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`} aria-hidden="true">▶</span>
        <span className="text-[11px] font-medium text-[var(--c-text-2)] flex-shrink-0">
          {blocks.length} tool calls
        </span>
        {errorCount > 0 && (
          <span className="text-[9px] font-mono px-1.5 py-px rounded-full bg-rose-500/15 text-rose-400 flex-shrink-0">
            {errorCount} error{errorCount === 1 ? '' : 's'}
          </span>
        )}
        {!open && (
          <span className="text-[10.5px] text-[var(--c-text-3)] truncate">{preview}</span>
        )}
      </button>
      {open && (
        <div className="mt-1 pl-1 border-l-2 border-[var(--c-border)] ml-2">
          {blocks.map((block, i) => (
            <div key={i} className="pl-2">
              <ToolCallBlock block={block} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
