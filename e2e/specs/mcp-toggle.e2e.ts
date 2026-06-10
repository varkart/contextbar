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

// ── UI states ────────────────────────────────────────────────────────────────

test.describe('MCP toggle — UI states', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page, {}, tools)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)
  })

  test('active MCP shows "Disable MCP" button', async ({ page }) => {
    await expect(page.getByLabel('Disable MCP').first()).toBeVisible()
    await expect(page.getByLabel('Disable MCP').first()).not.toBeDisabled()
  })

  test('inactive MCP shows "Enable MCP" button', async ({ page }) => {
    await expect(page.getByLabel('Enable MCP')).toBeVisible()
  })

  test('MCP with secrets shows secrets indicator', async ({ page }) => {
    await expect(page.getByLabel('has env secrets').first()).toBeVisible()
  })

  test('HTTP MCP with URL shows without command', async ({ page }) => {
    await expect(page.getByText('remote-http')).toBeVisible()
  })

  test('tool row shows correct MCP count (3)', async ({ page }) => {
    await page.getByLabel('Back').click()
    await expect(page.getByText('3 mcp')).toBeVisible()
  })
})

// ── Disable flow ─────────────────────────────────────────────────────────────

test.describe('MCP toggle — disable flow', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page, {}, tools)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)
  })

  test('disabling active MCP then re-entering shows Enable MCP button', async ({ page }) => {
    // github and remote-http are active → 2 Disable MCP buttons
    await expect(page.getByLabel('Disable MCP')).toHaveCount(2)

    await page.getByLabel('Disable MCP').first().dispatchEvent('click')
    await page.waitForTimeout(300)

    await page.getByLabel('Back').click()
    await openClaudeDetail(page)

    // Now filesystem + newly-disabled → 2 Enable MCP buttons
    await expect(page.getByLabel('Enable MCP')).toHaveCount(2)
  })

  test('enabling inactive MCP then re-entering shows Disable MCP button', async ({ page }) => {
    // filesystem starts inactive — 1 Enable MCP
    await expect(page.getByLabel('Enable MCP')).toHaveCount(1)

    await page.getByLabel('Enable MCP').dispatchEvent('click')
    await page.waitForTimeout(300)

    await page.getByLabel('Back').click()
    await openClaudeDetail(page)

    // All 3 now active → 0 Enable MCP buttons
    await expect(page.getByLabel('Enable MCP')).toHaveCount(0)
  })
})

// ── Loading state ────────────────────────────────────────────────────────────

test.describe('MCP toggle — loading state', () => {
  test('toggle re-enables after slow IPC resolves', async ({ page }) => {
    await injectTauriMock(page, { set_mcp_active: 'slow' }, tools)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)

    const toggle = page.getByLabel('Disable MCP').first()
    await toggle.dispatchEvent('click')

    await expect(toggle).not.toBeDisabled({ timeout: 3000 })
  })
})

// ── Error handling ───────────────────────────────────────────────────────────

test.describe('MCP toggle — error handling', () => {
  test('IPC error does not crash — MCPs still visible', async ({ page }) => {
    await injectTauriMock(page, { set_mcp_active: 'error' }, tools)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)

    await page.getByLabel('Disable MCP').first().dispatchEvent('click')
    await page.waitForTimeout(400)

    await expect(page.getByText('github').first()).toBeVisible()
    await expect(page.getByText('MCPs').first()).toBeVisible()
  })
})

// ── MCP detail panel ─────────────────────────────────────────────────────────

test.describe('MCP detail panel', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page, {}, tools)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)
  })

  test('clicking MCP with secrets opens detail showing key names', async ({ page }) => {
    await page.getByText('github').click()
    // Secret key name visible, not the value
    await expect(page.getByText('GITHUB_TOKEN')).toBeVisible()
  })

  test('MCP detail back button returns to tool detail', async ({ page }) => {
    await page.getByText('github').click()
    await page.getByLabel('Back').click()
    await expect(page.getByText('MCPs').first()).toBeVisible()
  })

  test('HTTP MCP detail shows URL', async ({ page }) => {
    await page.getByText('remote-http').click()
    await expect(page.getByText(/mcp\.example\.com/)).toBeVisible()
  })
})
