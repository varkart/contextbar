import { useReducer, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { AiTool, Skill, McpServer } from './types'
import { capture } from './analytics'
import {
  routerReducer,
  initialRouterState,
  escapeTransition,
  type View,
  type RouterState,
} from './viewRouter'

export type { View }

export interface UseViewRouterResult extends RouterState {
  selectTool: (tool: AiTool) => void
  selectSkill: (skill: Skill, fromView?: View) => void
  selectSkillWithTool: (skill: Skill, tool: AiTool, fromView?: View) => void
  selectMcp: (mcp: McpServer, fromView?: View) => void
  selectMcpWithTool: (mcp: McpServer, tool: AiTool, fromView?: View) => void
  selectPermissions: () => void
  openSkillsPage: () => void
  openMcpsPage: () => void
  goTo: (view: View) => void
  escape: () => void
  refreshSelected: (tools: AiTool[]) => void
}

export function useViewRouter(): UseViewRouterResult {
  const [state, dispatch] = useReducer(
    routerReducer,
    undefined,
    () => initialRouterState(window.location.hash),
  )

  useEffect(() => {
    window.location.hash = state.view === 'settings' ? '#settings' : ''
  }, [state.view])

  const selectTool = useCallback((tool: AiTool) => {
    dispatch({ type: 'SELECT_TOOL', tool })
    capture('tool_detail_viewed', { tool_id: tool.id })
  }, [])

  const selectSkill = useCallback((skill: Skill, fromView: View = 'tool-detail') => {
    dispatch({ type: 'SELECT_SKILL', skill, fromView })
    capture('skill_detail_viewed', { skill_name: skill.name })
  }, [])

  const selectSkillWithTool = useCallback((skill: Skill, tool: AiTool, fromView: View = 'skills-aggregated') => {
    dispatch({ type: 'SELECT_SKILL_WITH_TOOL', skill, tool, fromView })
    capture('skill_detail_viewed', { skill_name: skill.name })
  }, [])

  const selectMcp = useCallback((mcp: McpServer, fromView: View = 'tool-detail') => {
    dispatch({ type: 'SELECT_MCP', mcp, fromView })
    capture('mcp_detail_viewed', { mcp_name: mcp.name })
  }, [])

  const selectMcpWithTool = useCallback((mcp: McpServer, tool: AiTool, fromView: View = 'mcps-aggregated') => {
    dispatch({ type: 'SELECT_MCP_WITH_TOOL', mcp, tool, fromView })
    capture('mcp_detail_viewed', { mcp_name: mcp.name })
  }, [])

  const selectPermissions = useCallback(() => {
    dispatch({ type: 'SELECT_PERMISSIONS' })
    capture('permissions_detail_viewed', { tool_id: state.selectedTool?.id })
  }, [state.selectedTool?.id])

  const openSkillsPage = useCallback(() => dispatch({ type: 'OPEN_SKILLS_PAGE' }), [])

  const openMcpsPage = useCallback(() => dispatch({ type: 'OPEN_MCPS_PAGE' }), [])

  const goTo = useCallback((view: View) => dispatch({ type: 'GO_TO', view }), [])

  const escape = useCallback(() => {
    const result = escapeTransition(
      state.view, state.skillBackView, state.mcpBackView, state.selectedTool,
    )
    if (result.type === 'navigate') dispatch({ type: 'GO_TO', view: result.to })
    else invoke('hide_window').catch(() => {})
  }, [state.view, state.skillBackView, state.mcpBackView, state.selectedTool])

  const refreshSelected = useCallback((tools: AiTool[]) => {
    dispatch({ type: 'REFRESH_SELECTED', tools })
  }, [])

  return {
    ...state,
    selectTool,
    selectSkill,
    selectSkillWithTool,
    selectMcp,
    selectMcpWithTool,
    selectPermissions,
    openSkillsPage,
    openMcpsPage,
    goTo,
    escape,
    refreshSelected,
  }
}
