import { useReducer, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { Agent, Skill, McpServer } from './types'
import { capture } from './analytics'
import {
  routerReducer,
  initialRouterState,
  escapeTransition,
  type View,
  type AgentsListMode,
  type RouterState,
} from './viewRouter'

export type { View, AgentsListMode }

export interface UseViewRouterResult extends RouterState {
  selectAgent: (tool: Agent) => void
  openAgentsList: () => void
  openSkillsListForAgent: (tool: Agent) => void
  openMcpsListForAgent: (tool: Agent) => void
  selectSkill: (skill: Skill, fromView?: View) => void
  selectMcp: (mcp: McpServer, fromView?: View) => void
  openSkillsPage: () => void
  openMcpsPage: () => void
  openAddSkill: () => void
  openAddMcp: () => void
  goTo: (view: View) => void
  escape: () => void
  refreshSelected: (tools: Agent[]) => void
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

  const selectAgent = useCallback((tool: Agent) => {
    dispatch({ type: 'SELECT_AGENT', tool })
    capture('tool_detail_viewed', { tool_id: tool.id })
  }, [])

  const openAgentsList = useCallback(() => {
    dispatch({ type: 'OPEN_AGENTS_LIST', mode: 'default' })
  }, [])

  const openSkillsListForAgent = useCallback((tool: Agent) => {
    dispatch({ type: 'OPEN_SKILLS_LIST_FOR_AGENT', tool })
    capture('skills_list_viewed', { tool_id: tool.id })
  }, [])

  const openMcpsListForAgent = useCallback((tool: Agent) => {
    dispatch({ type: 'OPEN_MCPS_LIST_FOR_AGENT', tool })
    capture('mcps_list_viewed', { tool_id: tool.id })
  }, [])

  const selectSkill = useCallback((skill: Skill, fromView: View = 'agent-detail') => {
    dispatch({ type: 'SELECT_SKILL', skill, fromView })
    capture('skill_detail_viewed', { skill_name: skill.name })
  }, [])

  const selectMcp = useCallback((mcp: McpServer, fromView: View = 'agent-detail') => {
    dispatch({ type: 'SELECT_MCP', mcp, fromView })
    capture('mcp_detail_viewed', { mcp_name: mcp.name })
  }, [])

  const openSkillsPage = useCallback(() => dispatch({ type: 'OPEN_SKILLS_PAGE', fromView: state.view }), [state.view])

  const openMcpsPage = useCallback(() => dispatch({ type: 'OPEN_MCPS_PAGE', fromView: state.view }), [state.view])

  const openAddSkill = useCallback(() => dispatch({ type: 'OPEN_ADD_SKILL', fromView: state.view }), [state.view])

  const openAddMcp = useCallback(() => dispatch({ type: 'OPEN_ADD_MCP', fromView: state.view }), [state.view])

  const goTo = useCallback((view: View) => dispatch({ type: 'GO_TO', view }), [])

  const escape = useCallback(() => {
    const result = escapeTransition(
      state.view, state.skillBackView, state.mcpBackView, state.selectedAgent,
      state.allSkillsBackView, state.allMcpsBackView,
      state.addSkillBackView, state.addMcpBackView,
    )
    if (result.type === 'navigate') dispatch({ type: 'GO_TO', view: result.to })
    else invoke('hide_window').catch(() => {})
  }, [state.view, state.skillBackView, state.mcpBackView, state.selectedAgent, state.allSkillsBackView, state.allMcpsBackView, state.addSkillBackView, state.addMcpBackView])

  const refreshSelected = useCallback((tools: Agent[]) => {
    dispatch({ type: 'REFRESH_SELECTED', tools })
  }, [])

  return {
    ...state,
    selectAgent,
    openAgentsList,
    openSkillsListForAgent,
    openMcpsListForAgent,
    selectSkill,
    selectMcp,
    openSkillsPage,
    openMcpsPage,
    openAddSkill,
    openAddMcp,
    goTo,
    escape,
    refreshSelected,
  }
}
