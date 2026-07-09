import type { TokenUsage } from '../../types'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

function tokenBadgeColor(total: number): string {
  if (total >= 1_000_000) return 'bg-rose-500/20 text-rose-400'
  if (total >= 500_000) return 'bg-amber-500/20 text-amber-400'
  return 'bg-emerald-500/20 text-emerald-400'
}

interface SessionStatsProps {
  usage: TokenUsage
  messageCount: number
  toolCount: number
  durationMs?: number
}

export default function SessionStats({ usage, messageCount, toolCount, durationMs }: SessionStatsProps) {
  const total = usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheCreationTokens

  const durationStr = durationMs
    ? durationMs < 60_000
      ? `${Math.round(durationMs / 1000)}s`
      : `${Math.round(durationMs / 60_000)}m`
    : '—'

  return (
    <div className="grid grid-cols-4 gap-1.5 px-3 py-2">
      <div className="flex flex-col gap-0.5 bg-[var(--c-surface-2)] rounded-lg px-2 py-2">
        <span className="text-[9px] text-[var(--c-text-3)] uppercase tracking-wider">Tokens</span>
        <span className={`text-[12px] font-semibold tabular-nums px-1 py-0.5 rounded ${tokenBadgeColor(total)}`}>
          {formatTokens(total)}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 bg-[var(--c-surface-2)] rounded-lg px-2 py-2">
        <span className="text-[9px] text-[var(--c-text-3)] uppercase tracking-wider">Msgs</span>
        <span className="text-[12px] font-semibold text-[var(--c-text)] tabular-nums">{messageCount}</span>
      </div>
      <div className="flex flex-col gap-0.5 bg-[var(--c-surface-2)] rounded-lg px-2 py-2">
        <span className="text-[9px] text-[var(--c-text-3)] uppercase tracking-wider">Tools</span>
        <span className="text-[12px] font-semibold text-[var(--c-text)] tabular-nums">{toolCount}</span>
      </div>
      <div className="flex flex-col gap-0.5 bg-[var(--c-surface-2)] rounded-lg px-2 py-2">
        <span className="text-[9px] text-[var(--c-text-3)] uppercase tracking-wider">Time</span>
        <span className="text-[12px] font-semibold text-[var(--c-text)] tabular-nums">{durationStr}</span>
      </div>
    </div>
  )
}

export { formatTokens, tokenBadgeColor }
