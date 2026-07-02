import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { McpServer, McpTool, NpmInstallState, Agent } from '../types'
import { capture, captureException } from '../analytics'
import { McpInstalledOn } from './InstalledOnSection'

interface McpDetailPanelProps {
  mcp: McpServer
  onBack: () => void
  agentName?: string
  agentId?: string
  onToggled?: () => void
  onRemoved?: () => void
  allAgents?: Agent[]
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

function NpmInstallSection({ mcp, agentId }: { mcp: McpServer; agentId?: string }) {
  const [state, setState] = useState<NpmInstallState | null>(null)
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [checkingLatest, setCheckingLatest] = useState(false)
  const [pkgDesc, setPkgDesc] = useState<string | null>(null)
  const [repoUrl, setRepoUrl] = useState<string | null>(null)
  const [descExpanded, setDescExpanded] = useState(false)

  useEffect(() => {
    invoke<NpmInstallState>('get_mcp_install_state', { command: mcp.command, args: mcp.args })
      .then(setState)
      .catch(() => {})
  }, [mcp.command, mcp.args])

  // Fetch registry metadata for description + repo URL
  useEffect(() => {
    if (mcp.command !== 'npx') return
    const pkg = (() => {
      let skipNext = false
      for (const arg of mcp.args) {
        if (skipNext) { skipNext = false; continue }
        if (arg === '-p' || arg === '--package' || arg === '--node-arg') { skipNext = true; continue }
        if (arg.startsWith('-')) continue
        const at = arg.lastIndexOf('@')
        return at > 0 ? arg.slice(0, at) : arg
      }
      return null
    })()
    if (!pkg) return
    fetch(`https://registry.npmjs.org/${pkg}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: Record<string, unknown> | null) => {
        if (!data) return
        if (typeof data.description === 'string' && data.description) setPkgDesc(data.description)
        const repo = (data.repository as Record<string, string> | undefined)?.url ?? ''
        const cleaned = repo.replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://')
        const url = cleaned.startsWith('http') ? cleaned : (data.homepage as string | undefined) ?? null
        if (url) setRepoUrl(url)
      })
      .catch(() => {})
  }, [mcp.command, mcp.args])

  if (!state?.isNpx || !state.package) return null

  const pkg = state.package
  const installed = state.installedVersion
  const isAutoDownload = mcp.args.includes('-y') || mcp.args.includes('--yes')
  const hasUpdate = latestVersion !== null && installed !== null && latestVersion !== installed

  const handleInstall = async () => {
    setInstalling(true)
    setInstallError(null)
    try {
      const version = await invoke<string>('install_mcp_npm', {
        agentId: agentId ?? '',
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
      {/* Header row */}
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[10px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider flex-shrink-0">npm package</span>
        <span className="text-[13px] font-mono text-violet-400 truncate flex-1">{pkg}</span>
        {repoUrl && (
          <button
            onClick={() => invoke('open_url', { url: repoUrl }).catch(() => {})}
            aria-label="Open package source"
            className="flex-shrink-0 text-[var(--c-text-3)] hover:text-violet-400 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="w-3 h-3">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </button>
        )}
      </div>

      {/* Description with expand/collapse */}
      {pkgDesc && (
        <div className="mb-2">
          <p className={`text-[12px] text-[var(--c-text-2)] leading-relaxed ${descExpanded ? '' : 'line-clamp-2'}`}>
            {pkgDesc}
          </p>
          {pkgDesc.length > 80 && (
            <button
              onClick={() => setDescExpanded(v => !v)}
              className="text-[11px] text-violet-500 hover:text-violet-400 mt-0.5 transition-colors"
            >
              {descExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      {/* Install note */}
      <p className="text-[11px] text-[var(--c-text-3)]/60 mb-2">
        Installs the global npm package so this MCP server command is available on PATH.
        Does not modify your config.
      </p>

      {/* Version / install row */}
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
        ) : isAutoDownload ? (
          <>
            <span className="text-[12px] text-[var(--c-text-3)]">downloads via npx automatically</span>
            <button
              onClick={handleInstall}
              disabled={installing}
              aria-label="Install package globally"
              className="ml-auto text-[12px] text-[var(--c-text-3)] hover:text-violet-400 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
            >
              {installing ? 'installing…' : 'Install globally'}
            </button>
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

export default function McpDetailPanel({ mcp, onBack, agentId, onToggled, allAgents }: McpDetailPanelProps) {
  const [tools, setTools] = useState<McpTool[]>([])
  const [loading, setLoading] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const commandStr = [mcp.command, ...mcp.args].join(' ')
  const isHttp = !!mcp.url && !mcp.command

  useEffect(() => {
    if (!loading) return
    setElapsed(0)
    const interval = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(interval)
  }, [loading])

  useEffect(() => {
    const t0 = Date.now()
    invoke<McpTool[]>('query_mcp_tools', { command: mcp.command, args: mcp.args, url: mcp.url ?? null })
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
  }, [mcp.command, mcp.args, mcp.name, mcp.url])

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">

      <div className="flex-1 overflow-y-auto">
        {/* npm package card — top, only for npx MCPs */}
        <NpmInstallSection mcp={mcp} agentId={agentId} />

        {/* Name / command / URL */}
        <div className="px-4 py-3 border-b border-[var(--c-border)]">
          <p className="text-[15px] font-semibold text-violet-400 leading-tight tracking-[-0.01em] font-mono mb-1">
            {mcp.name}
          </p>
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

        {/* Installed on */}
        {allAgents && (
          <McpInstalledOn
            mcp={mcp}
            currentAgentId={agentId ?? ''}
            allAgents={allAgents}
            onInstalled={async () => { await onToggled?.() }}
            onBack={onBack}
          />
        )}

        {/* Live tools */}
        {isHttp ? (
          <div className="px-4 py-3 border-t border-[var(--c-border)]">
            <p className="text-[13px] text-[var(--c-text-3)]">
              HTTP MCP — tools discoverable only when connected
            </p>
          </div>
        ) : (
          <div className="px-2 py-2">
            <p className="text-[13px] font-semibold text-violet-500 px-2 mb-1">
              Live tools {!loading && !error && `(${tools.length})`}
            </p>
            {loading && (
              <div className="px-2 py-4 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[13px] text-[var(--c-text-3)]">
                  <svg className="w-3.5 h-3.5 text-violet-400 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                  </svg>
                  <span>
                    {elapsed < 4
                      ? 'Starting server…'
                      : elapsed < 12
                      ? 'Waiting for server to respond…'
                      : 'Downloading dependencies — this only happens once…'}
                  </span>
                </div>
                {elapsed >= 4 && (
                  <p className="text-[11px] text-[var(--c-text-3)] font-mono pl-5 truncate opacity-60">
                    {commandStr}
                  </p>
                )}
              </div>
            )}
            {error && (
              <div className="px-2 py-2 space-y-1">
                <p className="text-[13px] text-red-400 leading-relaxed">
                  {error.includes('timeout')
                    ? 'Server took too long to respond. On first run, package managers like uvx or npx may need to download dependencies — try again in a moment.'
                    : error.includes('closed stdout') || error.includes('server closed')
                    ? 'Server exited before responding. It may need configuration, a required env variable, or may not support this transport.'
                    : error.includes('failed to start')
                    ? `Could not launch server: ${error.replace('failed to start MCP server: ', '')}`
                    : error}
                </p>
                {(error.includes('timeout') || error.includes('closed stdout') || error.includes('server closed')) && (
                  <button
                    onClick={() => {
                      setError(null);
                      setLoading(true);
                      invoke<McpTool[]>('query_mcp_tools', { command: mcp.command, args: mcp.args, url: mcp.url ?? null })
                        .then(setTools)
                        .catch(e => setError(String(e)))
                        .finally(() => setLoading(false));
                    }}
                    className="text-[12px] text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    Retry
                  </button>
                )}
              </div>
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
        )}
      </div>
    </div>
  )
}
