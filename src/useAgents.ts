import { useState, useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { Agent } from './types'
import { capture } from './analytics'

export interface UseAgentsResult {
  agents: Agent[]
  loading: boolean
  cloudSyncing: boolean
  lastUpdated: Date | null
  fetchAgents: () => Promise<Agent[]>
}

export function useAgents(): UseAgentsResult {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [cloudSyncing, setCloudSyncing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const fetchingRef = useRef(false)

  const fetchAgents = useCallback(async (): Promise<Agent[]> => {
    if (fetchingRef.current) return []
    fetchingRef.current = true
    setLoading(true)
    const t0 = Date.now()
    try {
      const result = await invoke<Agent[]>('get_agents')
      const duration_ms = Date.now() - t0
      setAgents(result)
      // Warm caches in background — skills and MCPs
      invoke('warm_skill_cache').catch(() => {})
      invoke('warm_mcp_cache').catch(() => {})
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

  useEffect(() => { fetchAgents() }, [fetchAgents])

  useEffect(() => {
    const unlisten = listen('agents-changed', () => { setCloudSyncing(false); fetchAgents() })
    return () => { unlisten.then(fn => fn()) }
  }, [fetchAgents])

  useEffect(() => {
    const unlisten = listen('cloud-mcps-loading', () => setCloudSyncing(true))
    return () => { unlisten.then(fn => fn()) }
  }, [])

  return { agents, loading, cloudSyncing, lastUpdated, fetchAgents }
}
