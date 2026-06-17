import { useState, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { AiTool, Skill, McpServer } from './types'
import { capture } from './analytics'

export interface UseToolsResult {
  tools: AiTool[]
  loading: boolean
  cloudSyncing: boolean
  lastUpdated: Date | null
  fetchTools: () => Promise<void>
  refreshSelected: (
    prevSkill: Skill | null,
    prevMcp: McpServer | null,
    result: AiTool[]
  ) => { skill: Skill | null; mcp: McpServer | null }
}

export function useTools(): UseToolsResult {
  const [tools, setTools] = useState<AiTool[]>([])
  const [loading, setLoading] = useState(true)
  const [cloudSyncing, setCloudSyncing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const refreshSelected = useCallback((
    prevSkill: Skill | null,
    prevMcp: McpServer | null,
    result: AiTool[]
  ) => {
    let skill = prevSkill
    let mcp = prevMcp
    if (prevSkill) {
      for (const tool of result) {
        const found = tool.skills.find(s => s.name === prevSkill.name)
        if (found) { skill = found; break }
      }
    }
    if (prevMcp) {
      for (const tool of result) {
        const found = tool.mcps.find(m => m.name === prevMcp.name)
        if (found) { mcp = found; break }
      }
    }
    return { skill, mcp }
  }, [])

  const fetchTools = useCallback(async () => {
    setLoading(true)
    const t0 = Date.now()
    try {
      const result = await invoke<AiTool[]>('get_tools')
      const duration_ms = Date.now() - t0
      setTools(result)
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
    } catch (e) {
      console.error('get_tools failed:', e)
    } finally {
      setLoading(false)
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

  return { tools, loading, cloudSyncing, lastUpdated, fetchTools, refreshSelected }
}
