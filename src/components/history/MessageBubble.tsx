import React from 'react'
import ReactMarkdown from 'react-markdown'
import type { HistoryMessage, ContentBlock } from '../../types'
import ToolCallBlock from './ToolCallBlock'
import ToolCallGroup from './ToolCallGroup'

interface MessageBubbleProps {
  message: HistoryMessage
}

/** Runs of this many or more sequential tool calls collapse into one group
 *  (Claude batches multiple tool_use blocks into one turn — a long turn can
 *  still contain a dozen+ of them). */
const COLLAPSE_THRESHOLD = 3

function renderAssistantContent(blocks: ContentBlock[]) {
  const elements: React.ReactElement[] = []

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]

    // thinking blocks are stripped in Rust parser; skip any that slip through
    if (block.blockType === 'thinking') continue

    if (block.blockType === 'tool_use') {
      // Consume the whole run of consecutive tool_use blocks at once.
      let j = i
      while (j < blocks.length && blocks[j].blockType === 'tool_use') j++
      const run = blocks.slice(i, j)
      if (run.length >= COLLAPSE_THRESHOLD) {
        elements.push(<ToolCallGroup key={i} blocks={run} />)
      } else {
        run.forEach((b, k) => elements.push(<ToolCallBlock key={i + k} block={b} />))
      }
      i = j - 1
      continue
    }

    // tool_result lives in user protocol turns; skip in assistant render
    if (block.blockType === 'tool_result') continue

    if (block.blockType === 'text' && block.text) {
      elements.push(
        <div key={i} className="prose prose-sm prose-invert max-w-none text-[12px] text-[var(--c-text-2)] leading-relaxed [&_pre]:bg-[var(--c-surface-2)] [&_pre]:rounded [&_pre]:p-2 [&_code]:text-[var(--c-accent)] [&_code]:bg-[var(--c-surface-2)] [&_code]:px-0.5 [&_code]:rounded [&_pre_code]:bg-transparent [&_pre_code]:text-[var(--c-text-2)]">
          <ReactMarkdown>{block.text}</ReactMarkdown>
        </div>
      )
    }
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
      <div className="pl-5">
        {elements}
      </div>
    </div>
  )
}
