import type { Page } from '@playwright/test'
import type { AiTool } from '../../src/types'

export const mockClaudeTool: AiTool = {
  id: 'claude',
  name: 'Claude Code',
  version: '1.0.0',
  installed: true,
  skills: [
    { name: 'impeccable', path: '/home/.claude/skills/impeccable', description: 'UI polish', active: true },
    { name: 'graphify',   path: '/home/.claude/skills/graphify',   description: 'Graphs',    active: true },
    { name: 'xlsx',       path: '/home/.claude/skills/.disabled/xlsx', description: 'Excel', active: false },
  ],
  mcps: [
    { name: 'github', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'],
      active: true, hasSecrets: true, secretKeyNames: ['GITHUB_TOKEN'] },
  ],
  error: undefined,
}

export const mockCursorTool: AiTool = {
  id: 'cursor',
  name: 'Cursor',
  version: '0.40.0',
  installed: true,
  skills: [
    { name: 'babysit', path: '/home/.cursor/skills-cursor/babysit', description: 'Monitor PRs', active: true },
  ],
  mcps: [],
  error: undefined,
}

export type MockOverrides = {
  set_skill_active?: 'success' | 'error' | 'slow'
}

export async function injectTauriMock(page: Page, overrides: MockOverrides = {}) {
  // Pass data + config as plain JSON — no closure serialization issues
  const initData = {
    tools: [
      JSON.parse(JSON.stringify(mockClaudeTool)),
      JSON.parse(JSON.stringify(mockCursorTool)),
    ] as AiTool[],
    overrides,
  }

  await page.addInitScript((data: typeof initData) => {
    const { tools, overrides } = data

    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke: (cmd: string, args?: Record<string, unknown>) => {
        switch (cmd) {
          case 'get_tools':
            // Deep copy — ensures React sees new references on re-fetch after mutation
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

          case 'query_mcp_tools':
            return Promise.resolve([
              { name: 'list_issues', description: 'List GitHub issues' },
              { name: 'create_pr',   description: 'Create a pull request' },
            ])

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

      // Event system stubs (listen/emit/once)
      listen: (_event: string, _handler: unknown) => Promise.resolve(() => {}),
      emit: () => Promise.resolve(),
      once: (_event: string, _handler: unknown) => Promise.resolve(() => {}),
    }
  }, initData)
}
