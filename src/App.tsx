import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { AiTool } from './types'
import { searchTools } from './search'
import { useExpandedState } from './useExpandedState'
import { useUpdateCheck } from './useUpdateCheck'
import { useToolsDiff } from './useToolsDiff'
import { useTheme, type ThemePreference } from './useTheme'
import Header from './components/Header'
import SearchBar from './components/SearchBar'
import ToolRow from './components/ToolRow'
import Footer from './components/Footer'
import Settings from './components/Settings'

type View = 'main' | 'settings'

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
  const { expanded, toggle } = useExpandedState()
  const [version, setVersion] = useState('')
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    invoke<string>('get_version').then(setVersion).catch(() => setVersion('0.5.0'))
  }, [])

  const updateInfo = useUpdateCheck(version)
  useToolsDiff()

  const fetchTools = useCallback(async () => {
    setLoading(true)
    try {
      const result = await invoke<AiTool[]>('get_tools')
      setTools(result)
      setLastUpdated(new Date())
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
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (view === 'settings') setView('main')
        else invoke('hide_window').catch(() => {})
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [view, setView])

  const searchResults = searchTools(tools, query)

  return (
    <div className="w-[380px] h-[520px] bg-[var(--c-bg)] text-[var(--c-text)] flex flex-col overflow-hidden select-none">
      {view === 'settings' ? (
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
            ) : (
              searchResults.map(({ tool, matchedSkills, matchedMcps }) => (
                <ToolRow
                  key={tool.id}
                  tool={tool}
                  query={query}
                  isExpanded={expanded.has(tool.id)}
                  onToggle={() => toggle(tool.id)}
                  matchedSkills={matchedSkills}
                  matchedMcps={matchedMcps}
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
