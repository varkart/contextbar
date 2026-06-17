import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { AiTool, McpServer } from '../types'
import { capture, captureException } from '../analytics'

interface McpsListPanelProps {
  tool: AiTool
  onBack: () => void
  onSelectMcp: (mcp: McpServer) => void
  onAdded?: () => void
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

function AddMcpForm({ toolId, onDone, onCancel }: { toolId: string; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [argsStr, setArgsStr] = useState('')
  const [url, setUrl] = useState('')
  const [isHttp, setIsHttp] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return

    setSaving(true)
    setError(null)
    try {
      if (isHttp) {
        await invoke('add_mcp', { toolId, name: trimmedName, url: url.trim() || undefined })
      } else {
        const args = argsStr.trim() ? argsStr.trim().split(/\s+/) : []
        await invoke('add_mcp', {
          toolId,
          name: trimmedName,
          command: command.trim() || undefined,
          args,
        })
      }
      capture('mcp_added', { tool_id: toolId, mcp_name: trimmedName })
      await onDone()
    } catch (e) {
      setError(String(e))
      captureException(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="px-3 py-2.5 border-b border-[var(--c-border)] bg-[var(--c-surface)] flex-shrink-0"
      aria-label="Add MCP form"
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[12px] font-semibold text-[var(--c-text-2)]">Add MCP</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsHttp(v => !v)}
            className={`text-[11px] px-1.5 py-0.5 rounded transition-colors ${isHttp ? 'bg-violet-500/20 text-violet-400' : 'text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
          >
            {isHttp ? 'HTTP' : 'stdio'}
          </button>
        </div>
      </div>

      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Name (e.g. github)"
        required
        className="w-full bg-[var(--c-bg)] text-[13px] text-[var(--c-text)] placeholder-[var(--c-text-3)] rounded px-2 py-1 outline-none focus:ring-1 focus:ring-violet-400/40 mb-1.5"
        aria-label="MCP name"
      />

      {isHttp ? (
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="URL (e.g. https://mcp.example.com)"
          className="w-full bg-[var(--c-bg)] text-[13px] text-[var(--c-text)] placeholder-[var(--c-text-3)] rounded px-2 py-1 outline-none focus:ring-1 focus:ring-violet-400/40 mb-1.5"
          aria-label="MCP URL"
        />
      ) : (
        <>
          <input
            type="text"
            value={command}
            onChange={e => setCommand(e.target.value)}
            placeholder="Command (e.g. npx)"
            className="w-full bg-[var(--c-bg)] text-[13px] text-[var(--c-text)] placeholder-[var(--c-text-3)] rounded px-2 py-1 outline-none focus:ring-1 focus:ring-violet-400/40 mb-1.5"
            aria-label="MCP command"
          />
          <input
            type="text"
            value={argsStr}
            onChange={e => setArgsStr(e.target.value)}
            placeholder="Args (space-separated, e.g. -y @modelcontextprotocol/server-github)"
            className="w-full bg-[var(--c-bg)] text-[13px] text-[var(--c-text)] placeholder-[var(--c-text-3)] rounded px-2 py-1 outline-none focus:ring-1 focus:ring-violet-400/40 mb-1.5"
            aria-label="MCP args"
          />
        </>
      )}

      {error && (
        <p className="text-[12px] text-red-400 mb-1.5 leading-relaxed">{error}</p>
      )}

      <div className="flex gap-1.5">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="text-[12px] bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 px-2.5 py-0.5 rounded transition-colors disabled:opacity-50"
        >
          {saving ? 'Adding…' : 'Add'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[12px] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] px-2 py-0.5 rounded transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function McpsListPanel({ tool, onBack, onSelectMcp, onAdded }: McpsListPanelProps) {
  const [q, setQ] = useState('')
  const [showAdd, setShowAdd] = useState(false)

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
            onClick={() => setShowAdd(v => !v)}
            aria-label="Add MCP"
            className={`p-0.5 rounded transition-colors ${showAdd ? 'text-violet-400' : 'text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
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

      {showAdd && (
        <AddMcpForm
          toolId={tool.id}
          onDone={async () => {
            setShowAdd(false)
            await onAdded?.()
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

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
