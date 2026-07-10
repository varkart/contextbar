import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useViewRouter, type View } from '../useViewRouter'
import { useNotifications } from '../useNotifications'
import { useUpdateCheck } from '../useUpdateCheck'
import { searchAgents } from '../search'
import type { ThemePreference } from '../useTheme'
import type { Agent } from '../types'
import Header from '../components/Header'
import ViewManager from '../components/views/ViewManager'

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
  const { view, goTo, escape, refreshSelected, openAgentsList, openSkillsPage, openMcpsPage } = routerProps

  const { notifications, fetchNotifications } = useNotifications()
  const [version, setVersion] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    invoke<string>('get_version').then(setVersion).catch(() => {})
  }, [])
  const updateInfo = useUpdateCheck(version)

  const handleFetchTools = useCallback(async () => {
    const fresh = await fetchAgents()
    refreshSelected(fresh)
  }, [fetchAgents, refreshSelected])

  const searchResults = useMemo(() => searchAgents(installedAgents, query), [installedAgents, query])

  // Sidebar section changed while mounted → jump to that section's root view.
  const mountedRef = useRef(false)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    if (section === 'agents') openAgentsList()
    else if (section === 'skills') openSkillsPage()
    else if (section === 'mcps') openMcpsPage()
    else goTo(section)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section])

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
