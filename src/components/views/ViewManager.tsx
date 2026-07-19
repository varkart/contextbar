import LogsPanel from '../LogsPanel'
import NotificationsPanel from '../NotificationsPanel'
import SkillsListPanel from '../SkillsListPanel'
import McpsListPanel from '../McpsListPanel'
import SkillDetailPanel from '../SkillDetailPanel'
import McpDetailPanel from '../McpDetailPanel'
import AgentDetailPage from '../AgentDetailPage'
import PermissionsDetailPanel from '../PermissionsDetailPanel'
import Settings from '../Settings'
import MainView from './MainView'
import AgentsListView from './AgentsListView'
import AllSkillsView from './AllSkillsView'
import AllMcpsView from './AllMcpsView'
import AddSkillView from './AddSkillView'
import AddMcpView from './AddMcpView'
import DoctorView from './DoctorView'
import ConfigBackupView from './ConfigBackupView'

import type { ThemePreference } from '../../useTheme'
import type { Agent, Skill } from '../../types'

export default function ViewManager({
  view,
  selectedAgent,
  selectedSkill,
  selectedMcp,
  selectAgent,
  openAgentsList,
  selectSkill,
  selectMcp,
  openSkillsPage,
  openMcpsPage,
  openAddSkill,
  openAddMcp,
  goTo,
  escape,
  query,
  loading,
  agents,
  installedAgents,
  searchResults,
  notifications,
  updateInfo,
  lastUpdated,
  cloudSyncing,
  handleFetchTools,
  theme,
  setTheme,
  fetchNotifications,
  hideAgentHeader,
}: any) {
  if (view === 'doctor') {
    return <DoctorView onBack={() => goTo('settings')} />
  }
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
        installedAgents={installedAgents}
        onBack={() => escape()}
        onCreated={handleFetchTools}
        initialAgentId={selectedAgent?.id}
      />
    )
  }
  if (view === 'add-mcp') {
    return (
      <AddMcpView
        installedAgents={installedAgents}
        onBack={() => escape()}
        onAdded={handleFetchTools}
        initialAgentId={selectedAgent?.id}
      />
    )
  }
  if (view === 'agents-list') {
    return (
      <AgentsListView
        agents={agents}
        loading={loading}
        onSelectAgent={selectAgent}
      />
    )
  }
  if (view === 'skills-list' && selectedAgent) {
    return (
      <SkillsListPanel
        agent={selectedAgent}
        onBack={() => escape()}
        onSelectSkill={skill => selectSkill(skill, 'skills-list')}
        onAddSkill={openAddSkill}
      />
    )
  }
  if (view === 'mcps-list' && selectedAgent) {
    return (
      <McpsListPanel
        agent={selectedAgent}
        onBack={() => escape()}
        onSelectMcp={mcp => selectMcp(mcp, 'mcps-list')}
        onAddMcp={openAddMcp}
      />
    )
  }
  if (view === 'all-skills-list') {
    return (
      <AllSkillsView
        agents={agents}
        onBack={() => escape()}
        onSelectSkill={skill => selectSkill(skill, 'all-skills-list')}
        onAddSkill={openAddSkill}
      />
    )
  }
  if (view === 'all-mcps-list') {
    return (
      <AllMcpsView
        agents={agents}
        onBack={() => escape()}
        onSelectMcp={mcp => selectMcp(mcp, 'all-mcps-list')}
        onAddMcp={openAddMcp}
      />
    )
  }
  if (view === 'skill-detail' && selectedSkill) {
    // Compute all variants (same name, any tool) with agentId/agentName populated
    const skillVariants = (agents as Agent[])
      .filter((t: Agent) => t.installed)
      .flatMap((t: Agent) => t.skills
        .filter((s: Skill) => s.name.toLowerCase() === selectedSkill.name.toLowerCase())
        .map((s: Skill) => ({ ...s, agentId: t.id, agentName: t.name }))
      )
    return (
      <SkillDetailPanel
        skill={selectedSkill}
        agentName={selectedAgent?.name ?? selectedSkill.agentName}
        agentId={selectedAgent?.id ?? selectedSkill.agentId}
        onToggled={handleFetchTools}
        onBack={() => escape()}
        allAgents={agents}
        variants={skillVariants}
      />
    )
  }
  if (view === 'mcp-detail' && selectedMcp) {
    return (
      <McpDetailPanel
        mcp={selectedMcp}
        agentName={selectedAgent?.name}
        agentId={selectedAgent?.id}
        onToggled={handleFetchTools}
        onRemoved={handleFetchTools}
        onBack={() => escape()}
        allAgents={agents}
      />
    )
  }
  if (view === 'config-backup' && selectedAgent) {
    return (
      <ConfigBackupView
        agent={selectedAgent}
        onBack={() => goTo('agent-detail')}
        onRestored={handleFetchTools}
      />
    )
  }
  if (view === 'permissions-detail' && selectedAgent) {
    return (
      <PermissionsDetailPanel
        toolId={selectedAgent.id}
        toolName={selectedAgent.name}
        onBack={() => escape()}
      />
    )
  }
  if (view === 'agent-detail' && selectedAgent) {
    return (
      <AgentDetailPage
        agent={selectedAgent}
        onBack={() => goTo('agents-list')}
        onSelectSkill={skill => selectSkill(skill, 'agent-detail')}
        onSelectMcp={mcp => selectMcp(mcp, 'agent-detail')}
        onOpenSkillsPage={openSkillsPage}
        onOpenMcpsPage={openMcpsPage}
        onAgentUpdated={handleFetchTools}
        onOpenBackups={() => goTo('config-backup')}
        onAddSkill={openAddSkill}
        onAddMcp={openAddMcp}
        onOpenPermissions={() => goTo('permissions-detail')}
        query={query || undefined}
        matchedSkills={searchResults.find((r: any) => r.agent.id === selectedAgent.id)?.matchedSkills}
        matchedMcps={searchResults.find((r: any) => r.agent.id === selectedAgent.id)?.matchedMcps}
        hideHeader={hideAgentHeader}
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
        onOpenDoctor={() => goTo('doctor')}
      />
    )
  }

  return (
    <MainView
      loading={loading}
      agents={agents}
      installedAgents={installedAgents}
      searchResults={searchResults}
      notifications={notifications}
      updateInfo={updateInfo}
      lastUpdated={lastUpdated}
      cloudSyncing={cloudSyncing}
      onFetchAgents={handleFetchTools}
      onGoTo={goTo}
      onOpenAgentsList={openAgentsList}
      onOpenSkillsPage={openSkillsPage}
      onOpenMcpsPage={openMcpsPage}
    />
  )
}
