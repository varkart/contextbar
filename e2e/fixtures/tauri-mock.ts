import type { Page } from '@playwright/test'
import type { AiTool, Notification } from '../../src/types'

export const mockClaudeTool: AiTool = {
  id: 'claude',
  name: 'Claude Code',
  version: '1.0.0',
  installed: true,
  skills: [
    { name: 'impeccable', path: '/home/.claude/skills/impeccable', description: 'UI polish', active: true,  sourceId: 'skills_dir' },
    { name: 'graphify',   path: '/home/.claude/skills/graphify',   description: 'Graphs',    active: true,  sourceId: 'skills_dir' },
    { name: 'xlsx',       path: '/home/.claude/skills/.disabled/xlsx', description: 'Excel', active: false, sourceId: 'skills_dir' },
  ],
  mcps: [
    { name: 'github', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'],
      active: true, hasSecrets: true, secretKeyNames: ['GITHUB_TOKEN'], sourceId: 'settings_json' },
  ],
  error: undefined,
}

export const mockCursorTool: AiTool = {
  id: 'cursor',
  name: 'Cursor',
  version: '0.40.0',
  installed: true,
  skills: [
    { name: 'babysit', path: '/home/.cursor/skills-cursor/babysit', description: 'Monitor PRs', active: true, sourceId: 'skills_dir' },
  ],
  mcps: [],
  error: undefined,
}

// Claude with richer MCP data: active + inactive + HTTP URL type
export const mockClaudeWithMcpVariants: AiTool = {
  ...mockClaudeTool,
  mcps: [
    {
      name: 'github',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      active: true,
      hasSecrets: true,
      secretKeyNames: ['GITHUB_TOKEN'],
      sourceId: 'settings_json',
    },
    {
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      active: false,
      hasSecrets: false,
      secretKeyNames: [],
      sourceId: 'settings_json',
    },
    {
      name: 'remote-http',
      command: '',
      args: [],
      url: 'https://mcp.example.com/sse',
      active: true,
      hasSecrets: true,
      secretKeyNames: ['Authorization'],
      sourceId: 'settings_json',
    },
  ],
}

// Windsurf: installed, 3 MCPs (matching real ~/.codeium/windsurf/mcp_config.json), no skills
export const mockWindsurfTool: AiTool = {
  id: 'windsurf',
  name: 'Windsurf',
  version: '1.10.0',
  installed: true,
  skills: [],
  mcps: [
    { name: 'mcp-playwright',       command: 'npx',  args: ['-y', '@playwright/mcp@latest'],                          active: true,  hasSecrets: false, secretKeyNames: [], sourceId: 'mcp_config' },
    { name: 'sequential-thinking',  command: 'npx',  args: ['-y', '@modelcontextprotocol/server-sequential-thinking'], active: true,  hasSecrets: false, secretKeyNames: [], sourceId: 'mcp_config' },
    { name: 'sql-explorer',         command: 'node', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],  active: false, hasSecrets: false, secretKeyNames: [], sourceId: 'mcp_config' },
  ],
  error: undefined,
}

// Aider: installed, no skills, no MCPs (no-config state)
export const mockAiderNoConfigTool: AiTool = {
  id: 'aider',
  name: 'Aider',
  version: '0.80.0',
  installed: true,
  skills: [],
  mcps: [],
  error: undefined,
}

// Kiro: not installed
export const mockKiroTool: AiTool = {
  id: 'kiro',
  name: 'Kiro',
  version: undefined,
  installed: false,
  skills: [],
  mcps: [],
  error: undefined,
}

// Gemini: installed but detector returned an error
export const mockGeminiErrorTool: AiTool = {
  id: 'gemini',
  name: 'Gemini CLI',
  version: '0.1.9',
  installed: true,
  skills: [],
  mcps: [],
  error: 'failed to parse ~/.gemini/settings.json: unexpected token',
}

export type MockOverrides = {
  set_skill_active?: 'success' | 'error' | 'slow'
  set_mcp_active?:   'success' | 'error' | 'slow'
  notifications?:    Notification[]
}

export async function injectTauriMock(
  page: Page,
  overrides: MockOverrides = {},
  tools?: AiTool[],
) {
  const initData = {
    tools: JSON.parse(JSON.stringify(
      tools ?? [mockClaudeTool, mockCursorTool]
    )) as AiTool[],
    overrides,
    notifications: JSON.parse(JSON.stringify(
      overrides.notifications ?? []
    )) as Notification[],
  }

  await page.addInitScript((data: typeof initData) => {
    const { tools, overrides, notifications: initNotifs } = data
    // skip the 5-second splash in E2E
    ;(globalThis as unknown as Record<string, unknown>).__skipSplash = true
    // mutable copy for dismiss operations
    let notifState: typeof initNotifs = [...initNotifs]

    ;(globalThis as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke: (cmd: string, args?: Record<string, unknown>) => {
        switch (cmd) {
          case 'get_tools':
            return Promise.resolve(JSON.parse(JSON.stringify(tools)))

          case 'get_version':
            return Promise.resolve('0.6.0')

          case 'get_autostart':
            return Promise.resolve(false)

          case 'get_shortcut':
            return Promise.resolve('Ctrl+Shift+A')

          case 'get_vibrancy':
            return Promise.resolve(true)

          case 'hide_window':
            return Promise.resolve(null)

          case 'get_notifications':
            return Promise.resolve(JSON.parse(JSON.stringify(notifState)))

          case 'dismiss_notification': {
            const id = (args ?? {}).id as number
            notifState = notifState.filter(n => n.id !== id)
            return Promise.resolve(null)
          }

          case 'dismiss_all_notifications':
            notifState = []
            return Promise.resolve(null)

          case 'get_permissions':
            return Promise.resolve({ allow: [], deny: [] })

          case 'set_skill_active': {
            const { toolId, skillName, active } = (args ?? {}) as {
              toolId: string; skillName: string; active: boolean
            }
            const mode = (overrides as Record<string, string>).set_skill_active ?? 'success'
            if (mode === 'error') return Promise.reject(new Error('permission denied'))
            const delay = mode === 'slow' ? new Promise<void>(r => setTimeout(r, 500)) : Promise.resolve()
            return delay.then(() => {
              const tool = tools.find((t: AiTool) => t.id === toolId)
              if (tool) {
                const skill = tool.skills.find((s: { name: string }) => s.name === skillName)
                if (skill) (skill as { active: boolean }).active = active
              }
              return null
            })
          }

          case 'set_mcp_active': {
            const { toolId, mcpName, active } = (args ?? {}) as {
              toolId: string; mcpName: string; active: boolean
            }
            const mode = (overrides as Record<string, string>).set_mcp_active ?? 'success'
            if (mode === 'error') return Promise.reject(new Error('permission denied'))
            const delay = mode === 'slow' ? new Promise<void>(r => setTimeout(r, 500)) : Promise.resolve()
            return delay.then(() => {
              const tool = tools.find((t: AiTool) => t.id === toolId)
              if (tool) {
                const mcp = tool.mcps.find((m: { name: string }) => m.name === mcpName)
                if (mcp) (mcp as { active: boolean }).active = active
              }
              return null
            })
          }

          case 'debug_add_notification':
            return Promise.resolve(null)

          case 'get_mcp_install_state': {
            const { command, args: mcpArgs } = (args ?? {}) as { command: string; args: string[] }
            if (command !== 'npx') return Promise.resolve({ package: null, installedVersion: null, isNpx: false })
            let skipNext = false
            let pkg: string | null = null
            for (const arg of (mcpArgs ?? [])) {
              if (skipNext) { skipNext = false; continue }
              if (arg === '-p' || arg === '--package' || arg === '--node-arg') { skipNext = true; continue }
              if (arg.startsWith('-')) continue
              const atIdx = arg.lastIndexOf('@')
              pkg = atIdx > 0 ? arg.slice(0, atIdx) : arg
              break
            }
            return Promise.resolve({ package: pkg, installedVersion: null, isNpx: pkg !== null })
          }

          case 'install_mcp_npm': {
            const { packageName } = (args ?? {}) as { packageName: string }
            return Promise.resolve(`0.0.0-mock-${packageName}`)
          }

          case 'get_mcp_npm_latest':
            return Promise.resolve(null)

          case 'query_mcp_tools':
            return Promise.resolve([
              { name: 'list_issues', description: 'List GitHub issues' },
              { name: 'create_pr',   description: 'Create a pull request' },
            ])

          case 'get_audit_log':
            return Promise.resolve([])

          case 'quit_app':
            return Promise.resolve(null)

          case 'check_for_update':
            return Promise.resolve(null)

          default:
            console.warn(`[tauri-mock] unhandled: ${cmd}`)
            return Promise.resolve(null)
        }
      },

      metadata: {
        currentWindow: { label: 'main' },
        windows: [{ label: 'main' }],
      },

      listen: (_event: string, _handler: unknown) => Promise.resolve(() => {}),
      emit: () => Promise.resolve(),
      once: (_event: string, _handler: unknown) => Promise.resolve(() => {}),
    }
  }, initData)
}
