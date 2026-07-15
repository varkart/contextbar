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

export type ExpandedMockData = {
  sessions?: unknown[]
  sessionDetails?: Record<string, unknown>
  repos?: unknown[]
  insights?: unknown
  tokenPoints?: unknown[]
  promptTimestamps?: number[]
  commitTimestamps?: number[]
}

export async function injectTauriMock(
  page: Page,
  overrides: MockOverrides = {},
  tools?: AiTool[],
  options: { windowLabel?: string; expanded?: ExpandedMockData } = {},
) {
  const initData = {
    tools: JSON.parse(JSON.stringify(
      tools ?? [mockClaudeTool, mockCursorTool]
    )) as AiTool[],
    overrides,
    notifications: JSON.parse(JSON.stringify(
      overrides.notifications ?? []
    )) as Notification[],
    windowLabel: options.windowLabel ?? 'main',
    expanded: JSON.parse(JSON.stringify(options.expanded ?? {})) as ExpandedMockData,
  }

  await page.addInitScript((data: typeof initData) => {
    const { tools, overrides, notifications: initNotifs, windowLabel, expanded } = data
    // skip the 5-second splash in E2E
    ;(globalThis as unknown as Record<string, unknown>).__skipSplash = true
    // mutable copy for dismiss operations
    let notifState: typeof initNotifs = [...initNotifs]

    // ── event plumbing: lets tests fire backend events into the app ──────────
    // Tauri v2 `listen()` goes through invoke('plugin:event|listen') with a
    // callback id produced by transformCallback. We register callbacks and
    // expose window.__emitMockEvent(name, payload) for specs.
    const callbacks = new Map<number, (payload: unknown) => void>()
    const eventHandlers = new Map<string, Set<number>>()
    let nextCallbackId = 1
    // Assertable log of side-effectful invokes: window.__invokeLog
    const invokeLog: { cmd: string; args: unknown }[] = []
    ;(globalThis as unknown as Record<string, unknown>).__invokeLog = invokeLog
    ;(globalThis as unknown as Record<string, unknown>).__emitMockEvent = (
      name: string,
      payload: unknown,
    ) => {
      for (const id of eventHandlers.get(name) ?? []) {
        const cb = callbacks.get(id)
        if (cb) cb({ event: name, id, payload })
      }
    }

    ;(globalThis as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      transformCallback: (cb: (payload: unknown) => void) => {
        const id = nextCallbackId++
        callbacks.set(id, cb)
        return id
      },
      invoke: (cmd: string, args?: Record<string, unknown>) => {
        if (
          cmd === 'resume_in_terminal' || cmd === 'open_in_vscode' ||
          cmd === 'remove_worktree' || cmd === 'open_expanded_window' ||
          cmd === 'set_terminal'
        ) {
          invokeLog.push({ cmd, args: args ?? {} })
        }
        switch (cmd) {
          // Tauri v2 event plugin
          case 'plugin:event|listen': {
            const { event, handler } = (args ?? {}) as { event: string; handler: number }
            if (!eventHandlers.has(event)) eventHandlers.set(event, new Set())
            eventHandlers.get(event)!.add(handler)
            return Promise.resolve(handler)
          }
          case 'plugin:event|unlisten': {
            const { eventId } = (args ?? {}) as { eventId: number }
            for (const ids of eventHandlers.values()) ids.delete(eventId)
            callbacks.delete(eventId)
            return Promise.resolve(null)
          }

          // Current name for tool detection (get_tools kept for old specs)
          case 'get_agents':
            return Promise.resolve(JSON.parse(JSON.stringify(tools)))

          // ── expanded window data ─────────────────────────────────────────
          case 'list_sessions':
            return Promise.resolve(JSON.parse(JSON.stringify(expanded.sessions ?? [])))
          case 'get_session': {
            const id = ((args ?? {}) as { sessionId?: string }).sessionId ?? ''
            const detail = (expanded.sessionDetails ?? {})[id]
            return detail
              ? Promise.resolve(JSON.parse(JSON.stringify(detail)))
              : Promise.reject(new Error(`session ${id} not found`))
          }
          case 'list_worktrees':
            return Promise.resolve(JSON.parse(JSON.stringify(expanded.repos ?? [])))
          case 'get_session_insights':
            return Promise.resolve(JSON.parse(JSON.stringify(
              expanded.insights ?? {
                sessionsAnalyzed: 0, inputTokens: 0, outputTokens: 0,
                cacheReadTokens: 0, cacheCreationTokens: 0, estCostUsd: 0,
                cacheReadRatio: 0, avgToolCalls: 0, perModel: [], perProject: [],
                toolCounts: [], mcpToolCounts: [], skillCounts: [], heaviest: null,
              }
            )))
          case 'get_token_activity':
            return Promise.resolve(JSON.parse(JSON.stringify(expanded.tokenPoints ?? [])))
          case 'get_prompt_timestamps':
            return Promise.resolve([...(expanded.promptTimestamps ?? [])])
          case 'get_commit_activity':
            return Promise.resolve([...(expanded.commitTimestamps ?? [])])
          case 'warm_session_stats':
          case 'warm_skill_cache':
          case 'warm_mcp_cache':
            return Promise.resolve(null)
          case 'get_history_stats':
            return Promise.resolve({ totalSessions: 0, totalTokens: 0 })
          case 'list_session_projects':
            return Promise.resolve([])
          case 'get_file_mtimes':
            return Promise.resolve({})
          case 'list_terminals':
            return Promise.resolve(['Terminal', 'iTerm2'])
          case 'get_terminal':
            return Promise.resolve('Terminal')
          case 'set_terminal':
            return Promise.resolve(null)
          case 'is_vscode_installed':
            return Promise.resolve(true)
          case 'open_in_vscode':
          case 'resume_in_terminal':
          case 'open_expanded_window':
            return Promise.resolve(null)
          case 'remove_worktree':
            return Promise.resolve(null)
          case 'read_markdown_file':
            return Promise.resolve('# Mock heading\n\nMock markdown body.')
          case 'reveal_in_finder':
          case 'open_path':
          case 'open_url':
            return Promise.resolve(null)
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
        currentWindow: { label: windowLabel },
        currentWebview: { label: windowLabel },
        windows: [{ label: windowLabel }],
      },

      listen: (_event: string, _handler: unknown) => Promise.resolve(() => {}),
      emit: () => Promise.resolve(),
      once: (_event: string, _handler: unknown) => Promise.resolve(() => {}),
    }
  }, initData)
}
