import type { AiTool } from './types'

export type View =
  | 'main'
  | 'settings'
  | 'tool-detail'
  | 'skills-list'
  | 'mcps-list'
  | 'skill-detail'
  | 'mcp-detail'
  | 'permissions-detail'
  | 'notifications'
  | 'logs'

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
  if (view === 'tool-detail') return { type: 'navigate', to: 'main' }
  if (view === 'settings' || view === 'notifications' || view === 'logs')
    return { type: 'navigate', to: 'main' }
  return { type: 'hide' }
}
