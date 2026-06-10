import { test, expect } from '@playwright/test'
import { injectTauriMock } from '../fixtures/tauri-mock'

test.beforeEach(async ({ page }) => {
  await injectTauriMock(page)
  await page.goto('/')
  await page.waitForSelector('text=Claude Code', { timeout: 8000 })
})

test('main list shows installed tools', async ({ page }) => {
  await expect(page.getByText('Claude Code')).toBeVisible()
  await expect(page.getByText('Cursor')).toBeVisible()
})

test('tools show skill counts', async ({ page }) => {
  // Claude has 3 skills (2 active + 1 disabled)
  await expect(page.getByText(/3 skills/)).toBeVisible()
})

test('tools show mcp counts', async ({ page }) => {
  // Claude has 1 mcp
  await expect(page.getByText(/1 mcp/)).toBeVisible()
})

test('clicking tool navigates to detail page with breadcrumb', async ({ page }) => {
  await page.getByText('Claude Code').click()
  await expect(page.getByText('aicontextbar')).toBeVisible()
  await expect(page.locator('span').filter({ hasText: '›' })).toBeVisible()
})

test('tool detail shows all skills including disabled', async ({ page }) => {
  await page.getByText('Claude Code').click()
  await expect(page.getByText('impeccable').first()).toBeVisible()
  await expect(page.getByText('graphify').first()).toBeVisible()
  await expect(page.getByText('xlsx').first()).toBeVisible()
  await expect(page.getByText('Skills').first()).toBeVisible()
})

test('disabled skill shown with reduced opacity', async ({ page }) => {
  await page.getByText('Claude Code').click()
  const disabledRow = page.locator('.opacity-40').first()
  await expect(disabledRow).toBeVisible()
})

test('back button returns to main list', async ({ page }) => {
  await page.getByText('Claude Code').click()
  await page.waitForSelector('[aria-label="Back"]')
  await page.getByLabel('Back').click()

  await expect(page.getByText('Claude Code')).toBeVisible()
  await expect(page.getByText('Cursor')).toBeVisible()
})

test('Escape returns from tool detail to main list', async ({ page }) => {
  await page.getByText('Claude Code').click()
  // Breadcrumb separator › appears on detail page
  await expect(page.locator('span').filter({ hasText: '›' })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByText('Claude Code')).toBeVisible()
  // Breadcrumb separator gone — back on main list
  await expect(page.locator('span').filter({ hasText: '›' })).not.toBeVisible()
})

test('clicking skill navigates to skill detail with breadcrumb', async ({ page }) => {
  await page.getByText('Claude Code').click()
  await page.waitForSelector('text=impeccable')
  await page.getByText('impeccable').first().click()

  // Breadcrumb: Tool Name › skill name
  await expect(page.getByText('Claude Code').first()).toBeVisible()
})

test('Escape from skill detail returns to tool detail', async ({ page }) => {
  await page.getByText('Claude Code').click()
  await page.getByText('impeccable').first().click()

  await page.keyboard.press('Escape')
  // Back at tool detail — breadcrumb still shows aicontextbar
  await expect(page.getByText('aicontextbar').first()).toBeVisible()
})

test('search filters tool list', async ({ page }) => {
  const search = page.locator('input').first()
  await search.fill('cursor')

  await expect(page.getByText('Cursor')).toBeVisible()
  await expect(page.getByText('Claude Code')).not.toBeVisible()
})

test('clearing search restores full list', async ({ page }) => {
  const search = page.locator('input').first()
  await search.fill('cursor')
  await search.clear()

  await expect(page.getByText('Claude Code')).toBeVisible()
  await expect(page.getByText('Cursor')).toBeVisible()
})
