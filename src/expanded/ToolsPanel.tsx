import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useViewRouter, type View } from '../useViewRouter'
import { useNotifications } from '../useNotifications'
import { useUpdateCheck } from '../useUpdateCheck'
import { searchAgents } from '../search'
import type { ThemePreference } from '../useTheme'
import type { Agent, SessionInsights, TokenPoint } from '../types'
import { formatTokens } from '../components/history/SessionStats'
import Header from '../components/Header'
import ViewManager from '../components/views/ViewManager'
import { Tile, TileRow } from './InsightTiles'
import { Collapsible, HBar, TokenTrend, shortModel } from './InsightWidgets'
import { agentColor } from '../constants/agentColors'

const MODEL_COLORS = ['#6366f1', '#e8a94a', '#d98fd9', '#2dd4bf', '#fb7185', '#8fbf6b']

export type ToolsSection = 'agents' | 'skills' | 'mcps' | 'settings' | 'notifications'

const ROOT_VIEW: Record<ToolsSection, View> = {
  agents: 'agents-list',
  skills: 'all-skills-list',
  mcps: 'all-mcps-list',
  settings: 'settings',
  notifications: 'notifications',
}

interface ToolsPanelProps {
  section: ToolsSection
  goHome: () => void
  agents: Agent[]
  installedAgents: Agent[]
  loading: boolean
  cloudSyncing: boolean
  lastUpdated: Date | null
  fetchAgents: () => Promise<Agent[]>
  theme: ThemePreference
  setTheme: (t: ThemePreference) => void
}

/**
 * Embeds the popover's full view stack (agents, skills, MCPs, settings,
 * notifications — including detail views, toggles and add flows) inside the
 * expanded window, so both windows share one implementation.
 */
export default function ToolsPanel({
  section,
  goHome,
  agents,
  installedAgents,
  loading,
  cloudSyncing,
  lastUpdated,
  fetchAgents,
  theme,
  setTheme,
}: ToolsPanelProps) {
  const routerProps = useViewRouter({
    syncHash: false,
    onExit: goHome,
    initialView: ROOT_VIEW[section],
  })
  const { view, goTo, resetTo, escape, refreshSelected, openAgentsList } = routerProps

  const { notifications, fetchNotifications } = useNotifications()
  const [version, setVersion] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    invoke<string>('get_version').then(setVersion).catch(() => {})
  }, [])
  const updateInfo = useUpdateCheck(version)

  // Usage insights (30d) for the contextual strips on section roots, plus a
  // longer token series (6 months) for the agent-page trend chart.
  const [usage, setUsage] = useState<SessionInsights | null>(null)
  const [tokenPoints, setTokenPoints] = useState<TokenPoint[]>([])
  const fetchUsage = useCallback(() => {
    invoke<SessionInsights>('get_session_insights', { sinceMs: Date.now() - 30 * 86_400_000 })
      .then(setUsage)
      .catch(() => {})
    invoke<TokenPoint[]>('get_token_activity', { sinceMs: Date.now() - 183 * 86_400_000 })
      .then(setTokenPoints)
      .catch(() => {})
  }, [])
  useEffect(() => {
    invoke('warm_session_stats').catch(() => {})
    fetchUsage()
    const unlisten = listen('session-insights-updated', fetchUsage)
    return () => { unlisten.then(fn => fn()) }
  }, [fetchUsage])

  const handleFetchTools = useCallback(async () => {
    const fresh = await fetchAgents()
    refreshSelected(fresh)
  }, [fetchAgents, refreshSelected])

  const searchResults = useMemo(() => searchAgents(installedAgents, query), [installedAgents, query])

  const agentInsights = useMemo(() => {
    const skills = installedAgents.flatMap(a => a.skills)
    const mcps = installedAgents.flatMap(a => a.mcps)
    return {
      installed: installedAgents.length,
      detected: agents.length,
      skillsActive: skills.filter(s => s.active).length,
      skillsTotal: skills.length,
      mcpsActive: mcps.filter(m => m.active).length,
      mcpsTotal: mcps.length,
      configErrors: installedAgents.filter(a => a.error || (a.configErrors?.length ?? 0) > 0).length,
    }
  }, [agents, installedAgents])

  // Sidebar section changed while mounted → fresh stack at that section's root.
  const mountedRef = useRef(false)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    resetTo(ROOT_VIEW[section])
  }, [section, resetTo])

  // The popover's escape chain bottoms out at its 'main' home view, which has
  // no place in the expanded window — treat it as leaving the panel.
  useEffect(() => {
    if (view === 'main') goHome()
  }, [view, goHome])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') escape()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [escape])

  const detailAgent = view === 'agent-detail' ? routerProps.selectedAgent : null

  return (
    <div className="flex-1 min-w-0 flex overflow-hidden">
      <div className="w-full h-full flex flex-col overflow-hidden">
        <Header
          view={view}
          selectedAgent={routerProps.selectedAgent}
          selectedSkill={routerProps.selectedSkill}
          selectedMcp={routerProps.selectedMcp}
          skillBackView={routerProps.skillBackView}
          mcpBackView={routerProps.mcpBackView}
          allSkillsBackView={routerProps.allSkillsBackView}
          allMcpsBackView={routerProps.allMcpsBackView}
          goTo={goTo}
          openAgentsList={openAgentsList}
          updateAvailable={!!updateInfo}
          notificationCount={notifications.length}
          onSettingsClick={() => goTo('settings')}
          onNotificationsClick={() => goTo('notifications')}
        />
        {view === 'agents-list' && !loading && (
          <div className="px-3 pt-3 flex-shrink-0">
            <TileRow>
              <Tile value={`${agentInsights.installed}/${agentInsights.detected}`} label="Installed" hint="Installed of detected agents" />
              <Tile
                value={`${agentInsights.skillsActive}/${agentInsights.skillsTotal}`}
                label="Skills active"
                color="text-emerald-400"
              />
              <Tile
                value={`${agentInsights.mcpsActive}/${agentInsights.mcpsTotal}`}
                label="MCPs active"
                color="text-[var(--c-accent)]"
              />
              <Tile
                value={agentInsights.configErrors}
                label="Config errors"
                color={agentInsights.configErrors > 0 ? 'text-rose-400' : 'text-[var(--c-text-3)]'}
              />
            </TileRow>
            {usage && usage.perModel.length > 0 && (
              <div className="mt-2">
                <Collapsible id="agents-usage" label="Usage insights — model mix, last 30 days">
                  <div className="flex h-2.5 rounded-md overflow-hidden mb-1.5">
                    {usage.perModel.map((m, i) => (
                      <div
                        key={m.model}
                        title={`${shortModel(m.model)}: ${m.sessions} sessions`}
                        style={{ width: `${Math.max(2, (m.sessions / Math.max(1, usage.perModel.reduce((n, x) => n + x.sessions, 0))) * 100)}%`, background: MODEL_COLORS[i % MODEL_COLORS.length] }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-3 flex-wrap text-[10.5px] text-[var(--c-text-3)]">
                    {usage.perModel.map((m, i) => (
                      <span key={m.model} className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm" style={{ background: MODEL_COLORS[i % MODEL_COLORS.length] }} />
                        {shortModel(m.model)} · {m.sessions} sessions
                      </span>
                    ))}
                  </div>
                </Collapsible>
              </div>
            )}
          </div>
        )}
        {view === 'all-skills-list' && usage && (
          <div className="px-3 pt-3 flex-shrink-0">
            <Collapsible id="skills-usage" label="Usage insights — how often skills run, last 30 days">
              <TileRow className="mb-2">
                <Tile
                  value={usage.skillCounts.reduce((n, s) => n + s.count, 0)}
                  label="Skill runs"
                  color="text-[var(--c-accent)]"
                  hint="Skill tool invocations in Claude Code sessions"
                />
                <Tile value={usage.skillCounts.length} label="Skills used" />
                <Tile value={agentInsights.skillsTotal} label="Installed" />
                <Tile
                  value={Math.max(0, new Set(installedAgents.flatMap(a => a.skills.map(s => s.name.toLowerCase()))).size - usage.skillCounts.length)}
                  label="Never ran"
                  color="text-amber-400"
                  hint="Installed skills with no invocations in the last 30 days"
                />
              </TileRow>
              {usage.skillCounts.length > 0 && (
                <>
                  <p className="text-[10px] font-mono text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">Most used skills</p>
                  {usage.skillCounts.slice(0, 5).map(s => (
                    <HBar
                      key={s.name}
                      name={s.name}
                      value={`${s.count} run${s.count === 1 ? '' : 's'}`}
                      pct={(s.count / Math.max(1, usage.skillCounts[0].count)) * 100}
                      color="var(--c-accent)"
                    />
                  ))}
                </>
              )}
            </Collapsible>
          </div>
        )}
        {detailAgent && (
          <div className="flex items-center gap-3 px-4 pt-4 pb-1 flex-shrink-0">
            <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg text-[16px] font-bold flex-shrink-0 ${agentColor(detailAgent.id).bg} ${agentColor(detailAgent.id).text}`}>
              {detailAgent.name[0].toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="text-[20px] font-bold tracking-tight leading-tight truncate">{detailAgent.name}</h1>
              <p className="text-[11px] text-[var(--c-text-3)]">
                {[
                  detailAgent.version && `v${detailAgent.version.replace(/^v/, '')}`,
                  detailAgent.skills.length > 0 && `${detailAgent.skills.length} skills`,
                  detailAgent.mcps.length > 0 && `${detailAgent.mcps.length} MCPs`,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
            {(detailAgent.configFiles ?? []).length > 0 && (
              <button
                onClick={() => goTo('config-backup')}
                title="Config backups"
                className="ml-auto text-[11px] px-2.5 py-1 rounded-md border border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors flex-shrink-0"
              >
                Backups
              </button>
            )}
          </div>
        )}
        {view === 'agent-detail' && routerProps.selectedAgent?.id === 'claude' && usage && usage.sessionsAnalyzed > 0 && (
          <div className="px-3 pt-2 flex-shrink-0">
            <Collapsible id="agent-claude-usage" label="Usage insights — tokens, cost and tools, last 30 days">
              <TileRow className="mb-2">
                <Tile value={formatTokens(usage.inputTokens + usage.outputTokens)} label="Tokens" color="text-[var(--c-accent)]" />
                <Tile value={`$${usage.estCostUsd.toFixed(2)}`} label="Est. cost" color="text-amber-400" hint="Approximate — public API list prices; cache reads discounted" />
                <Tile value={usage.perModel[0] ? shortModel(usage.perModel[0].model) : '—'} label="Top model" />
                <Tile value={usage.perProject.length} label="Projects" />
                <Tile value={usage.mcpToolCounts.reduce((n, m) => n + m.count, 0)} label="MCP calls" color="text-emerald-400" />
                <Tile value={usage.avgToolCalls.toFixed(0)} label="Avg tool calls" />
              </TileRow>
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-mono text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">Token trend</p>
                  <TokenTrend points={tokenPoints} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-mono text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">Top tools</p>
                  {usage.toolCounts.slice(0, 4).map(t => (
                    <HBar
                      key={t.name}
                      name={t.name}
                      value={`${t.count.toLocaleString()} calls`}
                      pct={(t.count / Math.max(1, usage.toolCounts[0].count)) * 100}
                      color="var(--c-accent)"
                    />
                  ))}
                  <p className="text-[10px] font-mono text-[var(--c-text-3)] uppercase tracking-wider mt-2 mb-1">Cost by model</p>
                  {usage.perModel.slice(0, 3).map(m => (
                    <div key={m.model} className="flex justify-between text-[10.5px] py-0.5">
                      <span className="text-[var(--c-text-2)]">{shortModel(m.model)} · {m.sessions} sessions</span>
                      <span className="font-mono text-[var(--c-text-3)]">{m.estCostUsd != null ? `$${m.estCostUsd.toFixed(2)}` : '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Collapsible>
          </div>
        )}
        {view === 'all-mcps-list' && usage && (
          <div className="px-3 pt-3 flex-shrink-0">
            <Collapsible id="mcps-usage" label="Usage insights — which servers get called, last 30 days">
              <TileRow className="mb-2">
                <Tile value={agentInsights.mcpsTotal} label="Configured" />
                <Tile value={usage.mcpToolCounts.length} label="Servers called" color="text-[var(--c-accent)]" />
                <Tile
                  value={usage.mcpToolCounts.reduce((n, m) => n + m.count, 0)}
                  label="Total calls"
                  color="text-emerald-400"
                />
              </TileRow>
              {usage.mcpToolCounts.length > 0 && (
                <>
                  <p className="text-[10px] font-mono text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">Most called servers</p>
                  {usage.mcpToolCounts.slice(0, 5).map(m => (
                    <HBar
                      key={m.name}
                      name={m.name}
                      value={`${m.count} call${m.count === 1 ? '' : 's'}`}
                      pct={(m.count / Math.max(1, usage.mcpToolCounts[0].count)) * 100}
                      color="#2dd4bf"
                    />
                  ))}
                </>
              )}
            </Collapsible>
          </div>
        )}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <ViewManager
            {...routerProps}
            query={query}
            setQuery={setQuery}
            loading={loading}
            agents={agents}
            installedAgents={installedAgents}
            searchResults={searchResults}
            notifications={notifications}
            updateInfo={updateInfo}
            lastUpdated={lastUpdated}
            cloudSyncing={cloudSyncing}
            handleFetchTools={handleFetchTools}
            theme={theme}
            setTheme={setTheme}
            fetchNotifications={fetchNotifications}
            hideAgentHeader={true}
          />
        </div>
      </div>
    </div>
  )
}
