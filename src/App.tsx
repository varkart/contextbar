import { useState, useEffect, useCallback, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { searchTools } from './search'
import { useUpdateCheck } from './useUpdateCheck'
import { useToolsDiff } from './useToolsDiff'
import { useTheme, type ThemePreference } from './useTheme'
import { useTools } from './useTools'
import { useNotifications } from './useNotifications'
import { useViewRouter } from './useViewRouter'
import { capture } from './analytics'
import McpDetailPanel from './components/McpDetailPanel'
import PermissionsDetailPanel from './components/PermissionsDetailPanel'
import SkillsListPanel from './components/SkillsListPanel'
import McpsListPanel from './components/McpsListPanel'
import Header from './components/Header'
import SearchBar from './components/SearchBar'
import ToolRow from './components/ToolRow'
import Footer from './components/Footer'
import Settings from './components/Settings'
import SkillDetailPanel from './components/SkillDetailPanel'
import ToolDetailPage from './components/ToolDetailPage'
import NotificationsPanel from './components/NotificationsPanel'
import SplashScreen from './components/SplashScreen'
import LogsPanel from './components/LogsPanel'

const SPLASH_BORN = Date.now()
const SPLASH_MIN_MS = 5000
const isE2E = !!(globalThis as Record<string, unknown>).__skipSplash

function SkeletonRows() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <div key={i} className="px-4 py-2.5 animate-pulse">
          <div className="flex items-center gap-2.5">
            <div className="w-[7px] h-[7px] rounded-full bg-[var(--c-skeleton)]" />
            <div className="w-[20px] h-[20px] rounded bg-[var(--c-skeleton)]" />
            <div className="h-3 bg-[var(--c-skeleton)] rounded w-28" />
          </div>
        </div>
      ))}
    </>
  )
}

export default function App() {
  const {
    view,
    selectedTool,
    selectedSkill,
    selectedMcp,
    selectTool,
    selectSkill,
    selectMcp,
    selectPermissions,
    openSkillsPage,
    openMcpsPage,
    goTo,
    escape,
    refreshSelected,
  } = useViewRouter()

  const [version, setVersion] = useState('')
  const { theme, setTheme } = useTheme()
  const [splashDismissed, setSplashDismissed] = useState(isE2E)
  const [backendReady, setBackendReady] = useState(false)
  const [query, setQuery] = useState('')

  const { tools, loading, cloudSyncing, lastUpdated, fetchTools } = useTools()
  const { notifications, fetchNotifications } = useNotifications()

  const handleFetchTools = useCallback(async () => {
    const fresh = await fetchTools()
    refreshSelected(fresh)
  }, [fetchTools, refreshSelected])

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
      splash.classList.add('fade-out')
      splash.addEventListener('transitionend', () => splash.remove(), { once: true })
    }
  }, [])

  useEffect(() => {
    if (!loading && !backendReady) {
      setBackendReady(true)
    }
  }, [loading, backendReady])

  useEffect(() => {
    if (!backendReady || isE2E) return
    const remaining = Math.max(0, SPLASH_MIN_MS - (Date.now() - SPLASH_BORN))
    const t = setTimeout(() => setSplashDismissed(true), remaining)
    return () => clearTimeout(t)
  }, [backendReady])

  const updateInfo = useUpdateCheck(version)
  useToolsDiff()

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

  const installedTools = useMemo(() => tools.filter(t => t.installed), [tools])
  const searchResults = useMemo(() => searchTools(installedTools, query), [installedTools, query])

  return (
    <div className="w-[380px] h-[520px] bg-[var(--c-bg)] text-[var(--c-text)] flex flex-col overflow-hidden select-none">
      {!splashDismissed && (
        <SplashScreen backendReady={backendReady} onDismiss={() => setSplashDismissed(true)} />
      )}
      {view === 'logs' ? (
        <LogsPanel onBack={() => goTo('main')} />
      ) : view === 'notifications' ? (
        <NotificationsPanel
          notifications={notifications}
          onBack={() => goTo('main')}
          onChanged={fetchNotifications}
        />
      ) : view === 'skills-list' && selectedTool ? (
        <SkillsListPanel
          tool={selectedTool}
          onBack={() => goTo('tool-detail')}
          onSelectSkill={skill => selectSkill(skill, 'skills-list')}
        />
      ) : view === 'mcps-list' && selectedTool ? (
        <McpsListPanel
          tool={selectedTool}
          onBack={() => goTo('tool-detail')}
          onSelectMcp={mcp => selectMcp(mcp, 'mcps-list')}
          onAdded={handleFetchTools}
        />
      ) : view === 'skill-detail' && selectedSkill ? (
        <SkillDetailPanel
          skill={selectedSkill}
          toolName={selectedTool?.name}
          toolId={selectedTool?.id}
          onToggled={handleFetchTools}
          onBack={() => escape()}
        />
      ) : view === 'mcp-detail' && selectedMcp ? (
        <McpDetailPanel
          mcp={selectedMcp}
          toolName={selectedTool?.name}
          toolId={selectedTool?.id}
          onToggled={handleFetchTools}
          onRemoved={handleFetchTools}
          onBack={() => escape()}
        />
      ) : view === 'permissions-detail' && selectedTool ? (
        <PermissionsDetailPanel
          toolId={selectedTool.id}
          toolName={selectedTool.name}
          onBack={() => goTo('tool-detail')}
        />
      ) : view === 'tool-detail' && selectedTool ? (
        <ToolDetailPage
          tool={selectedTool}
          onBack={() => goTo('main')}
          onSelectSkill={skill => selectSkill(skill, 'tool-detail')}
          onSelectMcp={mcp => selectMcp(mcp, 'tool-detail')}
          onSelectPermissions={selectPermissions}
          onOpenSkillsPage={openSkillsPage}
          onOpenMcpsPage={openMcpsPage}
          onToolUpdated={handleFetchTools}
          query={query || undefined}
          matchedSkills={searchResults.find(r => r.tool.id === selectedTool.id)?.matchedSkills}
          matchedMcps={searchResults.find(r => r.tool.id === selectedTool.id)?.matchedMcps}
        />
      ) : view === 'settings' ? (
        <Settings
          onBack={() => goTo('main')}
          updateInfo={updateInfo}
          theme={theme}
          onThemeChange={(t: ThemePreference) => setTheme(t)}
          onOpenLogs={() => goTo('logs')}
        />
      ) : (
        <>
          <Header
            onSettingsClick={() => goTo('settings')}
            onNotificationsClick={() => goTo('notifications')}
            updateAvailable={!!updateInfo}
            notificationCount={notifications.length}
          />
          <SearchBar value={query} onChange={setQuery} />
          <div className="flex-1 overflow-y-auto divide-y divide-[var(--c-border-sub)]">
            {loading && tools.length === 0 ? (
              <SkeletonRows />
            ) : searchResults.length === 0 && query ? (
              <div className="px-4 py-8 text-center">
                <p className="text-[14px] text-[var(--c-text-3)]">No results for "{query}"</p>
              </div>
            ) : !loading && installedTools.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--c-surface)] flex items-center justify-center mb-1">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    className="w-5 h-5 text-[var(--c-text-3)]">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </div>
                <p className="text-[15px] font-semibold text-[var(--c-text)]">No AI tools detected</p>
                <p className="text-[13px] text-[var(--c-text-3)] leading-relaxed max-w-[240px]">
                  Install Claude Code, Cursor, Gemini CLI, or GitHub Copilot and LLM Manager will pick them up automatically.
                </p>
              </div>
            ) : (
              searchResults.map(({ tool }) => (
                <ToolRow
                  key={tool.id}
                  tool={tool}
                  onSelectTool={selectTool}
                />
            ))
            )}
          </div>
          <Footer lastUpdated={lastUpdated} onRefresh={handleFetchTools} loading={loading} cloudSyncing={cloudSyncing} />
        </>
      )}
    </div>
  )
}
