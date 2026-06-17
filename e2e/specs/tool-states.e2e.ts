import { test, expect } from '@playwright/test'
import {
  injectTauriMock,
  mockClaudeTool,
  mockCursorTool,
  mockWindsurfTool,
  mockKiroTool,
  mockGeminiErrorTool,
  mockAiderNoConfigTool,
} from '../fixtures/tauri-mock'

const allTools = [
  mockClaudeTool,
  mockCursorTool,
  mockWindsurfTool,
  mockKiroTool,
  mockGeminiErrorTool,
  mockAiderNoConfigTool,
]

// ── Version display ──────────────────────────────────────────────────────────

test.describe('tool version display', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page, {}, allTools)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
  })

  test('version shown in Notes section on tool detail page', async ({ page }) => {
    await page.getByText('Claude Code').click()
    await page.waitForSelector('text=Notes', { timeout: 8000 })
    await expect(page.getByText('1.0.0')).toBeVisible()
  })

  test('cursor version shown in tool detail Notes section', async ({ page }) => {
    await page.getByText('Cursor').click()
    await page.waitForSelector('text=Notes', { timeout: 5000 })
    await expect(page.getByText('0.40.0')).toBeVisible()
  })

  test('version not shown in tool row', async ({ page }) => {
    // Version moved to detail page — row should not show it
    const claudeRow = page.locator('button', { hasText: 'Claude Code' })
    await expect(claudeRow.getByText('1.0.0')).not.toBeVisible()
  })

  test('gemini version shown in detail Notes section', async ({ page }) => {
    await page.locator('button', { hasText: 'Gemini CLI' }).click()
    await page.waitForSelector('text=Notes', { timeout: 5000 })
    await expect(page.getByText('0.1.9')).toBeVisible()
  })
})

// ── Not-installed tool ───────────────────────────────────────────────────────
// Note: App.tsx filters out not-installed tools (installedTools = tools.filter(t => t.installed))
// so not-installed tools never appear in the main list.
// The ToolRow disabled/not-found rendering is covered by src/components/__tests__/ToolRow.test.tsx.

test.describe('not-installed tool', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page, {}, allTools)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
  })

  test('not-installed tool (Kiro) is absent from main list', async ({ page }) => {
    await expect(page.getByText('Kiro')).not.toBeVisible()
  })

  test('installed tools still all visible when not-installed tools in data', async ({ page }) => {
    await expect(page.getByText('Claude Code')).toBeVisible()
    await expect(page.getByText('Cursor')).toBeVisible()
    await expect(page.getByText('Windsurf')).toBeVisible()
  })
})

// ── Tool with error ──────────────────────────────────────────────────────────

test.describe('tool with error', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page, {}, allTools)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
  })

  test('tool with error still appears in list', async ({ page }) => {
    await expect(page.getByText('Gemini CLI')).toBeVisible()
  })

  test('tool with error is still navigable (installed=true)', async ({ page }) => {
    const geminiRow = page.locator('button', { hasText: 'Gemini CLI' })
    await expect(geminiRow).not.toBeDisabled()
  })

  test('tool with error navigates to detail page', async ({ page }) => {
    await page.locator('button', { hasText: 'Gemini CLI' }).click()
    await expect(page.getByText('LLM Manager')).toBeVisible()
    await page.getByLabel('Back').click()
  })
})

// ── No-config tool (installed, no skills/MCPs) ───────────────────────────────

test.describe('no-config tool', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page, {}, allTools)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
  })

  test('no-config tool appears in list without counts', async ({ page }) => {
    const aiderRow = page.locator('button', { hasText: 'Aider' })
    await expect(aiderRow).toBeVisible()
    await expect(aiderRow.getByText(/skills/)).not.toBeVisible()
    await expect(aiderRow.getByText(/mcp/)).not.toBeVisible()
  })

  test('no-config tool is navigable', async ({ page }) => {
    await page.locator('button', { hasText: 'Aider' }).click()
    await expect(page.getByText('LLM Manager')).toBeVisible()
    await page.getByLabel('Back').click()
  })
})

// ── Windsurf MCPs ────────────────────────────────────────────────────────────

test.describe('Windsurf MCP display', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page, {}, allTools)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
  })

  test('Windsurf shows 3 mcp count in tool row', async ({ page }) => {
    const windsurfRow = page.locator('button', { hasText: 'Windsurf' })
    await expect(windsurfRow.getByText('3 mcp')).toBeVisible()
  })

  test('Windsurf tool row shows no skill count (no skills)', async ({ page }) => {
    const windsurfRow = page.locator('button', { hasText: 'Windsurf' })
    await expect(windsurfRow.getByText(/skills/)).not.toBeVisible()
  })

  test('Windsurf detail shows all 3 MCPs', async ({ page }) => {
    await page.locator('button', { hasText: 'Windsurf' }).click()
    await page.waitForSelector('text=MCPs', { timeout: 5000 })

    await expect(page.getByText('mcp-playwright')).toBeVisible()
    await expect(page.getByText('sequential-thinking')).toBeVisible()
    await expect(page.getByText('sql-explorer')).toBeVisible()
  })

  test('Windsurf detail shows inactive MCP (sql-explorer) with opacity-40', async ({ page }) => {
    await page.locator('button', { hasText: 'Windsurf' }).click()
    await page.waitForSelector('text=MCPs', { timeout: 5000 })

    const row = page.locator('.opacity-40', { hasText: 'sql-explorer' })
    await expect(row).toBeVisible()
  })

  test('Windsurf Skills section shows "None detected" (0 skills)', async ({ page }) => {
    await page.locator('button', { hasText: 'Windsurf' }).click()
    await page.waitForSelector('text=MCPs', { timeout: 5000 })

    // Skills section always renders; with 0 skills it shows "None detected"
    await expect(page.getByText('None detected')).toBeVisible()
  })
})

// ── Search with multiple tools ───────────────────────────────────────────────

test.describe('search across full tool list', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page, {}, allTools)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
  })

  test('search for "wind" shows only Windsurf', async ({ page }) => {
    const search = page.locator('input').first()
    await search.fill('wind')
    await expect(page.getByText('Windsurf')).toBeVisible()
    await expect(page.getByText('Claude Code')).not.toBeVisible()
    await expect(page.getByText('Cursor')).not.toBeVisible()
  })

  test('search for "kiro" finds not-installed tool', async ({ page }) => {
    const search = page.locator('input').first()
    await search.fill('kiro')
    await expect(page.getByText('Kiro')).toBeVisible()
  })

  test('search is case-insensitive', async ({ page }) => {
    const search = page.locator('input').first()
    await search.fill('CURSOR')
    await expect(page.getByText('Cursor')).toBeVisible()
    await expect(page.getByText('Claude Code')).not.toBeVisible()
  })
})
