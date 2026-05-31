import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { AiTool } from './types'
import Header from './components/Header'
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
            <div className="w-[7px] h-[7px] rounded-full bg-zinc-800" />
            <div className="w-[20px] h-[20px] rounded bg-zinc-800" />
            <div className="h-3 bg-zinc-800 rounded w-28" />
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
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (view === 'settings') {
          setView('main')
        } else {
          invoke('hide_window').catch(() => {})
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [view, setView])

  return (
    <div className="w-[380px] h-[520px] bg-zinc-950 text-white flex flex-col overflow-hidden select-none">
      {view === 'settings' ? (
        <Settings onBack={() => setView('main')} />
      ) : (
        <>
          <Header onSettingsClick={() => setView('settings')} />
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/50">
            {loading && tools.length === 0 ? (
              <SkeletonRows />
            ) : (
              tools.map((tool) => <ToolRow key={tool.id} tool={tool} />)
            )}
          </div>
          <Footer lastUpdated={lastUpdated} onRefresh={fetchTools} loading={loading} />
        </>
      )}
    </div>
  )
}
