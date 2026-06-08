import { test, expect } from '@playwright/test'
import { injectTauriMock } from '../fixtures/tauri-mock'

async function openClaudeDetail(page: Parameters<typeof injectTauriMock>[0]) {
  await page.getByText('Claude Code').click()
  await page.waitForSelector('text=Skills', { timeout: 5000 })
}

test.describe('skill toggle — UI states', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)
  })

  test('active skill shows "Disable skill" toggle', async ({ page }) => {
    await expect(page.getByLabel('Disable skill').first()).toBeVisible()
    await expect(page.getByLabel('Disable skill').first()).not.toBeDisabled()
  })

  test('disabled skill shows "Enable skill" toggle', async ({ page }) => {
    await expect(page.getByLabel('Enable skill')).toBeVisible()
  })

  test('disabled skill row has opacity-40 class', async ({ page }) => {
    const disabledRow = page.locator('.opacity-40').first()
    await expect(disabledRow).toBeVisible()
    await expect(disabledRow).toContainText('xlsx')
  })

  test('active skill row does not have opacity-40', async ({ page }) => {
    // Use a precise locator — the row containing exactly "impeccable" text
    const rows = page.locator('[aria-label="Disable skill"]').first().locator('xpath=..')
    await expect(rows).not.toHaveClass(/opacity-40/)
  })
})

test.describe('skill toggle — disable flow', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)
  })

  test('after disabling then re-entering, new Enable skill button appears', async ({ page }) => {
    await expect(page.getByLabel('Disable skill')).toHaveCount(2)
    await page.getByLabel('Disable skill').first().dispatchEvent('click')
    await page.waitForTimeout(300) // let IPC + re-fetch complete

    // Navigate away and back — picks up fresh tools state
    await page.getByLabel('Back').click()
    await page.getByText('Claude Code').click()
    await page.waitForSelector('text=Skills')

    // Now should have 2 Enable skill buttons (xlsx + newly disabled graphify)
    await expect(page.getByLabel('Enable skill')).toHaveCount(2)
  })

  test('after enabling then re-entering, Enable skill button disappears', async ({ page }) => {
    await expect(page.getByLabel('Enable skill')).toHaveCount(1)
    await page.getByLabel('Enable skill').dispatchEvent('click')
    await page.waitForTimeout(300)

    await page.getByLabel('Back').click()
    await page.getByText('Claude Code').click()
    await page.waitForSelector('text=Skills')

    // xlsx is now enabled — no more Enable skill buttons
    await expect(page.getByLabel('Enable skill')).toHaveCount(0)
  })
})

test.describe('skill toggle — loading state', () => {
  test('toggle re-enables after IPC completes', async ({ page }) => {
    await injectTauriMock(page, { set_skill_active: 'slow' })
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)

    const toggle = page.getByLabel('Disable skill').first()
    await toggle.dispatchEvent('click')

    // After the slow mock resolves (500ms), toggle should not be disabled anymore
    await expect(toggle).not.toBeDisabled({ timeout: 3000 })
  })

  test('toggle button re-enables after slow IPC resolves', async ({ page }) => {
    await injectTauriMock(page, { set_skill_active: 'slow' })
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)

    const toggle = page.getByLabel('Disable skill').first()
    await toggle.dispatchEvent('click')

    // After 500ms delay, toggle should be re-enabled and not in loading state
    await expect(toggle).not.toBeDisabled({ timeout: 2000 })
  })
})

test.describe('skill toggle — error handling', () => {
  test('error from IPC does not crash — skills still visible', async ({ page }) => {
    await injectTauriMock(page, { set_skill_active: 'error' })
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await openClaudeDetail(page)

    await page.getByLabel('Disable skill').first().dispatchEvent('click')
    await page.waitForTimeout(400)

    // Page still functional — use .first() to avoid strict mode error
    await expect(page.getByText('impeccable').first()).toBeVisible()
    await expect(page.getByText('Skills').first()).toBeVisible()
  })
})

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
    await expect(page.locator('text=MCP')).toBeVisible()
  })

  test('MCP detail back button returns to tool detail', async ({ page }) => {
    await page.getByText('github').click()
    await page.getByLabel('Back').click()
    // Use .first() — multiple elements may contain 'Skills' text
    await expect(page.getByText('Skills').first()).toBeVisible()
  })
})
