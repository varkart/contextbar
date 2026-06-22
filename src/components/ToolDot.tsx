import { TOOL_COLORS } from '../constants/toolColors'

interface Props {
  toolId: string
  toolName: string
}

export default function ToolDot({ toolId, toolName }: Props) {
  const colors = TOOL_COLORS[toolId] ?? { bg: 'bg-zinc-500/15', text: 'text-zinc-400' }
  return (
    <span className="relative group/dot">
      <span className={`inline-flex w-3.5 h-3.5 rounded-sm text-[9px] font-bold items-center justify-center flex-shrink-0 ${colors.bg} ${colors.text}`}>
        {toolId[0].toUpperCase()}
      </span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-1.5 py-0.5 rounded bg-zinc-900 text-white text-[10px] whitespace-nowrap opacity-0 group-hover/dot:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
        {toolName}
      </span>
    </span>
  )
}
