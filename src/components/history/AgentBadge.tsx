import { agentColor } from '../../constants/agentColors'

/** Small colored chip identifying which agent recorded a session. */
export default function AgentBadge({ agent, className = '' }: { agent: string; className?: string }) {
  const { label, bg, text } = agentColor(agent)
  return (
    <span className={`text-[9px] font-mono font-semibold uppercase tracking-wide px-1.5 py-px rounded-full whitespace-nowrap ${bg} ${text} ${className}`}>
      {label}
    </span>
  )
}
