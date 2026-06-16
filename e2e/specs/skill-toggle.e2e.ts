import { test, expect } from '@playwright/test'
import { injectTauriMock } from '../fixtures/tauri-mock'

async function openClaudeDetail(page: Parameters<typeof injectTauriMock>[0]) {
  await page.getByText('Claude Code').click()
  await page.waitForSelector('text=Skills', { timeout: 5000 })
}

async function openSkillDetail(page: Parameters<typeof injectTauriMock>[0], skillName: string) {
  await page.getByText(skillName).click()
  await page.waitForSelector('text=Disable\n|text=Enable', { timeout: 3000 }).catch(() => {})
}

// ── Navigation ────────────────────────────────────────────────────────────────

test.describe('skill navigation', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)
  })

  test('skills are listed in tool detail', async ({ page }) => {
    await expect(page.getByText('impeccable')).toBeVisible()
    await expect(page.getByText('graphify')).toBeVisible()
    await expect(page.getByText('xlsx')).toBeVisible()
  })

  test('inactive skill row has opacity-40 class', async ({ page }) => {
    const disabledRow = page.locator('.opacity-40').first()
    await expect(disabledRow).toBeVisible()
    await expect(disabledRow).toContainText('xlsx')
  })

  test('clicking a skill navigates to skill detail panel', async ({ page }) => {
    await page.getByText('impeccable').click()
    await expect(page.getByText('UI polish')).toBeVisible()
  })

  test('skill detail back button returns to tool detail', async ({ page }) => {
    await page.getByText('impeccable').click()
    await page.getByLabel('Back').click()
    await expect(page.getByText('Skills').first()).toBeVisible()
  })
})

// ── Toggle UI states ──────────────────────────────────────────────────────────

test.describe('skill toggle — detail panel UI states', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)
  })

  test('active skill detail shows Disable button', async ({ page }) => {
    await page.getByText('impeccable').click()
    await expect(page.getByLabel('Disable skill')).toBeVisible()
    await expect(page.getByLabel('Disable skill')).not.toBeDisabled()
  })

  test('inactive skill detail shows Enable button', async ({ page }) => {
    await page.getByText('xlsx').click()
    await expect(page.getByLabel('Enable skill')).toBeVisible()
    await expect(page.getByLabel('Enable skill')).not.toBeDisabled()
  })
})

// ── Toggle flow ───────────────────────────────────────────────────────────────

test.describe('skill toggle — disable flow', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)
  })

  test('disabling active skill then re-entering shows Enable button', async ({ page }) => {
    // open impeccable (active) and disable it
    await page.getByText('impeccable').click()
    await page.getByLabel('Disable skill').dispatchEvent('click')
    await page.waitForTimeout(300)

    // back to tool detail, then back into impeccable
    await page.getByLabel('Back').click()
    await page.getByText('impeccable').click()

    await expect(page.getByLabel('Enable skill')).toBeVisible()
  })

  test('enabling inactive skill then re-entering shows Disable button', async ({ page }) => {
    await page.getByText('xlsx').click()
    await page.getByLabel('Enable skill').dispatchEvent('click')
    await page.waitForTimeout(300)

    await page.getByLabel('Back').click()
    await page.getByText('xlsx').click()

    await expect(page.getByLabel('Disable skill')).toBeVisible()
  })
})

// ── Loading state ─────────────────────────────────────────────────────────────

test.describe('skill toggle — loading state', () => {
  test('toggle re-enables after slow IPC resolves', async ({ page }) => {
    await injectTauriMock(page, { set_skill_active: 'slow' })
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)

    await page.getByText('impeccable').click()
    await page.getByLabel('Disable skill').dispatchEvent('click')

    // Label changes to Enable skill after toggle — use either label
    const toggle = page.locator('[aria-label="Disable skill"],[aria-label="Enable skill"]').first()
    await expect(toggle).not.toBeDisabled({ timeout: 3000 })
  })
})

// ── Error handling ────────────────────────────────────────────────────────────

test.describe('skill toggle — error handling', () => {
  test('IPC error does not crash — skill detail still visible', async ({ page }) => {
    await injectTauriMock(page, { set_skill_active: 'error' })
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)

    await page.getByText('impeccable').click()
    await page.getByLabel('Disable skill').dispatchEvent('click')
    await page.waitForTimeout(400)

    await expect(page.getByText('impeccable').first()).toBeVisible()
  })
})

// ── MCP navigation ────────────────────────────────────────────────────────────

test.describe('MCP navigation', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)
  })

  test('MCP shows in tool detail', async ({ page }) => {
    await expect(page.getByText('github')).toBeVisible()
  })

  test('clicking MCP navigates to MCP detail', async ({ page }) => {
    await page.getByText('github').click()
    await expect(page.locator('span.text-\\[12px\\]', { hasText: 'MCP' }).first()).toBeVisible()
  })

  test('MCP detail back button returns to tool detail', async ({ page }) => {
    await page.getByText('github').click()
    await page.getByLabel('Back').click()
    await expect(page.getByText('Skills').first()).toBeVisible()
  })
})
