const AGENT_STYLE: Record<string, { label: string; cls: string }> = {
  claude: { label: 'Claude', cls: 'bg-indigo-500/15 text-indigo-400' },
  codex: { label: 'Codex', cls: 'bg-emerald-500/15 text-emerald-400' },
  gemini: { label: 'Gemini', cls: 'bg-sky-500/15 text-sky-400' },
  agy: { label: 'Antigravity', cls: 'bg-fuchsia-500/15 text-fuchsia-400' },
}

/** Small colored chip identifying which agent recorded a session. */
export default function AgentBadge({ agent, className = '' }: { agent: string; className?: string }) {
  const style = AGENT_STYLE[agent] ?? { label: agent, cls: 'bg-[var(--c-surface-2)] text-[var(--c-text-3)]' }
  return (
    <span className={`text-[8.5px] font-mono font-semibold uppercase tracking-wide px-1.5 py-px rounded-full whitespace-nowrap ${style.cls} ${className}`}>
      {style.label}
    </span>
  )
}
