import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { McpServer, McpTool, NpmInstallState } from '../types'
import { capture, captureException } from '../analytics'

interface McpDetailPanelProps {
  mcp: McpServer
  onBack: () => void
  toolName?: string
  toolId?: string
  onToggled?: () => void
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
        <span className="text-[14px] font-mono text-[var(--c-text-2)] flex-1 truncate">{tool.name}</span>
        {tool.description && (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={`w-3 h-3 text-[var(--c-text-3)] flex-shrink-0 mt-0.5 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        )}
      </button>
      {open && tool.description && (
        <p className="text-[13px] text-[var(--c-text-3)] leading-relaxed px-4 pb-2 pl-6">
          {tool.description}
        </p>
      )}
    </div>
  )
}

function NpmInstallSection({ mcp, toolId }: { mcp: McpServer; toolId?: string }) {
  const [state, setState] = useState<NpmInstallState | null>(null)
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [checkingLatest, setCheckingLatest] = useState(false)

  useEffect(() => {
    invoke<NpmInstallState>('get_mcp_install_state', { command: mcp.command, args: mcp.args })
      .then(setState)
      .catch(() => {})
  }, [mcp.command, mcp.args])

  if (!state?.isNpx) return null

  const pkg = state.package!
  const installed = state.installedVersion
  const hasUpdate = latestVersion !== null && installed !== null && latestVersion !== installed

  const handleInstall = async () => {
    setInstalling(true)
    setInstallError(null)
    try {
      const version = await invoke<string>('install_mcp_npm', {
        toolId: toolId ?? '',
        mcpName: mcp.name,
        packageName: pkg,
      })
      setState(prev => prev ? { ...prev, installedVersion: version } : prev)
      setLatestVersion(null)
    } catch (e) {
      setInstallError(String(e))
    } finally {
      setInstalling(false)
    }
  }

  const handleCheckLatest = async () => {
    setCheckingLatest(true)
    try {
      const latest = await invoke<string | null>('get_mcp_npm_latest', { packageName: pkg })
      setLatestVersion(latest)
    } catch {
      setLatestVersion(null)
    } finally {
      setCheckingLatest(false)
    }
  }

  return (
    <div className="px-4 py-3 border-b border-[var(--c-border)]">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider">npm package</span>
        <span className="text-[13px] font-mono text-[var(--c-text-2)] truncate flex-1">{pkg}</span>
      </div>
      <p className="text-[11px] text-[var(--c-text-3)]/60 mb-1.5">
        Installs the global npm package so this MCP server command is available on PATH.
        Does not modify your Claude config.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        {installed ? (
          <>
            <span className="text-[12px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded font-mono">
              v{installed}
            </span>
            {latestVersion !== null && (
              hasUpdate
                ? <span className="text-[12px] text-blue-400/70">v{latestVersion} available</span>
                : <span className="text-[12px] text-[var(--c-text-3)]">up to date</span>
            )}
            <div className="ml-auto">
              {hasUpdate ? (
                <button
                  onClick={handleInstall}
                  disabled={installing}
                  aria-label={`Update to ${latestVersion}`}
                  className="text-[12px] bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                >
                  {installing ? 'updating…' : `Update to v${latestVersion}`}
                </button>
              ) : (
                <button
                  onClick={handleCheckLatest}
                  disabled={checkingLatest}
                  aria-label="Check for updates"
                  className="text-[12px] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors disabled:opacity-50"
                >
                  {checkingLatest ? 'checking…' : 'check for updates'}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <span className="text-[12px] text-amber-400/70">not installed</span>
            <button
              onClick={handleInstall}
              disabled={installing}
              aria-label="Install package"
              className="ml-auto text-[12px] bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
            >
              {installing ? 'installing…' : 'Install'}
            </button>
          </>
        )}
      </div>
      {installError && (
        <p className="text-[12px] text-red-400 mt-1.5 leading-relaxed">{installError}</p>
      )}
    </div>
  )
}

export default function McpDetailPanel({ mcp, onBack, toolName, toolId, onToggled }: McpDetailPanelProps) {
  const [active, setActive] = useState(mcp.active)
  const [toggling, setToggling] = useState(false)
  const [justToggled, setJustToggled] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [tools, setTools] = useState<McpTool[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const handleToggle = async () => {
    if (!toolId) return
    setToggling(true)
    setToggleError(null)
    try {
      await invoke('set_mcp_active', {
        toolId,
        mcpName: mcp.name,
        sourceId: mcp.sourceId,
        active: !active,
        extensionName: mcp.extensionName ?? null,
      })
      capture('mcp_toggled', { tool_id: toolId, mcp_name: mcp.name, active: !active })
      setActive(v => !v)
      setJustToggled(true)
      await onToggled?.()
    } catch (e) {
      setToggleError(String(e))
      captureException(e)
    } finally {
      setToggling(false)
      setTimeout(() => setJustToggled(false), 800)
    }
  }

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
            <button onClick={onBack} className="text-[13px] text-[var(--c-text-3)] truncate max-w-[80px] hover:text-[var(--c-text-2)] transition-colors">
              {toolName}
            </button>
            <span className="text-[12px] text-[var(--c-text-3)]">›</span>
          </>
        )}
        <span className="text-[15px] font-semibold text-[var(--c-text)] tracking-[-0.01em] truncate">
          {mcp.name}
        </span>
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          {toolId && (
            <button
              onClick={handleToggle}
              disabled={toggling || justToggled}
              aria-label={active ? 'Disable MCP' : 'Enable MCP'}
              className={`text-[12px] px-2 py-0.5 rounded transition-colors disabled:opacity-60 ${
                justToggled
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : active
                    ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
              }`}
            >
              {toggling ? '…' : justToggled ? '✓' : active ? 'Disable' : 'Enable'}
            </button>
          )}
          <span className="text-[12px] bg-violet-500/10 text-violet-400 px-1.5 py-0.5 rounded font-mono">MCP</span>
        </div>
      </div>

      {toggleError && (
        <div className="mx-3 mt-1 px-3 py-1.5 rounded text-[12px] text-red-400 bg-red-500/10 flex items-center justify-between gap-2 flex-shrink-0">
          <span className="truncate">{toggleError}</span>
          <button onClick={() => setToggleError(null)} className="flex-shrink-0 hover:text-red-300">✕</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Description / command / URL */}
        <div className="px-4 py-3 border-b border-[var(--c-border)]">
          {mcp.url && (
            <p className="text-[12px] text-[var(--c-text-3)] font-mono break-all leading-relaxed mb-1">{mcp.url}</p>
          )}
          {mcp.description ? (
            <p className="text-[14px] text-[var(--c-text-2)] leading-relaxed">{mcp.description}</p>
          ) : !mcp.url ? (
            <p className="text-[12px] text-[var(--c-text-3)] font-mono break-all leading-relaxed">{commandStr}</p>
          ) : null}
          {mcp.hasSecrets && mcp.secretKeyNames.length > 0 && (
            <p className="text-[12px] text-amber-400/70 mt-1">env: {mcp.secretKeyNames.join(', ')}</p>
          )}
        </div>

        {/* npm install state */}
        <NpmInstallSection mcp={mcp} toolId={toolId} />

        {/* Live tools */}
        <div className="px-2 py-2">
          <p className="text-[13px] font-semibold text-violet-500 px-2 mb-1">
            Live tools {!loading && !error && `(${tools.length})`}
          </p>
          {loading && (
            <div className="px-2 py-4 animate-pulse space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-3 bg-[var(--c-skeleton)] rounded w-3/4"/>)}
            </div>
          )}
          {error && (
            <p className="text-[13px] text-red-400 px-2 py-2 leading-relaxed">{error}</p>
          )}
          {!loading && !error && tools.length === 0 && (
            <p className="text-[13px] text-[var(--c-text-3)] px-2 py-2">No tools returned</p>
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
