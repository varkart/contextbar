import type { ReactNode } from 'react'

export function TileRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid gap-2.5 ${className}`} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))' }}>
      {children}
    </div>
  )
}

export function Tile({ value, label, color, hint, onClick }: {
  value: string | number
  label: string
  color?: string
  hint?: string
  /** When set, the tile renders as a clickable button. */
  onClick?: () => void
}) {
  const cls = `rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 px-3 py-2.5 text-center ${onClick ? 'hover:border-[var(--c-accent)]/40 hover:bg-[var(--c-surface-2)] transition-colors cursor-pointer' : ''}`
  const inner = (
    <>
      <div className={`text-[16px] font-semibold tabular-nums ${color ?? 'text-[var(--c-text)]'}`}>{value}</div>
      <div className="text-[9.5px] text-[var(--c-text-3)] uppercase tracking-wider mt-0.5">{label}</div>
    </>
  )
  if (onClick) {
    return <button type="button" onClick={onClick} className={cls} title={hint}>{inner}</button>
  }
  return <div className={cls} title={hint}>{inner}</div>
}
