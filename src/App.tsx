import { useState, useEffect, useCallback, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { searchAgents } from './search'
import { useUpdateCheck } from './useUpdateCheck'
import { useAgentsDiff } from './useAgentsDiff'
import { useTheme } from './useTheme'
import { useAgents } from './useAgents'
import { useNotifications } from './useNotifications'
import { useViewRouter } from './useViewRouter'
import { capture } from './analytics'
import ViewManager from './components/views/ViewManager'
import SplashScreen from './components/SplashScreen'
import PermissionsSetupScreen from './components/PermissionsSetupScreen'
import Header from './components/Header'
import Footer from './components/Footer'

const isE2E = !!(globalThis as Record<string, unknown>).__skipSplash

export default function App() {
  const routerProps = useViewRouter()
  const { view, selectedAgent, selectedSkill, selectedMcp, skillBackView, mcpBackView, allSkillsBackView, allMcpsBackView, refreshSelected, escape, goTo, openAgentsList } = routerProps

  const [version, setVersion] = useState('')
  const { theme, setTheme } = useTheme()
  const [splashDismissed, setSplashDismissed] = useState(isE2E)
  const [permissionsSetupDone, setPermissionsSetupDone] = useState(
    isE2E || !!localStorage.getItem('permissions_setup_v1')
  )
  const [backendReady, setBackendReady] = useState(false)
  const [query, setQuery] = useState('')

  const { agents, loading, cloudSyncing, lastUpdated, fetchAgents } = useAgents()
  const { notifications, fetchNotifications } = useNotifications()

  const handleFetchTools = useCallback(async () => {
    const fresh = await fetchAgents()
    refreshSelected(fresh)
  }, [fetchAgents, refreshSelected])

  useEffect(() => {
    invoke<string>('get_version').then(setVersion).catch(() => setVersion('0.5.0'))
  }, [])

  useEffect(() => {
    import('@tauri-apps/plugin-notification').then(({ isPermissionGranted, requestPermission }) => {
      isPermissionGranted().then(granted => {
        if (!granted) requestPermission().catch(() => {})
      }).catch(() => {})
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const splash = document.getElementById('splash')
    if (splash) {
      if (isE2E) {
        splash.remove()
      } else {
        splash.classList.add('fade-out')
        splash.addEventListener('transitionend', () => splash.remove(), { once: true })
      }
    }
  }, [])

  useEffect(() => {
    if (!loading && !backendReady) {
      setBackendReady(true)
    }
  }, [loading, backendReady])

  const updateInfo = useUpdateCheck(version)
  useAgentsDiff()

  useEffect(() => {
    if (view === 'settings') capture('settings_opened')
  }, [view])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') capture('app_opened')
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') escape() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [escape])

  const installedAgents = useMemo(() => agents.filter(t => t.installed), [agents])
  const searchResults = useMemo(() => searchAgents(installedAgents, query), [installedAgents, query])

  return (
    <div className="w-[380px] h-[520px] bg-[var(--c-bg)] text-[var(--c-text)] flex flex-col overflow-hidden">
      {!splashDismissed && (
        <SplashScreen backendReady={backendReady} onDismiss={() => setSplashDismissed(true)} />
      )}
      {splashDismissed && !permissionsSetupDone && (
        <PermissionsSetupScreen onDone={() => {
          localStorage.setItem('permissions_setup_v1', '1')
          setPermissionsSetupDone(true)
        }} />
      )}
      <Header
        view={view}
        selectedAgent={selectedAgent}
        selectedSkill={selectedSkill}
        selectedMcp={selectedMcp}
        skillBackView={skillBackView}
        mcpBackView={mcpBackView}
        allSkillsBackView={allSkillsBackView}
        allMcpsBackView={allMcpsBackView}
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
      <Footer
        lastUpdated={lastUpdated}
        onRefresh={handleFetchTools}
        loading={loading}
        cloudSyncing={cloudSyncing}
      />
    </div>
  )
}
