import LogsPanel from '../LogsPanel'
import NotificationsPanel from '../NotificationsPanel'
import SkillsListPanel from '../SkillsListPanel'
import McpsListPanel from '../McpsListPanel'
import SkillDetailPanel from '../SkillDetailPanel'
import McpDetailPanel from '../McpDetailPanel'
import ToolDetailPage from '../ToolDetailPage'
import Settings from '../Settings'
import MainView from './MainView'
import LlmsListView from './LlmsListView'
import AllSkillsView from './AllSkillsView'
import AllMcpsView from './AllMcpsView'
import AddSkillView from './AddSkillView'
import AddMcpView from './AddMcpView'

import type { ThemePreference } from '../../useTheme'
import type { AiTool, Skill, McpServer, Notification } from '../../types'
import type { ToolMatch } from '../../search'
import type { UpdateInfo } from '../../useUpdateCheck'
import type { View } from '../../viewRouter'

interface ViewManagerProps {
  view: string
  selectedTool: AiTool | null
  selectedSkill: Skill | null
  selectedMcp: McpServer | null
  selectTool: (tool: AiTool) => void
  openLlmsList: () => void
  selectSkill: (skill: Skill, fromView?: View) => void
  selectMcp: (mcp: McpServer, fromView?: View) => void
  openSkillsPage: () => void
  openMcpsPage: () => void
  goTo: (view: View) => void
  escape: () => void
  query?: string
  setQuery?: (q: string) => void
  loading: boolean
  tools: AiTool[]
  installedTools: AiTool[]
  searchResults: ToolMatch[]
  notifications: Notification[]
  updateInfo: UpdateInfo | null
  lastUpdated: Date | null
  cloudSyncing: boolean
  handleFetchTools: () => Promise<void>
  theme: ThemePreference
  setTheme: (t: ThemePreference) => void
  fetchNotifications: () => void
}

export default function ViewManager({
  view,
  selectedTool,
  selectedSkill,
  selectedMcp,
  selectTool,
  openLlmsList,
  selectSkill,
  selectMcp,
  openSkillsPage,
  openMcpsPage,
  goTo,
  escape,
  query,
  setQuery,
  loading,
  tools,
  installedTools,
  searchResults,
  notifications,
  updateInfo,
  handleFetchTools,
  theme,
  setTheme,
  fetchNotifications,
}: ViewManagerProps) {
  if (view === 'logs') {
    return <LogsPanel onBack={() => goTo('main')} />
  }
  if (view === 'notifications') {
    return (
      <NotificationsPanel
        notifications={notifications}
        onBack={() => goTo('main')}
        onChanged={fetchNotifications}
      />
    )
  }
  if (view === 'add-skill') {
    return (
      <AddSkillView
        installedTools={installedTools}
        onBack={() => goTo('llms-list')}
        onCreated={handleFetchTools}
      />
    )
  }
  if (view === 'add-mcp') {
    return (
      <AddMcpView
        installedTools={installedTools}
        onBack={() => goTo('llms-list')}
        onAdded={handleFetchTools}
      />
    )
  }
  if (view === 'llms-list') {
    return (
      <LlmsListView
        tools={tools}
        loading={loading}
        onSelectTool={selectTool}
        query={query ?? ''}
        setQuery={setQuery ?? (() => {})}
      />
    )
  }
  if (view === 'skills-list' && selectedTool) {
    return (
      <SkillsListPanel
        tool={selectedTool}
        onBack={() => escape()}
        onSelectSkill={skill => selectSkill(skill, 'skills-list')}
        onAddSkill={() => goTo('add-skill')}
      />
    )
  }
  if (view === 'mcps-list' && selectedTool) {
    return (
      <McpsListPanel
        tool={selectedTool}
        onBack={() => escape()}
        onSelectMcp={mcp => selectMcp(mcp, 'mcps-list')}
        onAddMcp={() => goTo('add-mcp')}
      />
    )
  }
  if (view === 'all-skills-list') {
    return (
      <AllSkillsView
        tools={tools}
        onBack={() => escape()}
        onSelectSkill={skill => selectSkill(skill, 'all-skills-list')}
        query={query ?? ''}
        setQuery={setQuery ?? (() => {})}
      />
    )
  }
  if (view === 'all-mcps-list') {
    return (
      <AllMcpsView
        tools={tools}
        onBack={() => escape()}
        onSelectMcp={mcp => selectMcp(mcp, 'all-mcps-list')}
        query={query ?? ''}
        setQuery={setQuery ?? (() => {})}
      />
    )
  }
  if (view === 'skill-detail' && selectedSkill) {
    // Compute all variants (same name, any tool) with toolId/toolName populated
    const skillVariants = (tools as AiTool[])
      .filter((t: AiTool) => t.installed)
      .flatMap((t: AiTool) => t.skills
        .filter((s: Skill) => s.name.toLowerCase() === selectedSkill.name.toLowerCase())
        .map((s: Skill) => ({ ...s, toolId: t.id, toolName: t.name }))
      )
    return (
      <SkillDetailPanel
        skill={selectedSkill}
        toolName={selectedTool?.name ?? selectedSkill.toolName}
        toolId={selectedTool?.id ?? selectedSkill.toolId}
        onToggled={handleFetchTools}
        onBack={() => escape()}
        allTools={tools}
        variants={skillVariants}
      />
    )
  }
  if (view === 'mcp-detail' && selectedMcp) {
    return (
      <McpDetailPanel
        mcp={selectedMcp}
        toolName={selectedTool?.name}
        toolId={selectedTool?.id}
        onToggled={handleFetchTools}
        onRemoved={handleFetchTools}
        onBack={() => escape()}
        allTools={tools}
      />
    )
  }
  if (view === 'tool-detail' && selectedTool) {
    return (
      <ToolDetailPage
        tool={selectedTool}
        onBack={() => goTo('llms-list')}
        onSelectSkill={skill => selectSkill(skill, 'tool-detail')}
        onSelectMcp={mcp => selectMcp(mcp, 'tool-detail')}
        onOpenSkillsPage={openSkillsPage}
        onOpenMcpsPage={openMcpsPage}
        onToolUpdated={handleFetchTools}
        query={query || undefined}
        matchedSkills={searchResults.find(r => r.tool.id === selectedTool.id)?.matchedSkills}
        matchedMcps={searchResults.find(r => r.tool.id === selectedTool.id)?.matchedMcps}
      />
    )
  }
  if (view === 'settings') {
    return (
      <Settings
        onBack={() => goTo('main')}
        updateInfo={updateInfo}
        theme={theme}
        onThemeChange={(t: ThemePreference) => setTheme(t)}
        onOpenLogs={() => goTo('logs')}
      />
    )
  }

  return (
    <MainView
      loading={loading}
      installedTools={installedTools}
      onOpenLlmsList={openLlmsList}
      onOpenSkillsPage={openSkillsPage}
      onOpenMcpsPage={openMcpsPage}
    />
  )
}
