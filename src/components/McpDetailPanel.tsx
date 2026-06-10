import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { McpServer, McpTool } from '../types'
import { capture, captureException } from '../analytics'

interface McpDetailPanelProps {
  mcp: McpServer
  onBack: () => void
  toolName?: string
}

function ToolItem({ tool }: { tool: McpTool }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-[var(--c-border-sub)] last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-start gap-2 py-2 px-2 text-left hover:bg-[var(--c-hover)] transition-colors rounded-sm"
      >
        <span className="w-[3px] h-[3px] rounded-full bg-violet-400/60 flex-shrink-0 mt-[7px]" />
        <span className="text-[12px] font-mono text-[var(--c-text-2)] flex-1 truncate">{tool.name}</span>
        {tool.description && (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={`w-3 h-3 text-[var(--c-text-3)] flex-shrink-0 mt-0.5 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        )}
      </button>
      {open && tool.description && (
        <p className="text-[11px] text-[var(--c-text-3)] leading-relaxed px-4 pb-2 pl-6">
          {tool.description}
        </p>
      )}
    </div>
  )
}

export default function McpDetailPanel({ mcp, onBack, toolName }: McpDetailPanelProps) {
  const [tools, setTools] = useState<McpTool[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const commandStr = [mcp.command, ...mcp.args].join(' ')

  useEffect(() => {
    const t0 = Date.now()
    invoke<McpTool[]>('query_mcp_tools', { command: mcp.command, args: mcp.args })
      .then(result => {
        setTools(result)
        capture('mcp_query_duration', {
          mcp_name: mcp.name,
          duration_ms: Date.now() - t0,
          tool_count: result.length,
        })
      })
      .catch(e => {
        setError(String(e))
        captureException(e)
        capture('mcp_query_failed', { mcp_name: mcp.name, error: String(e) })
      })
      .finally(() => setLoading(false))
  }, [mcp.command, mcp.args, mcp.name])

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
      {/* Header */}
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
        {toolName && (
          <>
            <span className="text-[11px] text-[var(--c-text-3)] truncate max-w-[80px]">{toolName}</span>
            <span className="text-[10px] text-[var(--c-text-3)]">›</span>
          </>
        )}
        <span className="text-[13px] font-semibold text-[var(--c-text)] tracking-[-0.01em] truncate">
          {mcp.name}
        </span>
        <span className="ml-auto text-[10px] bg-violet-500/10 text-violet-400 px-1.5 py-0.5 rounded font-mono">MCP</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Description / command / URL */}
        <div className="px-4 py-3 border-b border-[var(--c-border)]">
          {mcp.url && (
            <p className="text-[10px] text-[var(--c-text-3)] font-mono break-all leading-relaxed mb-1">{mcp.url}</p>
          )}
          {mcp.description ? (
            <p className="text-[12px] text-[var(--c-text-2)] leading-relaxed">{mcp.description}</p>
          ) : !mcp.url ? (
            <p className="text-[10px] text-[var(--c-text-3)] font-mono break-all leading-relaxed">{commandStr}</p>
          ) : null}
          {mcp.hasSecrets && mcp.secretKeyNames.length > 0 && (
            <p className="text-[10px] text-amber-400/70 mt-1">env: {mcp.secretKeyNames.join(', ')}</p>
          )}
        </div>

        {/* Live tools */}
        <div className="px-2 py-2">
          <p className="text-[11px] font-semibold text-violet-500 px-2 mb-1">
            Live tools {!loading && !error && `(${tools.length})`}
          </p>
          {loading && (
            <div className="px-2 py-4 animate-pulse space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-3 bg-[var(--c-skeleton)] rounded w-3/4"/>)}
            </div>
          )}
          {error && (
            <p className="text-[11px] text-red-400 px-2 py-2 leading-relaxed">{error}</p>
          )}
          {!loading && !error && tools.length === 0 && (
            <p className="text-[11px] text-[var(--c-text-3)] px-2 py-2">No tools returned</p>
          )}
          {!loading && !error && tools.length > 0 && (
            <div className="px-1">
              {tools.map(t => <ToolItem key={t.name} tool={t} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
