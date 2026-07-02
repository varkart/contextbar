import type { Agent, Skill, McpServer } from '../types'
import type { View } from '../viewRouter'

interface BreadcrumbSegment {
  label: string
  onClick?: () => void
}

function buildBreadcrumbs(
  view: View,
  selectedAgent: Agent | null,
  selectedSkill: Skill | null,
  selectedMcp: McpServer | null,
  skillBackView: View,
  mcpBackView: View,
  allSkillsBackView: View,
  allMcpsBackView: View,
  goTo: (v: View) => void,
  openAgentsList: () => void,
): BreadcrumbSegment[] {
  const providers: BreadcrumbSegment = { label: 'Providers', onClick: () => openAgentsList() }
  const toolCrumb = (clickable = true): BreadcrumbSegment => ({
    label: selectedAgent?.name ?? '…',
    onClick: clickable ? () => goTo('agent-detail') : undefined,
  })

  switch (view) {
    case 'main':
      return []

    case 'agents-list':
      return [{ label: 'Providers' }]

    case 'agent-detail':
      return [providers, { label: selectedAgent?.name ?? '…' }]

    case 'skills-list':
      return [toolCrumb(), { label: 'Skills' }]

    case 'mcps-list':
      return [toolCrumb(), { label: 'MCPs' }]

    case 'all-skills-list':
      if (allSkillsBackView === 'agent-detail' && selectedAgent) {
        return [providers, toolCrumb(), { label: 'All Skills' }]
      }
      return [{ label: 'All Skills' }]

    case 'all-mcps-list':
      if (allMcpsBackView === 'agent-detail' && selectedAgent) {
        return [providers, toolCrumb(), { label: 'All MCPs' }]
      }
      return [{ label: 'All MCPs' }]

    case 'skill-detail':
      if (skillBackView === 'all-skills-list') {
        return [{ label: 'All Skills', onClick: () => goTo('all-skills-list') }, { label: selectedSkill?.name ?? '…' }]
      }
      if (skillBackView === 'skills-list') {
        return [toolCrumb(), { label: 'Skills', onClick: () => goTo('skills-list') }, { label: selectedSkill?.name ?? '…' }]
      }
      return [toolCrumb(), { label: selectedSkill?.name ?? '…' }]

    case 'mcp-detail':
      if (mcpBackView === 'all-mcps-list') {
        return [{ label: 'All MCPs', onClick: () => goTo('all-mcps-list') }, { label: selectedMcp?.name ?? '…' }]
      }
      if (mcpBackView === 'mcps-list') {
        return [toolCrumb(), { label: 'MCPs', onClick: () => goTo('mcps-list') }, { label: selectedMcp?.name ?? '…' }]
      }
      return [toolCrumb(), { label: selectedMcp?.name ?? '…' }]

    case 'settings':
      return [{ label: 'Settings' }]

    case 'notifications':
      return [{ label: 'Notifications' }]

    case 'logs':
      return [{ label: 'Logs' }]

    case 'add-skill':
      return [{ label: 'Add Skill' }]

    case 'add-mcp':
      return [{ label: 'Add MCP' }]

    case 'permissions-detail':
      return [toolCrumb(), { label: 'Permissions' }]

    default:
      return []
  }
}

function BellIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="w-3.5 h-3.5">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="w-3.5 h-3.5">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

export interface HeaderProps {
  view: View
  selectedAgent: Agent | null
  selectedSkill: Skill | null
  selectedMcp: McpServer | null
  skillBackView: View
  mcpBackView: View
  allSkillsBackView: View
  allMcpsBackView: View
  goTo: (view: View) => void
  openAgentsList: () => void
  updateAvailable?: boolean
  notificationCount?: number
  onSettingsClick: () => void
  onNotificationsClick: () => void
}

export default function Header({
  view,
  selectedAgent,
  selectedSkill,
  selectedMcp,
  skillBackView,
  mcpBackView,
  allSkillsBackView,
  allMcpsBackView,
  goTo,
  openAgentsList,
  updateAvailable,
  notificationCount,
  onSettingsClick,
  onNotificationsClick,
}: HeaderProps) {
  const crumbs = buildBreadcrumbs(
    view, selectedAgent, selectedSkill, selectedMcp,
    skillBackView, mcpBackView, allSkillsBackView, allMcpsBackView, goTo, openAgentsList,
  )
  const hasNotifications = (notificationCount ?? 0) > 0

  return (
    <div className="flex items-center justify-between px-3 py-0 border-b border-[var(--c-border)] flex-shrink-0" style={{ height: 40 }}>
      {/* Pinned Left Brand Logo & Title */}
      <div 
        onClick={() => goTo('main')} 
        className="flex items-center gap-1.5 border-r border-[var(--c-border)] pr-3 mr-2 cursor-pointer flex-shrink-0 hover:opacity-80 transition-opacity"
        title="Context Bar Home"
      >
        <span 
          className="w-3.5 h-3.5 rounded flex-shrink-0" 
          style={{ background: 'linear-gradient(135deg, #a5b4fc, #6366f1)' }}
        />
        <span 
          className="text-[12.5px] font-bold tracking-tight"
          style={{ 
            background: 'linear-gradient(135deg, #f0f2f5, #a5b4fc)', 
            WebkitBackgroundClip: 'text', 
            WebkitTextFillColor: 'transparent' 
          }}
        >
          Context Bar
        </span>
      </div>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden" aria-label="Breadcrumb">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <span key={i} className="flex items-center gap-1 min-w-0">
              {i > 0 && (
                <span className="text-[11px] text-[var(--c-text-3)] opacity-40 flex-shrink-0">›</span>
              )}
              {crumb.onClick ? (
                <button
                  onClick={crumb.onClick}
                  className="text-[12px] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors truncate max-w-[90px]"
                >
                  {crumb.label}
                </button>
              ) : (
                <span className={`truncate ${isLast ? 'text-[13px] font-semibold text-[var(--c-text)] tracking-[-0.01em]' : 'text-[12px] text-[var(--c-text-3)]'}`}>
                  {crumb.label}
                </span>
              )}
            </span>
          )
        })}
      </nav>

      {/* Right actions */}
      <div className="flex items-center gap-0.5 flex-shrink-0 ml-2">
        <button
          onClick={onNotificationsClick}
          title="Notifications"
          className="relative text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors p-1 rounded"
          aria-label={hasNotifications ? `${notificationCount} notifications` : 'Notifications'}
        >
          <BellIcon />
          {hasNotifications && (
            <span className="absolute top-1 right-1 w-[5px] h-[5px] rounded-full bg-amber-400" aria-hidden="true" />
          )}
        </button>
        <button
          onClick={onSettingsClick}
          title={updateAvailable ? 'Settings — update available' : 'Settings'}
          className="relative text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors p-1 -mr-0.5 rounded"
          aria-label={updateAvailable ? 'Open settings — update available' : 'Open settings'}
        >
          <GearIcon />
          {updateAvailable && (
            <span className="absolute top-1 right-1 w-[5px] h-[5px] rounded-full bg-indigo-400" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  )
}
