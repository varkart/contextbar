import LogsPanel from '../LogsPanel'
import NotificationsPanel from '../NotificationsPanel'
import SkillsListPanel from '../SkillsListPanel'
import McpsListPanel from '../McpsListPanel'
import SkillDetailPanel from '../SkillDetailPanel'
import McpDetailPanel from '../McpDetailPanel'
import ToolDetailPage from '../ToolDetailPage'
import Settings from '../Settings'
import MainView from './MainView'

import type { ThemePreference } from '../../useTheme'

export default function ViewManager({
  view,
  selectedTool,
  selectedSkill,
  selectedMcp,
  selectTool,
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
  lastUpdated,
  cloudSyncing,
  handleFetchTools,
  theme,
  setTheme,
  fetchNotifications,
}: any) {
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
  if (view === 'skills-list' && selectedTool) {
    return (
      <SkillsListPanel
        tool={selectedTool}
        onBack={() => goTo('tool-detail')}
        onSelectSkill={skill => selectSkill(skill, 'skills-list')}
      />
    )
  }
  if (view === 'mcps-list' && selectedTool) {
    return (
      <McpsListPanel
        tool={selectedTool}
        onBack={() => goTo('tool-detail')}
        onSelectMcp={mcp => selectMcp(mcp, 'mcps-list')}
        onAdded={handleFetchTools}
      />
    )
  }
  if (view === 'skill-detail' && selectedSkill) {
    return (
      <SkillDetailPanel
        skill={selectedSkill}
        toolName={selectedTool?.name}
        toolId={selectedTool?.id}
        onToggled={handleFetchTools}
        onBack={() => escape()}
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
      />
    )
  }
if (view === 'tool-detail' && selectedTool) {
    return (
      <ToolDetailPage
        tool={selectedTool}
        onBack={() => goTo('main')}
        onSelectSkill={skill => selectSkill(skill, 'tool-detail')}
        onSelectMcp={mcp => selectMcp(mcp, 'tool-detail')}
        onOpenSkillsPage={openSkillsPage}
        onOpenMcpsPage={openMcpsPage}
        onToolUpdated={handleFetchTools}
        query={query || undefined}
        matchedSkills={searchResults.find((r: any) => r.tool.id === selectedTool.id)?.matchedSkills}
        matchedMcps={searchResults.find((r: any) => r.tool.id === selectedTool.id)?.matchedMcps}
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
      query={query}
      setQuery={setQuery}
      loading={loading}
      tools={tools}
      installedTools={installedTools}
      searchResults={searchResults}
      notifications={notifications}
      updateInfo={updateInfo}
      lastUpdated={lastUpdated}
      cloudSyncing={cloudSyncing}
      onSelectTool={selectTool}
      onFetchTools={handleFetchTools}
      onGoTo={goTo}
    />
  )
}
