import type { Agent } from '../types'

export const mockClaudeAgent: Agent = {
  id: 'claude',
  name: 'Claude Code',
  version: '1.0.0',
  installed: true,
  supportsSkills: true,
  supportsMcps: true,
  skills: [
    { name: 'impeccable', path: '~/.claude/skills/impeccable', description: 'Polish frontend UI', hasFullDescription: false, active: true, sourceId: 'skills_dir' },
    { name: 'design-taste-frontend', path: '~/.claude/skills/design-taste-frontend', description: undefined, hasFullDescription: false, active: true, sourceId: 'skills_dir' },
  ],
  mcps: [
    { name: 'github', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], active: true, hasSecrets: true, secretKeyNames: ['GITHUB_PERSONAL_ACCESS_TOKEN'], sourceId: 'settings_json' },
    { name: 'netlify', command: 'npx', args: ['-y', '@netlify/mcp'], active: true, hasSecrets: true, secretKeyNames: ['NETLIFY_PERSONAL_ACCESS_TOKEN'], sourceId: 'settings_json' },
  ],
}

export const mockNotInstalledAgent: Agent = {
  id: 'ollama',
  name: 'Ollama',
  installed: false,
  supportsSkills: false,
  supportsMcps: false,
  skills: [],
  mcps: [],
}
