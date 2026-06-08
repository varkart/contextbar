import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { AiTool, Skill, McpServer } from './types'
import { searchTools } from './search'
import { useUpdateCheck } from './useUpdateCheck'
import { useToolsDiff } from './useToolsDiff'
import { useTheme, type ThemePreference } from './useTheme'
import { capture } from './analytics'
import McpDetailPanel from './components/McpDetailPanel'
import Header from './components/Header'
import SearchBar from './components/SearchBar'
import ToolRow from './components/ToolRow'
import Footer from './components/Footer'
import Settings from './components/Settings'
import SkillDetailPanel from './components/SkillDetailPanel'
import ToolDetailPage from './components/ToolDetailPage'

type View = 'main' | 'settings' | 'tool-detail' | 'skill-detail' | 'mcp-detail'

function useView(): [View, (v: View) => void] {
  const [view, setViewState] = useState<View>(() =>
    window.location.hash === '#settings' ? 'settings' : 'main'
  )
  const setView = useCallback((v: View) => {
    window.location.hash = v === 'settings' ? 'settings' : ''
    setViewState(v)
  }, [])
  return [view, setView]
}

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
  const [view, setView] = useView()
  const [tools, setTools] = useState<AiTool[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [query, setQuery] = useState('')
  const [version, setVersion] = useState('')
  const { theme, setTheme } = useTheme()
  const [selectedTool, setSelectedTool] = useState<AiTool | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [selectedMcp, setSelectedMcp] = useState<McpServer | null>(null)

  const handleSelectTool = useCallback((tool: AiTool) => {
    setSelectedTool(tool)
    setView('tool-detail')
    capture('tool_detail_viewed', { tool_id: tool.id })
  }, [setView])

  const handleSelectSkill = useCallback((skill: Skill) => {
    setSelectedSkill(skill)
    setView('skill-detail')
    capture('skill_detail_viewed', { skill_name: skill.name })
  }, [setView])

  const handleSelectMcp = useCallback((mcp: McpServer) => {
    setSelectedMcp(mcp)
    setView('mcp-detail')
    capture('mcp_detail_viewed', { mcp_name: mcp.name })
  }, [setView])

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

  const updateInfo = useUpdateCheck(version)
  useToolsDiff()

  const fetchTools = useCallback(async () => {
    setLoading(true)
    try {
      const result = await invoke<AiTool[]>('get_tools')
      setTools(result)
      setLastUpdated(new Date())
      // Keep selectedTool in sync so ToolDetailPage reflects updated skill states
      setSelectedTool(prev => prev ? (result.find(t => t.id === prev.id) ?? prev) : null)
      capture('tools_loaded', {
        tool_count: result.length,
        installed_count: result.filter(t => t.installed).length,
        tools_detected: result.filter(t => t.installed).map(t => t.id),
      })
    } catch (e) {
      console.error('get_tools failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTools() }, [fetchTools])

  useEffect(() => {
    const unlisten = listen('tools-changed', () => { fetchTools() })
    return () => { unlisten.then(fn => fn()) }
  }, [fetchTools])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') capture('app_opened')
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    if (view === 'settings') capture('settings_opened')
  }, [view])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (view === 'skill-detail' || view === 'mcp-detail') setView(selectedTool ? 'tool-detail' : 'main')
        else if (view === 'tool-detail') setView('main')
        else if (view === 'settings') setView('main')
        else invoke('hide_window').catch(() => {})
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [view, setView, selectedTool])

  const installedTools = tools.filter(t => t.installed)
  const searchResults = searchTools(installedTools, query)

  return (
    <div className="w-[380px] h-[520px] bg-[var(--c-bg)] text-[var(--c-text)] flex flex-col overflow-hidden select-none">
      {view === 'skill-detail' && selectedSkill ? (
        <SkillDetailPanel
          skill={selectedSkill}
          toolName={selectedTool?.name}
          onBack={() => setView(selectedTool ? 'tool-detail' : 'main')}
        />
      ) : view === 'mcp-detail' && selectedMcp ? (
        <McpDetailPanel
          mcp={selectedMcp}
          toolName={selectedTool?.name}
          onBack={() => setView(selectedTool ? 'tool-detail' : 'main')}
        />
      ) : view === 'tool-detail' && selectedTool ? (
        <ToolDetailPage
          tool={selectedTool}
          onBack={() => setView('main')}
          onSelectSkill={handleSelectSkill}
          onSelectMcp={handleSelectMcp}
          onToolUpdated={fetchTools}
        />
      ) : view === 'settings' ? (
        <Settings
          onBack={() => setView('main')}
          updateInfo={updateInfo}
          theme={theme}
          onThemeChange={(t: ThemePreference) => setTheme(t)}
        />
      ) : (
        <>
          <Header onSettingsClick={() => setView('settings')} updateAvailable={!!updateInfo} />
          <SearchBar value={query} onChange={setQuery} />
          <div className="flex-1 overflow-y-auto divide-y divide-[var(--c-border-sub)]">
            {loading && tools.length === 0 ? (
              <SkeletonRows />
            ) : searchResults.length === 0 && query ? (
              <div className="px-4 py-8 text-center">
                <p className="text-[12px] text-[var(--c-text-3)]">No results for "{query}"</p>
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
                <p className="text-[13px] font-semibold text-[var(--c-text)]">No AI tools detected</p>
                <p className="text-[11px] text-[var(--c-text-3)] leading-relaxed max-w-[240px]">
                  Install Claude Code, Cursor, Gemini CLI, or GitHub Copilot and aicontextbar will pick them up automatically.
                </p>
              </div>
            ) : (
              searchResults.map(({ tool }) => (
                <ToolRow
                  key={tool.id}
                  tool={tool}
                  onSelectTool={handleSelectTool}
                />
              ))
            )}
          </div>
          <Footer lastUpdated={lastUpdated} onRefresh={fetchTools} loading={loading} />
        </>
      )}
    </div>
  )
}
