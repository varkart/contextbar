import { highlight } from '../search'

interface HighlightProps {
  text: string
  query: string
  className?: string
}

export default function Highlight({ text, query, className = '' }: HighlightProps) {
  const parts = highlight(text, query)
  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.match ? (
          <mark key={i} className="bg-amber-400/20 text-amber-300 rounded-[2px] not-italic">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  )
}
