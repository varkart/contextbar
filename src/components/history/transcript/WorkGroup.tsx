import { useEffect, useState } from 'react'
import type { Step } from './model'
import { previewSteps } from './model'
import { FIND_QUERY_EVENT } from '../../FindInPage'

/** A folded run of routine tool steps: `⚒ N steps` with a one-line preview,
 *  expandable to the individual calls and their output. */
export default function WorkGroup({ steps }: { steps: Step[] }) {
  const [open, setOpen] = useState(false)
  const errs = steps.filter(s => s.isError).length

  // Collapsed content isn't in the DOM, so find-in-page can't reach it —
  // open up when the live query matches something we're hiding.
  useEffect(() => {
    const handler = (e: Event) => {
      const q = (e as CustomEvent<string>).detail.trim().toLowerCase()
      if (!q || open) return
      const hay = steps.flatMap(s => [s.name, s.input, s.output]).filter(Boolean).join(' ').toLowerCase()
      if (hay.includes(q)) setOpen(true)
    }
    window.addEventListener(FIND_QUERY_EVENT, handler)
    return () => window.removeEventListener(FIND_QUERY_EVENT, handler)
  }, [steps, open])

  return (
    <details open={open} onToggle={e => setOpen((e.target as HTMLDetailsElement).open)} className="work mt-1.5">
      <summary className="flex items-center gap-2 flex-wrap cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <span className="font-mono text-[8.5px] font-bold tracking-wide px-1.5 py-px rounded bg-amber-500/15 text-amber-400">
          ⚒ {steps.length} step{steps.length > 1 ? 's' : ''}
        </span>
        <span className="font-mono text-[10px] text-[var(--c-text-3)] opacity-80 min-w-0 truncate">
          {previewSteps(steps)}
        </span>
        {errs > 0 && (
          <span className="font-mono text-[9px] text-rose-400">{errs} err</span>
        )}
        <span className="text-[9px] text-[var(--c-text-3)]">{open ? '▴' : '▾'}</span>
      </summary>
      <div className="mt-1 ml-[3px] pl-3 border-l-2 border-[var(--c-border)]">
        {steps.map((s, i) => (
          <div key={i} className="mt-1">
            <div className={`font-mono text-[10.5px] ${s.isError ? 'text-rose-400' : 'text-[var(--c-text-2)]'}`}>
              {s.name === 'Bash'
                ? <>$ {s.input}</>
                : <>▸ {s.name} <span className="text-[var(--c-text-3)]">{s.input}</span></>}
            </div>
            {s.output && (
              <div className={`font-mono text-[10px] pl-3 whitespace-pre-wrap break-all ${s.isError ? 'text-rose-400' : 'text-[var(--c-text-3)] opacity-80'}`}>
                {s.output}
              </div>
            )}
          </div>
        ))}
      </div>
    </details>
  )
}
