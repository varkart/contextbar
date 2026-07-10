import type { ReactNode } from 'react'

export function TileRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid gap-2.5 ${className}`} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))' }}>
      {children}
    </div>
  )
}

export function Tile({ value, label, color, hint }: {
  value: string | number
  label: string
  color?: string
  hint?: string
}) {
  return (
    <div
      className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 px-3 py-2.5 text-center"
      title={hint}
    >
      <div className={`text-[16px] font-semibold tabular-nums ${color ?? 'text-[var(--c-text)]'}`}>{value}</div>
      <div className="text-[9.5px] text-[var(--c-text-3)] uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  )
}
