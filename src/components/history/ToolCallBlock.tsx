import { useState } from 'react'
import type { ContentBlock } from '../../types'

const TOOL_COLORS: Record<string, string> = {
  Read: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  Write: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  Edit: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
  Bash: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  Grep: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  Agent: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  Task: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
}

function toolColor(name: string) {
  return TOOL_COLORS[name] ?? 'bg-[var(--c-surface-2)] text-[var(--c-text-3)] border-[var(--c-border)]'
}

interface ToolCallBlockProps {
  block: ContentBlock
  resultBlock?: ContentBlock
}

export default function ToolCallBlock({ block, resultBlock }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const name = block.toolName ?? 'tool'
  const hasContent = block.toolInput || resultBlock?.toolResult
  const isError = resultBlock?.isError ?? false

  return (
    <div className="my-1">
      <button
        onClick={() => hasContent && setExpanded(e => !e)}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium transition-opacity ${toolColor(name)} ${hasContent ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} ${isError ? '!bg-rose-500/15 !text-rose-400 !border-rose-500/20' : ''}`}
      >
        <span>{name}</span>
        {isError && <span className="text-[10px]">✗</span>}
        {hasContent && (
          <span className="text-[9px] opacity-60">{expanded ? '▲' : '▼'}</span>
        )}
      </button>
      {expanded && hasContent && (
        <div className="mt-1.5 rounded-lg border border-[var(--c-border)] overflow-hidden text-[11px]">
          {block.toolInput && (
            <div className="px-2.5 py-2 bg-[var(--c-surface-2)]">
              <span className="text-[10px] text-[var(--c-text-3)] uppercase tracking-wider block mb-1">Input</span>
              <pre className="text-[var(--c-text-2)] whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed">{block.toolInput}</pre>
            </div>
          )}
          {resultBlock?.toolResult && (
            <div className={`px-2.5 py-2 border-t border-[var(--c-border)] ${isError ? 'bg-rose-500/5' : ''}`}>
              <span className="text-[10px] text-[var(--c-text-3)] uppercase tracking-wider block mb-1">
                {isError ? 'Error' : 'Output'}
              </span>
              <pre className={`whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed ${isError ? 'text-rose-400' : 'text-[var(--c-text-2)]'}`}>{resultBlock.toolResult}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

