import { useState, useRef, type CSSProperties } from 'react'
import { agentColor } from '../constants/agentColors'

interface Props {
  toolId: string
  toolName: string
  size?: 'sm' | 'md'
}

const TOOLTIP_W = 140
const WINDOW_PAD = 8

const SIZE_CLASSES = {
  sm: 'w-3.5 h-3.5 rounded-sm text-[9px]',
  md: 'w-[22px] h-[22px] rounded text-[11px]',
}

export default function AgentDot({ toolId, toolName, size = 'sm' }: Props) {
  const colors = agentColor(toolId)
  const [visible, setVisible] = useState(false)
  const [style, setStyle] = useState<CSSProperties>({})
  const ref = useRef<HTMLSpanElement>(null)

  const handleEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const center = rect.left + rect.width / 2
      const left = Math.max(WINDOW_PAD, Math.min(center - TOOLTIP_W / 2, window.innerWidth - TOOLTIP_W - WINDOW_PAD))
      setStyle({ position: 'fixed', top: rect.top - 26, left })
    }
    setVisible(true)
  }

  return (
    <span ref={ref} className="relative" onMouseEnter={handleEnter} onMouseLeave={() => setVisible(false)}>
      <span className={`inline-flex font-bold items-center justify-center flex-shrink-0 cursor-default ${SIZE_CLASSES[size]} ${colors.bg} ${colors.text}`}>
        {toolId[0].toUpperCase()}
      </span>
      {visible && (
        <span
          role="tooltip"
          style={style}
          className="z-50 px-1.5 py-0.5 rounded bg-zinc-900 text-white text-[10px] whitespace-nowrap pointer-events-none shadow-lg"
        >
          {toolName}
        </span>
      )}
    </span>
  )
}
