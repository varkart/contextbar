import type { AiTool } from '../types'

export const mockClaudeTool: AiTool = {
  id: 'claude',
  name: 'Claude Code',
  version: '1.0.0',
  installed: true,
  skills: [
    { name: 'impeccable', path: '~/.claude/skills/impeccable', description: 'Polish frontend UI', active: true, sourceId: 'skills_dir' },
    { name: 'design-taste-frontend', path: '~/.claude/skills/design-taste-frontend', description: undefined, active: true, sourceId: 'skills_dir' },
  ],
  mcps: [
    { name: 'github', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], active: true, hasSecrets: true, secretKeyNames: ['GITHUB_PERSONAL_ACCESS_TOKEN'], sourceId: 'settings_json' },
    { name: 'netlify', command: 'npx', args: ['-y', '@netlify/mcp'], active: true, hasSecrets: true, secretKeyNames: ['NETLIFY_PERSONAL_ACCESS_TOKEN'], sourceId: 'settings_json' },
  ],
}

export const mockNotInstalledTool: AiTool = {
  id: 'ollama',
  name: 'Ollama',
  installed: false,
  skills: [],
  mcps: [],
}
