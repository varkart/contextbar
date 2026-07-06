import { useState } from 'react'
import { flushSync } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import type { Agent, Skill, McpServer } from '../types'
import { agentColor } from '../constants/agentColors'
import { capture, captureException } from '../analytics'


const MIN_SPINNER_MS = 1000
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

function AgentAvatar({ tool }: { tool: Agent }) {
  const colors = agentColor(tool.id)
  return (
    <span className={`inline-flex items-center justify-center w-[22px] h-[22px] rounded text-[12px] font-bold flex-shrink-0 select-none ${colors.bg} ${colors.text}`}>
      {tool.name[0].toUpperCase()}
    </span>
  )
}

function MiniSpinner() {
  return (
    <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  )
}

// ── Skill variant ────────────────────────────────────────────────────────────

interface SkillInstalledOnProps {
  skill: Skill
  currentAgentId: string
  allAgents: Agent[]
  onInstalled: () => void
  /** Called when user clicks an installed provider row to preview its file path. */
  onSelectForPath?: (tool: Agent) => void
  /** Tool id whose path is currently shown at the bottom — highlights that row. */
  selectedAgentId?: string
}

interface PendingDisable {
  tool: Agent
  matchedSkill: Skill
}

export function SkillInstalledOn({ skill, currentAgentId, allAgents, onInstalled, onSelectForPath, selectedAgentId }: SkillInstalledOnProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  // Pending disable when skill has no cache and this is the last provider
  const [pendingDisable, setPendingDisable] = useState<PendingDisable | null>(null)

  const installedAgents = allAgents.filter(t => t.installed)

  const doToggle = async (targetTool: Agent, matchedSkill: Skill, newActive: boolean) => {
    flushSync(() => setToggling(targetTool.id))
    const started = Date.now()
    try {
      await invoke('set_skill_active', {
        agentId: targetTool.id,
        skillName: matchedSkill.name,
        skillPath: matchedSkill.path,
        sourceId: matchedSkill.sourceId,
        active: newActive,
      })
      capture('skill_toggled', { tool_id: targetTool.id, skill_name: matchedSkill.name, active: newActive })
    } catch (e) {
      setErrors(prev => ({ ...prev, [targetTool.id]: String(e) }))
      captureException(e)
    } finally {
      const elapsed = Date.now() - started
      if (elapsed < MIN_SPINNER_MS) await sleep(MIN_SPINNER_MS - elapsed)
      await onInstalled()
      setToggling(null)
    }
  }

  const handleToggle = async (targetTool: Agent, matchedSkill: Skill, newActive: boolean) => {
    // Disabling from the last provider that has this skill → check cache first
    if (!newActive) {
      const otherHaveIt = installedAgents.some(
        t => t.id !== targetTool.id && t.skills.some(s => s.name === skill.name)
      )
      if (!otherHaveIt) {
        const cached = await invoke('get_skill_cache_status', { skillName: skill.name }).catch(() => null)
        if (!cached) {
          setPendingDisable({ tool: targetTool, matchedSkill })
          return
        }
      }
    }
    await doToggle(targetTool, matchedSkill, newActive)
  }

  const handleDelete = async (targetTool: Agent, matchedSkill: Skill) => {
    flushSync(() => setDeleting(targetTool.id))
    const started = Date.now()
    try {
      await invoke('remove_skill', {
        agentId: targetTool.id,
        skillName: matchedSkill.name,
        skillPath: matchedSkill.path,
      })
      capture('skill_deleted', { tool_id: targetTool.id, skill_name: matchedSkill.name })
    } catch (e) {
      setErrors(prev => ({ ...prev, [targetTool.id]: String(e) }))
      captureException(e)
    } finally {
      const elapsed = Date.now() - started
      if (elapsed < MIN_SPINNER_MS) await sleep(MIN_SPINNER_MS - elapsed)
      await onInstalled()
      setDeleting(null)
    }
  }

  // Cache-aware add: uses add_skill_to_tool which tries cache → live copy
  const handleAdd = async (targetTool: Agent) => {
    flushSync(() => {
      setInstalling(targetTool.id)
      setErrors(e => ({ ...e, [targetTool.id]: '' }))
    })
    const started = Date.now()
    try {
      await invoke('add_skill_to_agent', { skillName: skill.name, agentId: targetTool.id })
      capture('skill_cross_installed', { from: currentAgentId, to: targetTool.id, skill_name: skill.name })
    } catch (e) {
      setErrors(prev => ({ ...prev, [targetTool.id]: String(e) }))
      captureException(e)
    } finally {
      const elapsed = Date.now() - started
      if (elapsed < MIN_SPINNER_MS) await sleep(MIN_SPINNER_MS - elapsed)
      await onInstalled()
      setInstalling(null)
    }
  }

  const installedCount = installedAgents.filter(t =>
    t.skills.some(s => s.name.toLowerCase().trim() === skill.name.toLowerCase().trim())
  ).length

  return (
    <div className="px-4 py-3 border-b border-[var(--c-border)]">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center gap-1.5 w-full text-left mb-2 group"
      >
        <span className="text-[13px] font-semibold text-indigo-500">Installed on</span>
        <span className="text-[11px] text-[var(--c-text-3)]">({installedCount})</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`w-3 h-3 text-[var(--c-text-3)] ml-auto transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* Modal: no-cache last-provider disable warning — rendered outside collapse so it stays visible */}
      {pendingDisable && (
        <div className="mb-3 p-3 rounded-lg bg-amber-500/8 border border-amber-500/20 space-y-2">
          <p className="text-[12px] text-amber-400 leading-relaxed">
            <span className="font-semibold">No cached copy.</span> This is the last provider with <span className="font-mono">{skill.name}</span>. What would you like to do?
          </p>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setPendingDisable(null)
                await doToggle(pendingDisable.tool, pendingDisable.matchedSkill, false)
              }}
              className="flex-1 py-1.5 rounded text-[12px] font-medium bg-[var(--c-surface)] border border-[var(--c-border)] text-[var(--c-text-2)] hover:bg-[var(--c-hover)] transition-colors"
            >
              Disable temporarily
            </button>
            <button
              onClick={async () => {
                setPendingDisable(null)
                await handleDelete(pendingDisable.tool, pendingDisable.matchedSkill)
              }}
              className="flex-1 py-1.5 rounded text-[12px] font-medium bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors"
            >
              Remove completely
            </button>
          </div>
          <button
            onClick={() => setPendingDisable(null)}
            className="text-[11px] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {!collapsed && <>
      <div className="flex flex-col gap-1.5">
        {installedAgents.map(tool => {
          const noSupport = !tool.supportsSkills
          const hasConfigError = (tool.configErrors ?? []).length > 0
          const match = tool.skills.find(s => s.name.toLowerCase().trim() === skill.name.toLowerCase().trim())
          const isInstalled = !!match
          const isActive = match?.active ?? false
          const isDisabled = isInstalled && !isActive

          const isSelected = selectedAgentId === tool.id
          return (
            <div key={tool.id}>
              <div
                className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md border transition-colors ${
                  noSupport
                    ? 'border-[var(--c-border)] opacity-30 cursor-not-allowed'
                    : isSelected
                      ? 'border-indigo-500/40 bg-indigo-500/5'
                      : 'border-[var(--c-border)]'
                }`}
              >
                <button
                  onClick={() => !noSupport && isInstalled && onSelectForPath?.(tool)}
                  className={`flex items-center gap-2 flex-1 min-w-0 text-left ${isInstalled && !noSupport ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'cursor-default'}`}
                  disabled={noSupport || !isInstalled}
                >
                  <AgentAvatar tool={tool} />
                  <span className={`text-[13px] truncate ${noSupport ? 'text-[var(--c-text-3)]' : 'text-[var(--c-text-2)]'}`}>
                    {tool.name}
                  </span>
                </button>

                {noSupport && (
                  <span className="text-[11px] text-[var(--c-text-3)]">No skills support</span>
                )}

                {/* Config error: locked */}
                {!noSupport && hasConfigError && (
                  <span title="Config file has errors — restore a backup to re-enable toggles" className="text-[11px] text-amber-400/70 flex-shrink-0 cursor-default select-none">
                    locked
                  </span>
                )}

                {/* Active: Disable button */}
                {!noSupport && !hasConfigError && isInstalled && isActive && (
                  <button
                    onClick={() => handleToggle(tool, match, false)}
                    disabled={toggling === tool.id}
                    aria-label="Disable skill"
                    className="text-[11px] px-2 py-0.5 rounded text-[var(--c-text-3)] hover:text-[var(--c-text)] border border-[var(--c-border)] transition-colors disabled:opacity-40 flex-shrink-0"
                  >
                    {toggling === tool.id ? <MiniSpinner /> : 'Disable'}
                  </button>
                )}

                {/* Disabled: Enable + Delete buttons */}
                {!noSupport && !hasConfigError && isDisabled && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => doToggle(tool, match, true)}
                      disabled={toggling === tool.id || deleting === tool.id}
                      className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
                    >
                      {toggling === tool.id ? <MiniSpinner /> : 'Enable'}
                    </button>
                    <button
                      onClick={() => handleDelete(tool, match)}
                      disabled={deleting === tool.id || toggling === tool.id}
                      aria-label="Delete skill"
                      className="p-0.5 text-[var(--c-text-3)] hover:text-red-400 transition-colors disabled:opacity-40"
                    >
                      {deleting === tool.id ? <MiniSpinner /> : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                          className="w-3.5 h-3.5">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                          <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                      )}
                    </button>
                  </div>
                )}

                {/* Not installed: Add button (cache-aware) */}
                {!noSupport && !hasConfigError && !isInstalled && (
                  <button
                    onClick={() => handleAdd(tool)}
                    disabled={installing === tool.id}
                    className="flex items-center gap-1.5 text-[12px] font-medium px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors disabled:opacity-60 flex-shrink-0"
                  >
                    {installing === tool.id ? <><MiniSpinner />Adding…</> : 'Add'}
                  </button>
                )}
              </div>
              {errors[tool.id] && (
                <p className="text-[11px] text-red-400 px-2.5 mt-1">{errors[tool.id]}</p>
              )}
            </div>
          )
        })}
      </div>
      </>}
    </div>
  )
}

// ── MCP variant ──────────────────────────────────────────────────────────────

interface McpInstalledOnProps {
  mcp: McpServer
  currentAgentId: string
  allAgents: Agent[]
  onInstalled: () => void
  onBack?: () => void
}

export function McpInstalledOn({ mcp, currentAgentId, allAgents, onInstalled, onBack }: McpInstalledOnProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [envValues, setEnvValues] = useState<Record<string, string>>(() =>
    Object.fromEntries((mcp.secretKeyNames ?? []).map(k => [k, '']))
  )

  const installedAgents = allAgents.filter(t => t.installed)

  const handleToggle = async (targetTool: Agent, matchedMcp: McpServer) => {
    flushSync(() => setToggling(targetTool.id))
    const started = Date.now()
    try {
      await invoke('set_mcp_active', {
        agentId: targetTool.id,
        mcpName: matchedMcp.name,
        sourceId: matchedMcp.sourceId,
        active: !matchedMcp.active,
        extensionName: matchedMcp.extensionName ?? null,
      })
      capture('mcp_toggled', { tool_id: targetTool.id, mcp_name: matchedMcp.name, active: !matchedMcp.active })
    } catch (e) {
      setErrors(prev => ({ ...prev, [targetTool.id]: String(e) }))
      captureException(e)
    } finally {
      const elapsed = Date.now() - started
      if (elapsed < MIN_SPINNER_MS) await sleep(MIN_SPINNER_MS - elapsed)
      await onInstalled()
      setToggling(null)
    }
  }

  const handleRemove = async (targetTool: Agent, matchedMcp: McpServer) => {
    flushSync(() => setRemoving(targetTool.id))
    const started = Date.now()
    try {
      await invoke('remove_mcp', {
        agentId: targetTool.id,
        mcpName: matchedMcp.name,
        sourceId: matchedMcp.sourceId,
        command: matchedMcp.command || null,
        args: matchedMcp.args,
        url: matchedMcp.url ?? null,
      })
      capture('mcp_removed', { tool_id: targetTool.id, mcp_name: matchedMcp.name })
    } catch (e) {
      setErrors(prev => ({ ...prev, [targetTool.id]: String(e) }))
      captureException(e)
    } finally {
      const elapsed = Date.now() - started
      if (elapsed < MIN_SPINNER_MS) await sleep(MIN_SPINNER_MS - elapsed)
      await onInstalled()
      setRemoving(null)
      if (targetTool.id === currentAgentId) onBack?.()
    }
  }

  const handleAdd = async (targetTool: Agent) => {
    flushSync(() => {
      setInstalling(targetTool.id)
      setErrors(e => ({ ...e, [targetTool.id]: '' }))
    })
    const started = Date.now()
    try {
      const env = Object.fromEntries(
        Object.entries(envValues).filter(([, v]) => v.trim() !== '')
      )
      await invoke('add_mcp', {
        agentId: targetTool.id,
        name: mcp.name,
        command: mcp.command || null,
        args: mcp.args,
        url: mcp.url ?? null,
        env: Object.keys(env).length > 0 ? env : null,
      })
      capture('mcp_cross_installed', { from: currentAgentId, to: targetTool.id, mcp_name: mcp.name })
    } catch (e) {
      setErrors(prev => ({ ...prev, [targetTool.id]: String(e) }))
      captureException(e)
    } finally {
      const elapsed = Date.now() - started
      if (elapsed < MIN_SPINNER_MS) await sleep(MIN_SPINNER_MS - elapsed)
      await onInstalled()
      setInstalling(null)
    }
  }

  const hasSecrets = mcp.hasSecrets && mcp.secretKeyNames.length > 0

  const installedMcpCount = installedAgents.filter(t =>
    t.mcps.some(m => m.name.toLowerCase().trim() === mcp.name.toLowerCase().trim())
  ).length

  return (
    <div className="px-4 py-3 border-b border-[var(--c-border)]">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center gap-1.5 w-full text-left mb-2 group"
      >
        <span className="text-[13px] font-semibold text-violet-500">Installed on</span>
        <span className="text-[11px] text-[var(--c-text-3)]">({installedMcpCount})</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`w-3 h-3 text-[var(--c-text-3)] ml-auto transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {!collapsed && <>
      <div className="flex flex-col gap-1.5">
        {installedAgents.map(tool => {
          const noSupport = !tool.supportsMcps
          const hasConfigError = (tool.configErrors ?? []).length > 0
          const match = tool.mcps.find(m => m.name.toLowerCase().trim() === mcp.name.toLowerCase().trim())
          const isInstalled = !!match

          return (
            <div key={tool.id}>
              <div className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md border border-[var(--c-border)] transition-colors ${noSupport ? 'opacity-30 cursor-not-allowed' : ''}`}>
                <AgentAvatar tool={tool} />
                <span className={`text-[13px] flex-1 truncate cursor-default select-none ${noSupport ? 'text-[var(--c-text-3)]' : 'text-[var(--c-text-2)]'}`}>{tool.name}</span>

                {noSupport && (
                  <span className="text-[11px] text-[var(--c-text-3)]">No MCP support</span>
                )}

                {/* Config error: locked */}
                {!noSupport && hasConfigError && (
                  <span title="Config file has errors — restore a backup to re-enable toggles" className="text-[11px] text-amber-400/70 flex-shrink-0 cursor-default select-none">
                    locked
                  </span>
                )}

                {!noSupport && !hasConfigError && isInstalled && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {match.active ? (
                      <button
                        onClick={() => handleToggle(tool, match)}
                        disabled={toggling === tool.id || removing === tool.id}
                        aria-label="Disable MCP"
                        className="text-[11px] px-2 py-0.5 rounded text-[var(--c-text-3)] hover:text-[var(--c-text)] border border-[var(--c-border)] transition-colors disabled:opacity-40"
                      >
                        {toggling === tool.id ? <MiniSpinner /> : 'Disable'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleToggle(tool, match)}
                        disabled={toggling === tool.id || removing === tool.id}
                        aria-label="Enable MCP"
                        className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
                      >
                        {toggling === tool.id ? <MiniSpinner /> : 'Enable'}
                      </button>
                    )}
                    <button
                      onClick={() => handleRemove(tool, match)}
                      disabled={removing === tool.id || toggling === tool.id}
                      aria-label="Remove MCP"
                      className="p-0.5 text-[var(--c-text-3)] hover:text-red-400 transition-colors disabled:opacity-40"
                    >
                      {removing === tool.id ? (
                        <MiniSpinner />
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                          className="w-3.5 h-3.5">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                          <path d="M10 11v6"/><path d="M14 11v6"/>
                          <path d="M9 6V4h6v2"/>
                        </svg>
                      )}
                    </button>
                  </div>
                )}

                {!noSupport && !hasConfigError && !isInstalled && (
                  <button
                    onClick={() => handleAdd(tool)}
                    disabled={installing === tool.id}
                    className="flex items-center gap-1.5 text-[12px] font-medium px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-colors disabled:opacity-60 flex-shrink-0"
                  >
                    {installing === tool.id ? (
                      <><MiniSpinner />Adding…</>
                    ) : 'Add'}
                  </button>
                )}
              </div>
              {errors[tool.id] && (
                <p className="text-[11px] text-red-400 px-2.5 mt-1">{errors[tool.id]}</p>
              )}
            </div>
          )
        })}
      </div>

      {hasSecrets && (
        <div className="mt-3 px-2.5 py-2.5 rounded-md bg-amber-500/5 border border-amber-500/15 space-y-2">
          <div className="flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="w-3.5 h-3.5 text-amber-400 flex-shrink-0">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <p className="text-[12px] font-semibold text-amber-400">Auth required</p>
          </div>
          <p className="text-[11px] text-amber-400/70 leading-relaxed">
            Fill in values to write them to the config on Add. Leave blank to skip.
          </p>
          <div className="space-y-1.5">
            {mcp.secretKeyNames.map(key => (
              <div key={key}>
                <label className="block text-[10px] font-mono text-amber-400/60 mb-0.5">{key}</label>
                <input
                  type="password"
                  value={envValues[key] ?? ''}
                  onChange={e => setEnvValues(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={key}
                  autoComplete="off"
                  className="w-full bg-[var(--c-bg)] border border-amber-500/20 rounded px-2 py-1 text-[12px] font-mono text-[var(--c-text)] placeholder-amber-500/20 outline-none focus:border-amber-400/40 transition-colors"
                />
              </div>
            ))}
          </div>
        </div>
      )}
      </>}
    </div>
  )
}
