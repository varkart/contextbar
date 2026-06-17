import { test, expect } from '@playwright/test'
import {
  injectTauriMock,
  mockClaudeWithMcpVariants,
  mockCursorTool,
} from '../fixtures/tauri-mock'

const tools = [mockClaudeWithMcpVariants, mockCursorTool]

async function openClaudeDetail(page: Parameters<typeof injectTauriMock>[0]) {
  await page.getByText('Claude Code').click()
  await page.waitForSelector('text=MCPs', { timeout: 5000 })
}

// ── Navigation / listing ──────────────────────────────────────────────────────

test.describe('MCP listing', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page, {}, tools)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)
  })

  test('active MCPs shown in tool detail', async ({ page }) => {
    await expect(page.getByText('github')).toBeVisible()
    await expect(page.getByText('remote-http')).toBeVisible()
  })

  test('inactive MCP shown with opacity-40', async ({ page }) => {
    const row = page.locator('.opacity-40', { hasText: 'filesystem' })
    await expect(row).toBeVisible()
  })

  test('MCP with secrets shows lock indicator', async ({ page }) => {
    await expect(page.getByLabel('has env secrets').first()).toBeVisible()
  })

  test('HTTP MCP with URL shown', async ({ page }) => {
    await expect(page.getByText('remote-http')).toBeVisible()
  })
})

// ── Toggle UI states ──────────────────────────────────────────────────────────

test.describe('MCP toggle — detail panel UI states', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page, {}, tools)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)
  })

  test('active MCP detail shows Disable MCP button', async ({ page }) => {
    await page.getByText('github').click()
    await expect(page.getByLabel('Disable MCP')).toBeVisible()
    await expect(page.getByLabel('Disable MCP')).not.toBeDisabled()
  })

  test('inactive MCP detail shows Enable MCP button', async ({ page }) => {
    await page.getByText('filesystem').click()
    await expect(page.getByLabel('Enable MCP')).toBeVisible()
    await expect(page.getByLabel('Enable MCP')).not.toBeDisabled()
  })

  test('MCP with secrets shows key names in detail', async ({ page }) => {
    await page.getByText('github').click()
    await expect(page.getByText('GITHUB_TOKEN')).toBeVisible()
  })

  test('HTTP MCP detail shows URL', async ({ page }) => {
    await page.getByText('remote-http').click()
    await expect(page.getByText(/mcp\.example\.com/)).toBeVisible()
  })
})

// ── Disable flow ──────────────────────────────────────────────────────────────

test.describe('MCP toggle — disable flow', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page, {}, tools)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)
  })

  test('disabling active MCP then re-entering shows Enable button', async ({ page }) => {
    await page.getByText('github').click()
    await page.getByLabel('Disable MCP').dispatchEvent('click')
    await page.waitForTimeout(300)

    await page.getByLabel('Back').click()
    await page.getByText('github').click()

    await expect(page.getByLabel('Enable MCP')).toBeVisible()
  })

  test('enabling inactive MCP then re-entering shows Disable button', async ({ page }) => {
    await page.getByText('filesystem').click()
    await page.getByLabel('Enable MCP').dispatchEvent('click')
    await page.waitForTimeout(300)

    await page.getByLabel('Back').click()
    await page.getByText('filesystem').click()

    await expect(page.getByLabel('Disable MCP')).toBeVisible()
  })
})

// ── Loading state ─────────────────────────────────────────────────────────────

test.describe('MCP toggle — loading state', () => {
  test('toggle re-enables after slow IPC resolves', async ({ page }) => {
    await injectTauriMock(page, { set_mcp_active: 'slow' }, tools)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)

    await page.getByText('github').click()
    await page.getByLabel('Disable MCP').dispatchEvent('click')

    // Label changes to Enable MCP after toggle — use either label
    const toggle = page.locator('[aria-label="Disable MCP"],[aria-label="Enable MCP"]').first()
    await expect(toggle).not.toBeDisabled({ timeout: 3000 })
  })
})

// ── Error handling ────────────────────────────────────────────────────────────

test.describe('MCP toggle — error handling', () => {
  test('IPC error does not crash — MCP detail still visible', async ({ page }) => {
    await injectTauriMock(page, { set_mcp_active: 'error' }, tools)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)

    await page.getByText('github').click()
    await page.getByLabel('Disable MCP').dispatchEvent('click')
    await page.waitForTimeout(400)

    await expect(page.getByText('github').first()).toBeVisible()
  })

  test('IPC error shows inline toggle error message', async ({ page }) => {
    await injectTauriMock(page, { set_mcp_active: 'error' }, tools)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)

    await page.getByText('github').click()
    await page.getByLabel('Disable MCP').dispatchEvent('click')
    await page.waitForTimeout(400)

    await expect(page.getByText(/permission denied/i)).toBeVisible()
  })
})

// ── HTTP MCP detail ───────────────────────────────────────────────────────────

test.describe('HTTP MCP detail', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page, {}, tools)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)
    await page.getByText('remote-http').click()
    await page.waitForSelector('text=remote-http')
  })

  test('shows HTTP MCP URL', async ({ page }) => {
    await expect(page.getByText(/mcp\.example\.com/)).toBeVisible()
  })

  test('shows HTTP MCP discoverable note', async ({ page }) => {
    await expect(page.getByText(/HTTP MCP.*tools discoverable only when connected/i)).toBeVisible()
  })

  test('shows secret key names for HTTP MCP', async ({ page }) => {
    await expect(page.getByText(/Authorization/)).toBeVisible()
  })

  test('does not show Live tools section for HTTP MCP', async ({ page }) => {
    await expect(page.getByText('Live tools')).not.toBeVisible()
  })
})

// ── Live tools query ──────────────────────────────────────────────────────────

test.describe('MCP live tools — stdio', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page, {}, tools)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)
  })

  test('stdio MCP shows Live tools section', async ({ page }) => {
    await page.getByText('github').click()
    await expect(page.getByText('Live tools')).toBeVisible()
  })

  test('stdio MCP shows queried tool names', async ({ page }) => {
    await page.getByText('github').click()
    await expect(page.getByText('list_issues')).toBeVisible()
    await expect(page.getByText('create_pr')).toBeVisible()
  })

  test('query_mcp_tools error shows error message', async ({ page }) => {
    await injectTauriMock(page, {}, tools)
    await page.addInitScript(() => {
      const tauri = (globalThis as Record<string, unknown>).__TAURI_INTERNALS__ as {
        invoke: (cmd: string, args?: unknown) => Promise<unknown>
      } | undefined
      if (!tauri) return
      const orig = tauri.invoke.bind(tauri)
      tauri.invoke = (cmd: string, args?: unknown) => {
        if (cmd === 'query_mcp_tools') return Promise.reject(new Error('connection refused'))
        return orig(cmd, args)
      }
    })
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)
    await page.getByText('github').click()
    await expect(page.getByText(/connection refused/i)).toBeVisible()
  })
})
