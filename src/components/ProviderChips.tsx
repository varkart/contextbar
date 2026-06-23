import type { AiTool } from '../types'
import { TOOL_COLORS } from '../constants/toolColors'

interface Props {
  installedTools: AiTool[]
  selectedTools: Set<string>
  onToggle: (id: string) => void
}

export default function ProviderChips({ installedTools, selectedTools, onToggle }: Props) {
  if (installedTools.length <= 1) return null
  return (
    <div className="px-3 py-1.5 border-b border-[var(--c-border)] flex gap-1.5 flex-wrap flex-shrink-0">
      {installedTools.map(tool => {
        const colors = TOOL_COLORS[tool.id] ?? { bg: 'bg-zinc-500/15', text: 'text-zinc-400' }
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
