import { test, expect } from '@playwright/test'
import { injectTauriMock, mockClaudeTool, mockCursorTool } from '../fixtures/tauri-mock'
import { expandedFixture } from '../fixtures/expanded-data'

test.beforeEach(async ({ page }) => {
  await injectTauriMock(page, {}, [mockClaudeTool, mockCursorTool], {
    windowLabel: 'expanded',
    expanded: expandedFixture,
  })
  await page.goto('/')
  await page.waitForSelector('text=My Work', { timeout: 8000 })
})

test('opens on My Work with grouped sidebar', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'My Work' })).toBeVisible()
  await expect(page.getByText('Work', { exact: true })).toBeVisible()
  await expect(page.getByText('Configure', { exact: true })).toBeVisible()
  const sidebar = page.getByRole('navigation')
  for (const label of ['Sessions', 'Repos', 'Agents', 'Skills', 'MCPs']) {
    await expect(sidebar.getByRole('button', { name: new RegExp(label) })).toBeVisible()
  }
})

test('sidebar marks the active section', async ({ page }) => {
  const active = page.locator('[aria-current="page"]')
  await expect(active).toHaveCount(1)
  await expect(active).toContainText('My Work')
  await page.getByRole('navigation').getByRole('button', { name: /Repos/ }).click()
  await expect(page.locator('[aria-current="page"]')).toContainText('Repos')
})

test('sections navigate via sidebar', async ({ page }) => {
  const sidebar = page.getByRole('navigation')
  await sidebar.getByRole('button', { name: /Sessions/ }).click()
  await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible()
  await sidebar.getByRole('button', { name: /Repos/ }).click()
  await expect(page.getByRole('heading', { name: 'Repos' })).toBeVisible()
})

test('cmd+number hotkeys switch sections', async ({ page }) => {
  await page.keyboard.press('Meta+2')
  await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible()
  await page.keyboard.press('Meta+3')
  await expect(page.getByRole('heading', { name: 'Repos' })).toBeVisible()
  await page.keyboard.press('Meta+1')
  await expect(page.getByRole('heading', { name: 'My Work' })).toBeVisible()
})

test('escape returns to My Work from a section', async ({ page }) => {
  await page.getByRole('navigation').getByRole('button', { name: /Repos/ }).click()
  await expect(page.getByRole('heading', { name: 'Repos' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'My Work' })).toBeVisible()
})

test('hash deep-link opens the right section', async ({ page }) => {
  await page.goto('/#sessions')
  await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible()
})
