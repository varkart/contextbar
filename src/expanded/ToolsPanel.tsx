import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useViewRouter, type View } from '../useViewRouter'
import { useNotifications } from '../useNotifications'
import { useUpdateCheck } from '../useUpdateCheck'
import { searchAgents } from '../search'
import type { ThemePreference } from '../useTheme'
import type { Agent, SessionInsights } from '../types'
import Header from '../components/Header'
import ViewManager from '../components/views/ViewManager'
import { Tile, TileRow } from './InsightTiles'
import { HBar } from './InsightWidgets'
import { shortModel } from './InsightsSection'

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

  // Usage insights (30d) for the contextual strips on section roots.
  const [usage, setUsage] = useState<SessionInsights | null>(null)
  const fetchUsage = useCallback(() => {
    invoke<SessionInsights>('get_session_insights', { sinceMs: Date.now() - 30 * 86_400_000 })
      .then(setUsage)
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

  return (
    <div className="flex-1 min-w-0 flex justify-center overflow-hidden">
      <div className="w-full max-w-3xl h-full flex flex-col overflow-hidden border-x border-[var(--c-border)]">
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
              <div className="mt-2 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 px-3.5 py-2.5">
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
                  <span className="uppercase tracking-wider font-mono text-[9.5px] self-center">Model mix 30d</span>
                  {usage.perModel.map((m, i) => (
                    <span key={m.model} className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-sm" style={{ background: MODEL_COLORS[i % MODEL_COLORS.length] }} />
                      {shortModel(m.model)} {m.sessions}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {view === 'all-skills-list' && usage && (
          <div className="px-3 pt-3 flex-shrink-0">
            <TileRow>
              <Tile
                value={usage.skillCounts.reduce((n, s) => n + s.count, 0)}
                label="Skill runs 30d"
                color="text-[var(--c-accent)]"
                hint="Skill tool invocations in Claude Code sessions"
              />
              <Tile value={usage.skillCounts.length} label="Skills used" />
              <Tile value={agentInsights.skillsTotal} label="Installed" />
              <Tile
                value={Math.max(0, new Set(installedAgents.flatMap(a => a.skills.map(s => s.name.toLowerCase()))).size - usage.skillCounts.length)}
                label="Unused 30d"
                color="text-amber-400"
                hint="Installed skills with no invocations in the last 30 days"
              />
            </TileRow>
            {usage.skillCounts.length > 0 && (
              <div className="mt-2 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 px-3.5 pt-2.5 pb-1.5">
                {usage.skillCounts.slice(0, 5).map(s => (
                  <HBar
                    key={s.name}
                    name={s.name}
                    value={String(s.count)}
                    pct={(s.count / Math.max(1, usage.skillCounts[0].count)) * 100}
                    color="var(--c-accent)"
                  />
                ))}
              </div>
            )}
          </div>
        )}
        {view === 'all-mcps-list' && usage && (
          <div className="px-3 pt-3 flex-shrink-0">
            <TileRow>
              <Tile value={agentInsights.mcpsTotal} label="Configured" />
              <Tile value={usage.mcpToolCounts.length} label="Servers called 30d" color="text-[var(--c-accent)]" />
              <Tile
                value={usage.mcpToolCounts.reduce((n, m) => n + m.count, 0)}
                label="MCP calls 30d"
                color="text-emerald-400"
              />
            </TileRow>
            {usage.mcpToolCounts.length > 0 && (
              <div className="mt-2 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 px-3.5 pt-2.5 pb-1.5">
                {usage.mcpToolCounts.slice(0, 5).map(m => (
                  <HBar
                    key={m.name}
                    name={m.name}
                    value={String(m.count)}
                    pct={(m.count / Math.max(1, usage.mcpToolCounts[0].count)) * 100}
                    color="#2dd4bf"
                  />
                ))}
              </div>
            )}
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
          />
        </div>
      </div>
    </div>
  )
}
