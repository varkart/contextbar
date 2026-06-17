import { test, expect } from '@playwright/test'
import { injectTauriMock, mockClaudeTool, mockCursorTool } from '../fixtures/tauri-mock'

const defaultTools = [mockClaudeTool, mockCursorTool]

// Navigate to tool detail and open permissions panel
async function openPermissionsPanel(page: import('@playwright/test').Page) {
  await page.getByText('Claude Code').click()
  await page.waitForSelector('[aria-label="Open permissions"]')
  await page.getByLabel('Open permissions').first().click()
  await page.waitForSelector('text=Permissions')
}

// ── Activity Log ──────────────────────────────────────────────────────────────

test.describe('activity log panel', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page, {}, defaultTools)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
  })

  test('navigates to activity log via Settings', async ({ page }) => {
    await page.getByLabel(/open settings/i).click()
    await page.waitForSelector('text=Settings')
    await page.getByText('Activity Log').click()
    await expect(page.getByText('Activity Log')).toBeVisible()
  })

  test('activity log shows empty state when no events', async ({ page }) => {
    await page.getByLabel(/open settings/i).click()
    await page.waitForSelector('text=Settings')
    await page.getByText('Activity Log').click()
    await page.waitForSelector('text=Activity Log')
    await expect(page.getByText(/no activity yet/i)).toBeVisible()
  })

  test('back from activity log returns to main list', async ({ page }) => {
    await page.getByLabel(/open settings/i).click()
    await page.waitForSelector('text=Settings')
    await page.getByText('Activity Log').click()
    await page.waitForSelector('text=Activity Log')
    await page.getByLabel('Back').click()
    await expect(page.getByText('Claude Code')).toBeVisible()
  })

  test('Escape from activity log returns to main list', async ({ page }) => {
    await page.getByLabel(/open settings/i).click()
    await page.waitForSelector('text=Settings')
    await page.getByText('Activity Log').click()
    await page.waitForSelector('text=Activity Log')
    await page.keyboard.press('Escape')
    await expect(page.getByText('Claude Code')).toBeVisible()
  })
})

test.describe('activity log — with events', () => {
  test('shows audit events when present', async ({ page }) => {
    // Register tauri mock first so __TAURI_INTERNALS__ exists when the override runs
    await injectTauriMock(page, {}, defaultTools)

    // Override get_audit_log after mock is registered (scripts run in order)
    await page.addInitScript(() => {
      const tauri = (globalThis as Record<string, unknown>).__TAURI_INTERNALS__ as {
        invoke: (cmd: string, args?: unknown) => Promise<unknown>
      } | undefined
      if (!tauri) return
      const orig = tauri.invoke.bind(tauri)
      tauri.invoke = (cmd: string, args?: unknown) => {
        if (cmd === 'get_audit_log') {
          return Promise.resolve([
            { id: 1, ts_ms: Date.now() - 5000,   event_type: 'skill_toggled', tool_id: 'claude', item_name: 'impeccable', detail: 'active → inactive' },
            { id: 2, ts_ms: Date.now() - 120000, event_type: 'mcp_toggled',   tool_id: 'claude', item_name: 'github',     detail: 'inactive → active' },
          ])
        }
        return orig(cmd, args)
      }
    })

    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await page.getByLabel(/open settings/i).click()
    await page.waitForSelector('text=Settings')
    await page.getByText('Activity Log').click()
    await page.waitForSelector('text=Activity Log')

    await expect(page.getByText('impeccable')).toBeVisible()
    await expect(page.getByText('github')).toBeVisible()
  })
})

// ── Permissions Panel ─────────────────────────────────────────────────────────

test.describe('permissions panel — empty state', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page, {}, defaultTools)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openPermissionsPanel(page)
  })

  test('shows Permissions heading', async ({ page }) => {
    await expect(page.getByText('Permissions', { exact: true })).toBeVisible()
  })

  test('shows tool name in breadcrumb', async ({ page }) => {
    await expect(page.getByText('Claude Code').first()).toBeVisible()
  })

  test('back button returns to tool detail', async ({ page }) => {
    await page.getByLabel('Back').click()
    await expect(page.getByText('Skills').first()).toBeVisible()
  })

  test('Escape returns to tool detail', async ({ page }) => {
    await page.keyboard.press('Escape')
    await expect(page.getByText('Skills').first()).toBeVisible()
  })

  test('shows empty state message', async ({ page }) => {
    await expect(page.getByText('No custom rules')).toBeVisible()
  })
})

test.describe('permissions panel — with rules', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page, {}, defaultTools)

    // Override get_permissions after base mock is registered
    await page.addInitScript(() => {
      const tauri = (globalThis as Record<string, unknown>).__TAURI_INTERNALS__ as {
        invoke: (cmd: string, args?: unknown) => Promise<unknown>
      } | undefined
      if (!tauri) return
      const orig = tauri.invoke.bind(tauri)
      tauri.invoke = (cmd: string, args?: unknown) => {
        if (cmd === 'get_permissions') {
          return Promise.resolve({
            allow: ['Bash(npm run test)', 'Read(/home/user/*)'],
            deny:  ['Bash(rm -rf *)'],
          })
        }
        return orig(cmd, args)
      }
    })

    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openPermissionsPanel(page)
  })

  test('shows allow rules', async ({ page }) => {
    await expect(page.getByText('Bash(npm run test)')).toBeVisible()
    await expect(page.getByText('Read(/home/user/*)')).toBeVisible()
  })

  test('shows deny rules', async ({ page }) => {
    await expect(page.getByText('Bash(rm -rf *)')).toBeVisible()
  })

  test('shows total rule count in header', async ({ page }) => {
    // 2 allow + 1 deny = 3 total shown in header
    await expect(page.getByText('3').first()).toBeVisible()
  })
})
