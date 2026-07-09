import ReactMarkdown from 'react-markdown'
import type { HistoryMessage, ContentBlock } from '../../types'
import ToolCallBlock, { ThinkingBlock } from './ToolCallBlock'

interface MessageBubbleProps {
  message: HistoryMessage
}

function renderAssistantContent(blocks: ContentBlock[]) {
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < blocks.length) {
    const block = blocks[i]

    if (block.blockType === 'thinking') {
      elements.push(<ThinkingBlock key={i} block={block} />)
      i++
      continue
    }

    if (block.blockType === 'tool_use') {
      const nextSame = blocks[i + 1]?.blockType === 'tool_result' ? blocks[i + 1] : undefined
      elements.push(
        <ToolCallBlock key={i} block={block} resultBlock={nextSame} />
      )
      if (nextSame) i++ // skip the paired result
      i++
      continue
    }

    if (block.blockType === 'tool_result') {
      // Already consumed by preceding tool_use; skip standalone results
      elements.push(<ToolCallBlock key={i} block={{ blockType: 'tool_use', toolName: 'result', isError: block.isError }} resultBlock={block} />)
      i++
      continue
    }

    if (block.blockType === 'text' && block.text) {
      elements.push(
        <div key={i} className="prose prose-sm prose-invert max-w-none text-[12px] text-[var(--c-text-2)] leading-relaxed [&_pre]:bg-[var(--c-surface-2)] [&_pre]:rounded [&_pre]:p-2 [&_code]:text-[var(--c-accent)] [&_code]:bg-[var(--c-surface-2)] [&_code]:px-0.5 [&_code]:rounded [&_pre_code]:bg-transparent [&_pre_code]:text-[var(--c-text-2)]">
          <ReactMarkdown>{block.text}</ReactMarkdown>
        </div>
      )
      i++
      continue
    }

    i++
  }

  return elements
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    const text = message.content
      .filter(b => b.blockType === 'text')
      .map(b => b.text ?? '')
      .join('\n')
      .trim()

    if (!text) return null

    return (
      <div className="flex justify-end mb-2">
        <div className="max-w-[85%] bg-[var(--c-accent)]/15 border border-[var(--c-accent)]/20 rounded-2xl rounded-tr-sm px-3 py-2">
          <p className="text-[12px] text-[var(--c-text)] whitespace-pre-wrap break-words leading-relaxed">{text}</p>
        </div>
      </div>
    )
  }

  // Assistant
  const elements = renderAssistantContent(message.content)
  if (elements.length === 0) return null

  return (
    <div className="mb-2">
      <div className="flex items-start gap-1.5 mb-1">
        <div className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5" style={{ background: 'linear-gradient(135deg, #a5b4fc, #6366f1)' }} />
        <span className="text-[10px] text-[var(--c-text-3)] mt-0.5">
          {message.model ?? 'Claude'}
        </span>
      </div>
      <div className="pl-5.5">
        {elements}
      </div>
    </div>
  )
}
