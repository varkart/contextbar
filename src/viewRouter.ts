import type { Agent, Skill, McpServer } from './types'

export type View =
  | 'main'
  | 'agents-list'
  | 'add-skill'
  | 'add-mcp'
  | 'settings'
  | 'agent-detail'
  | 'skills-list'
  | 'all-skills-list'
  | 'all-mcps-list'
  | 'mcps-list'
  | 'skill-detail'
  | 'mcp-detail'
  | 'permissions-detail'
  | 'notifications'
  | 'logs'
  | 'doctor'
  | 'config-backup'

export type AgentsListMode = 'default'

// Exhaustive map — TypeScript errors if a View variant is added here but missing from the type,
// or if the type gains a new variant without updating this map.
// This keeps ALL_VIEWS automatically in sync with the View union.
const _VIEW_REGISTRY: Record<View, true> = {
  'main': true,
  'agents-list': true,
  'add-skill': true,
  'add-mcp': true,
  'settings': true,
  'agent-detail': true,
  'skills-list': true,
  'all-skills-list': true,
  'all-mcps-list': true,
  'mcps-list': true,
  'skill-detail': true,
  'mcp-detail': true,
  'permissions-detail': true,
  'notifications': true,
  'logs': true,
  'doctor': true,
  'config-backup': true,
}

/** Every registered view. Used by tests to assert Escape is handled for all of them. */
export const ALL_VIEWS = Object.keys(_VIEW_REGISTRY) as View[]

export interface RouterState {
  view: View
  agentsListMode: AgentsListMode
  selectedAgent: Agent | null
  selectedSkill: Skill | null
  selectedMcp: McpServer | null
  skillBackView: View
  mcpBackView: View
  allSkillsBackView: View
  allMcpsBackView: View
  addSkillBackView: View
  addMcpBackView: View
}

export type RouterAction =
  | { type: 'SELECT_AGENT'; tool: Agent }
  | { type: 'OPEN_AGENTS_LIST'; mode: AgentsListMode }
  | { type: 'OPEN_SKILLS_LIST_FOR_AGENT'; tool: Agent }
  | { type: 'OPEN_MCPS_LIST_FOR_AGENT'; tool: Agent }
  | { type: 'SELECT_SKILL'; skill: Skill; fromView: View }
  | { type: 'SELECT_MCP'; mcp: McpServer; fromView: View }
  | { type: 'SELECT_PERMISSIONS' }
  | { type: 'OPEN_SKILLS_PAGE'; fromView: View }
  | { type: 'OPEN_MCPS_PAGE'; fromView: View }
  | { type: 'GO_TO'; view: View }
  | { type: 'RESET_TO'; view: View }
  | { type: 'OPEN_ADD_SKILL'; fromView: View }
  | { type: 'OPEN_ADD_MCP'; fromView: View }
  | { type: 'REFRESH_SELECTED'; tools: Agent[] }

export type EscapeResult =
  | { type: 'navigate'; to: View }
  | { type: 'hide' }

export function escapeTransition(
  view: View,
  skillBackView: View,
  mcpBackView: View,
  selectedAgent: Agent | null,
  allSkillsBackView: View,
  allMcpsBackView: View,
  addSkillBackView: View = 'all-skills-list',
  addMcpBackView: View = 'all-mcps-list',
): EscapeResult {
  if (view === 'skill-detail') return { type: 'navigate', to: skillBackView }
  if (view === 'mcp-detail') return { type: 'navigate', to: mcpBackView }
  if (view === 'permissions-detail') return { type: 'navigate', to: selectedAgent ? 'agent-detail' : 'main' }
  if (view === 'all-skills-list') return { type: 'navigate', to: allSkillsBackView }
  if (view === 'all-mcps-list') return { type: 'navigate', to: allMcpsBackView }
  if (view === 'skills-list') return { type: 'navigate', to: 'agent-detail' }
  if (view === 'mcps-list') return { type: 'navigate', to: 'agent-detail' }
  if (view === 'agent-detail') return { type: 'navigate', to: 'agents-list' }
  if (view === 'add-skill') return { type: 'navigate', to: addSkillBackView }
  if (view === 'add-mcp') return { type: 'navigate', to: addMcpBackView }
  if (view === 'agents-list') return { type: 'navigate', to: 'main' }
  if (view === 'settings' || view === 'notifications' || view === 'logs' || view === 'doctor')
    return { type: 'navigate', to: 'main' }
  if (view === 'config-backup')
    return { type: 'navigate', to: selectedAgent ? 'agent-detail' : 'main' }
  return { type: 'hide' }
}

export function initialRouterState(hash = ''): RouterState {
  return {
    view: hash === '#settings' ? 'settings' : 'main',
    agentsListMode: 'default',
    selectedAgent: null,
    selectedSkill: null,
    selectedMcp: null,
    skillBackView: 'agent-detail',
    mcpBackView: 'agent-detail',
    allSkillsBackView: 'agent-detail',
    allMcpsBackView: 'agent-detail',
    addSkillBackView: 'all-skills-list',
    addMcpBackView: 'all-mcps-list',
  }
}

export function routerReducer(state: RouterState, action: RouterAction): RouterState {
  switch (action.type) {
    case 'SELECT_AGENT':
      return { ...state, selectedAgent: action.tool, view: 'agent-detail' }

    case 'OPEN_AGENTS_LIST':
      return { ...state, agentsListMode: action.mode, view: 'agents-list' }

    case 'OPEN_SKILLS_LIST_FOR_AGENT':
      return { ...state, selectedAgent: action.tool, view: 'skills-list' }

    case 'OPEN_MCPS_LIST_FOR_AGENT':
      return { ...state, selectedAgent: action.tool, view: 'mcps-list' }

    case 'SELECT_SKILL':
      return { ...state, selectedSkill: action.skill, skillBackView: action.fromView, view: 'skill-detail' }

    case 'SELECT_MCP':
      return { ...state, selectedMcp: action.mcp, mcpBackView: action.fromView, view: 'mcp-detail' }

    case 'SELECT_PERMISSIONS':
      return { ...state, view: 'permissions-detail' }

    case 'OPEN_SKILLS_PAGE':
      return { ...state, view: 'all-skills-list', allSkillsBackView: action.fromView }

    case 'OPEN_MCPS_PAGE':
      return { ...state, view: 'all-mcps-list', allMcpsBackView: action.fromView }

    case 'OPEN_ADD_SKILL':
      return { ...state, view: 'add-skill', addSkillBackView: action.fromView }

    case 'OPEN_ADD_MCP':
      return { ...state, view: 'add-mcp', addMcpBackView: action.fromView }

    case 'GO_TO':
      return { ...state, view: action.view }

    // Fresh stack rooted at `view` — used by embedded routers (expanded window)
    // where escape should unwind to 'main' rather than a stale back-view.
    case 'RESET_TO':
      return {
        ...initialRouterState(),
        view: action.view,
        allSkillsBackView: 'main',
        allMcpsBackView: 'main',
      }

    case 'REFRESH_SELECTED': {
      const tools = action.tools
      let selectedAgent = state.selectedAgent
      let selectedSkill = state.selectedSkill
      let selectedMcp = state.selectedMcp

      if (selectedAgent) {
        selectedAgent = tools.find(t => t.id === selectedAgent!.id) ?? selectedAgent
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
      return { ...state, selectedAgent, selectedSkill, selectedMcp }
    }

    default:
      return state
  }
}
