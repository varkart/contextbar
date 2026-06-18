import type { AiTool, Skill, McpServer } from './types'

export type View =
  | 'main'
  | 'llms-list'
  | 'skills-aggregated'
  | 'mcps-aggregated'
  | 'settings'
  | 'tool-detail'
  | 'skills-list'
  | 'mcps-list'
  | 'skill-detail'
  | 'mcp-detail'
  | 'permissions-detail'
  | 'notifications'
  | 'logs'

export interface RouterState {
  view: View
  selectedTool: AiTool | null
  selectedSkill: Skill | null
  selectedMcp: McpServer | null
  skillBackView: View
  mcpBackView: View
}

export type RouterAction =
  | { type: 'SELECT_TOOL'; tool: AiTool }
  | { type: 'SELECT_SKILL'; skill: Skill; fromView: View }
  | { type: 'SELECT_SKILL_WITH_TOOL'; skill: Skill; tool: AiTool; fromView: View }
  | { type: 'SELECT_MCP'; mcp: McpServer; fromView: View }
  | { type: 'SELECT_MCP_WITH_TOOL'; mcp: McpServer; tool: AiTool; fromView: View }
  | { type: 'SELECT_PERMISSIONS' }
  | { type: 'OPEN_SKILLS_PAGE' }
  | { type: 'OPEN_MCPS_PAGE' }
  | { type: 'GO_TO'; view: View }
  | { type: 'REFRESH_SELECTED'; tools: AiTool[] }

export type EscapeResult =
  | { type: 'navigate'; to: View }
  | { type: 'hide' }

export function escapeTransition(
  view: View,
  skillBackView: View,
  mcpBackView: View,
  selectedTool: AiTool | null,
): EscapeResult {
  if (view === 'skill-detail') return { type: 'navigate', to: skillBackView }
  if (view === 'mcp-detail') return { type: 'navigate', to: mcpBackView }
  if (view === 'permissions-detail' || view === 'skills-list' || view === 'mcps-list')
    return { type: 'navigate', to: selectedTool ? 'tool-detail' : 'main' }
  if (view === 'tool-detail') return { type: 'navigate', to: 'llms-list' }
  if (view === 'llms-list' || view === 'skills-aggregated' || view === 'mcps-aggregated')
    return { type: 'navigate', to: 'main' }
  if (view === 'settings' || view === 'notifications' || view === 'logs')
    return { type: 'navigate', to: 'main' }
  return { type: 'hide' }
}

export function initialRouterState(hash = ''): RouterState {
  return {
    view: hash === '#settings' ? 'settings' : 'main',
    selectedTool: null,
    selectedSkill: null,
    selectedMcp: null,
    skillBackView: 'tool-detail',
    mcpBackView: 'tool-detail',
  }
}

export function routerReducer(state: RouterState, action: RouterAction): RouterState {
  switch (action.type) {
    case 'SELECT_TOOL':
      return { ...state, selectedTool: action.tool, view: 'tool-detail' }

    case 'SELECT_SKILL':
      return { ...state, selectedSkill: action.skill, skillBackView: action.fromView, view: 'skill-detail' }

    case 'SELECT_SKILL_WITH_TOOL':
      return { ...state, selectedTool: action.tool, selectedSkill: action.skill, skillBackView: action.fromView, view: 'skill-detail' }

    case 'SELECT_MCP':
      return { ...state, selectedMcp: action.mcp, mcpBackView: action.fromView, view: 'mcp-detail' }

    case 'SELECT_MCP_WITH_TOOL':
      return { ...state, selectedTool: action.tool, selectedMcp: action.mcp, mcpBackView: action.fromView, view: 'mcp-detail' }

    case 'SELECT_PERMISSIONS':
      return { ...state, view: 'permissions-detail' }

    case 'OPEN_SKILLS_PAGE':
      return { ...state, view: 'skills-list' }

    case 'OPEN_MCPS_PAGE':
      return { ...state, view: 'mcps-list' }

    case 'GO_TO':
      return { ...state, view: action.view }

    case 'REFRESH_SELECTED': {
      const tools = action.tools
      let selectedTool = state.selectedTool
      let selectedSkill = state.selectedSkill
      let selectedMcp = state.selectedMcp

      if (selectedTool) {
        selectedTool = tools.find(t => t.id === selectedTool!.id) ?? selectedTool
      }
      if (selectedSkill) {
        for (const tool of tools) {
          const found = tool.skills.find(s => s.name === selectedSkill!.name)
          if (found) { selectedSkill = found; break }
        }
      }
      if (selectedMcp) {
        for (const tool of tools) {
          const found = tool.mcps.find(m => m.name === selectedMcp!.name)
          if (found) { selectedMcp = found; break }
        }
      }
      return { ...state, selectedTool, selectedSkill, selectedMcp }
    }

    default:
      return state
  }
}
