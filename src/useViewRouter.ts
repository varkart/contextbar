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

export interface UseViewRouterOptions {
  /** Mirror the view into window.location.hash (popover behavior). Default true. */
  syncHash?: boolean
  /** Called when Escape unwinds past the root. Default: hide the window. */
  onExit?: () => void
  /** Start at this view instead of deriving from the hash. */
  initialView?: View
}

export function useViewRouter(options: UseViewRouterOptions = {}): UseViewRouterResult {
  const { syncHash = true, onExit, initialView } = options
  const [state, dispatch] = useReducer(
    routerReducer,
    undefined,
    () => {
      const s = initialRouterState(window.location.hash)
      return initialView ? { ...s, view: initialView } : s
    },
  )

  useEffect(() => {
    if (syncHash) {
      window.location.hash = state.view === 'settings' ? '#settings' : ''
    }
  }, [state.view, syncHash])

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
    else if (onExit) onExit()
    else invoke('hide_window').catch(() => {})
  }, [state.view, state.skillBackView, state.mcpBackView, state.selectedAgent, state.allSkillsBackView, state.allMcpsBackView, state.addSkillBackView, state.addMcpBackView, onExit])

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
