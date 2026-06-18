import { useState } from 'react'
import type { AiTool, McpServer } from '../types'

interface McpsListPanelProps {
  tool: AiTool
  onBack: () => void
  onSelectMcp: (mcp: McpServer) => void
  onAddMcp: () => void
}

function LockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="w-2.5 h-2.5 text-[var(--c-text-3)]"
      aria-label="has env secrets">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

export default function McpsListPanel({ tool, onBack, onSelectMcp, onAddMcp }: McpsListPanelProps) {
  const [q, setQ] = useState('')

  const filtered = q
    ? tool.mcps.filter(m => m.name.toLowerCase().includes(q.toLowerCase()))
    : tool.mcps

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--c-border)] flex-shrink-0">
        <button
          onClick={onBack}
          className="text-[var(--c-text-2)] hover:text-[var(--c-text)] transition-colors p-0.5 -ml-0.5 rounded"
          aria-label="Back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="w-3.5 h-3.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <button
          onClick={onBack}
          className="text-[13px] text-[var(--c-text-3)] truncate max-w-[80px] hover:text-[var(--c-text-2)] transition-colors"
        >
          {tool.name}
        </button>
        <span className="text-[12px] text-[var(--c-text-3)]">›</span>
        <span className="text-[15px] font-semibold text-[var(--c-text)] tracking-[-0.01em]">MCPs</span>
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[12px] text-[var(--c-text-3)] tabular-nums">{filtered.length}</span>
          <button
            onClick={onAddMcp}
            aria-label="Add MCP"
            className="p-0.5 rounded transition-colors text-[var(--c-text-3)] hover:text-violet-400"
            title="Add MCP"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className="w-3.5 h-3.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

      {tool.mcps.length > 5 && (
        <div className="px-3 py-1.5 border-b border-[var(--c-border)] flex-shrink-0">
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Filter MCPs…"
            className="w-full bg-[var(--c-hover)] text-[13px] text-[var(--c-text)] placeholder-[var(--c-text-3)] rounded px-2.5 py-1 outline-none focus:ring-1 focus:ring-violet-400/40"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-[var(--c-text-3)]">
            {q ? `No MCPs matching "${q}"` : 'No MCPs'}
          </p>
        ) : (
          filtered.map(mcp => (
            <button
              key={mcp.name}
              onClick={() => onSelectMcp(mcp)}
              className={`group w-full flex items-center gap-2 py-[3px] pl-[18px] pr-2 border-l-2 border-transparent hover:border-violet-400/50 hover:bg-[var(--c-hover)] hover:translate-x-[1px] transition-all duration-150 ease-out text-left ${!mcp.active ? 'opacity-40' : ''}`}
            >
              <span className="w-[3px] h-[3px] rounded-full bg-violet-400/60 flex-shrink-0" aria-hidden="true" />
              <span className="text-[14px] font-mono text-[var(--c-text-2)] truncate flex-1 leading-5">{mcp.name}</span>
              {mcp.hasSecrets && (
                <span
                  className="flex-shrink-0"
                  title={`Uses env secrets${mcp.secretKeyNames.length > 0 ? `: ${mcp.secretKeyNames.join(', ')}` : ''}`}
                >
                  <LockIcon />
                </span>
              )}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="w-3 h-3 text-[var(--c-text-3)] flex-shrink-0">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
