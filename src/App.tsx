import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { AiTool } from './types'
import Header from './components/Header'
import ToolRow from './components/ToolRow'
import Footer from './components/Footer'

function App() {
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

  // Fetch on mount
  useEffect(() => { fetchTools() }, [fetchTools])

  // Escape key → hide window
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') invoke('hide_window').catch(() => {})
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="w-[380px] h-[520px] bg-zinc-900 text-white flex flex-col overflow-hidden select-none">
      <Header />
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-800">
        {loading && tools.length === 0 ? (
          <SkeletonRows />
        ) : (
          tools.map(tool => <ToolRow key={tool.id} tool={tool} />)
        )}
      </div>
      <Footer lastUpdated={lastUpdated} onRefresh={fetchTools} loading={loading} />
    </div>
  )
}

function SkeletonRows() {
  return (
    <>
      {[1, 2, 3].map(i => (
        <div key={i} className="px-4 py-3 animate-pulse">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-zinc-700" />
            <div className="h-3 bg-zinc-700 rounded w-32" />
          </div>
        </div>
      ))}
    </>
  )
}

export default App
