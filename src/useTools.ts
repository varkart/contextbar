import { useState, useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { AiTool } from './types'
import { capture } from './analytics'

export interface UseToolsResult {
  tools: AiTool[]
  loading: boolean
  cloudSyncing: boolean
  lastUpdated: Date | null
  fetchTools: () => Promise<AiTool[]>
}

export function useTools(): UseToolsResult {
  const [tools, setTools] = useState<AiTool[]>([])
  const [loading, setLoading] = useState(true)
  const [cloudSyncing, setCloudSyncing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const fetchingRef = useRef(false)

  const fetchTools = useCallback(async (): Promise<AiTool[]> => {
    if (fetchingRef.current) return []
    fetchingRef.current = true
    setLoading(true)
    const t0 = Date.now()
    try {
      const result = await invoke<AiTool[]>('get_tools')
      const duration_ms = Date.now() - t0
      setTools(result)
      // Warm the skill cache in the background for pre-cache skills
      invoke('warm_skill_cache').catch(() => {})
      setLastUpdated(new Date())
      capture('tools_loaded', {
        tool_count: result.length,
        installed_count: result.filter(t => t.installed).length,
        tools_detected: result.filter(t => t.installed).map(t => t.id),
      })
      capture('tools_load_duration', { duration_ms, tool_count: result.length })
      result.filter(t => t.installed && t.error).forEach(t =>
        capture('detector_failed', { tool_id: t.id, error: t.error })
      )
      return result
    } catch (e) {
      console.error('get_tools failed:', e)
      return []
    } finally {
      setLoading(false)
      fetchingRef.current = false
    }
  }, [])

  useEffect(() => { fetchTools() }, [fetchTools])

  useEffect(() => {
    const unlisten = listen('tools-changed', () => { setCloudSyncing(false); fetchTools() })
    return () => { unlisten.then(fn => fn()) }
  }, [fetchTools])

  useEffect(() => {
    const unlisten = listen('cloud-mcps-loading', () => setCloudSyncing(true))
    return () => { unlisten.then(fn => fn()) }
  }, [])

  return { tools, loading, cloudSyncing, lastUpdated, fetchTools }
}
