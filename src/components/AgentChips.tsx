import type { Agent } from '../types'
import { agentColor } from '../constants/agentColors'

interface Props {
  installedAgents: Agent[]
  selectedTools: Set<string>
  onToggle: (id: string) => void
}

export default function AgentChips({ installedAgents, selectedTools, onToggle }: Props) {
  if (installedAgents.length <= 1) return null
  return (
    <div className="px-3 py-1.5 border-b border-[var(--c-border)] flex gap-1.5 flex-wrap flex-shrink-0">
      {installedAgents.map(tool => {
        const colors = agentColor(tool.id)
        const selected = selectedTools.has(tool.id)
        return (
          <button
            key={tool.id}
            onClick={() => onToggle(tool.id)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all ${
              selected
                ? `${colors.bg} ${colors.text} border-transparent`
                : 'bg-transparent border-[var(--c-border)] text-[var(--c-text-3)] opacity-50'
            }`}
          >
            <span>{tool.name[0].toUpperCase()}</span>
            <span>{tool.name}</span>
          </button>
        )
      })}
    </div>
  )
}
