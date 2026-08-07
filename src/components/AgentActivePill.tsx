import { useState, useRef, type CSSProperties } from 'react'
import AgentToggleChips, { type ToggleChipItem } from './AgentToggleChips'

interface Props {
  items: ToggleChipItem[]
  itemName: string
  togglingId?: string | null
  onToggle: (toolId: string) => void
}

const WINDOW_PAD = 8
// Grace period before closing on mouse-leave — the flyout is a fixed-position
// sibling below the pill, so it sits outside the pill's own layout box; the
// mouse has to cross that gap, and without a delay onMouseLeave fires the
// instant the cursor exits the (tiny) pill, closing the flyout before it
// ever reaches the chips.
const CLOSE_DELAY_MS = 150

/**
 * Compact "bar-in-pill" active-state summary for the popover, where the
 * Agents column has no room for always-visible chips — hover reveals the
 * same per-agent toggle chips the expanded window shows inline.
 */
export default function AgentActivePill({ items, itemName, togglingId, onToggle }: Props) {
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<CSSProperties>({})
  const ref = useRef<HTMLSpanElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const total = items.length
  const on = items.filter(i => i.active).length
  const full = total > 0 && on === total
  const none = on === 0
  const fillPct = total === 0 ? 0 : (on / total) * 100

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS)
  }

  const handleEnter = () => {
    cancelClose()
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      // Anchor by the pill's own right edge rather than a guessed flyout
      // width — the flyout is only as wide as its chips, so a fixed-width
      // assumption here left it floating away from the pill it belongs to.
      const right = Math.max(WINDOW_PAD, window.innerWidth - rect.right)
      setStyle({ position: 'fixed', top: rect.bottom + 4, right })
    }
    setOpen(true)
  }

  return (
    <span ref={ref} className="relative inline-block" onMouseEnter={handleEnter} onMouseLeave={scheduleClose}>
      <span className={`relative block min-w-[40px] text-center rounded-md px-2 py-0.5 text-[10.5px] font-semibold font-mono overflow-hidden bg-[var(--c-surface-2)] ${none ? 'text-[var(--c-text-3)]' : 'text-[var(--c-text)]'}`}>
        {!none && (
          <span
            className={`absolute inset-y-0 left-0 ${full ? 'bg-emerald-400/30' : 'bg-amber-400/35'}`}
            style={{ width: `${fillPct}%` }}
          />
        )}
        <span className="relative">{on}/{total}</span>
      </span>
      {open && (
        <span
          style={style}
          className="z-50 flex gap-1 bg-[var(--c-bg)] border border-[var(--c-border)] rounded-lg p-1 shadow-xl"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <AgentToggleChips items={items} itemName={itemName} togglingId={togglingId} onToggle={onToggle} />
        </span>
      )}
    </span>
  )
}
