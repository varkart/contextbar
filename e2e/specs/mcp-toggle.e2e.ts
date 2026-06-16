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
})
