import { test, expect } from '@playwright/test'
import { injectTauriMock, mockClaudeTool, mockCursorTool } from '../fixtures/tauri-mock'
import { expandedFixture } from '../fixtures/expanded-data'

test.beforeEach(async ({ page }) => {
  await injectTauriMock(page, {}, [mockClaudeTool, mockCursorTool], {
    windowLabel: 'expanded',
    expanded: expandedFixture,
  })
  await page.goto('/')
  await page.waitForSelector('text=Overview — Today', { timeout: 8000 })
})

test('range tabs relabel the windowed blocks', async ({ page }) => {
  await expect(page.getByText('Overview — Today')).toBeVisible()
  await page.getByRole('button', { name: 'Last 7 Days' }).click()
  await expect(page.getByText('Overview — Last 7 Days')).toBeVisible()
  await expect(page.getByText('Agents — Last 7 Days')).toBeVisible()
})

test('agent mix shows all agents active in the window', async ({ page }) => {
  await page.getByRole('button', { name: 'Last 7 Days' }).click()
  await expect(page.getByText(/claude · \d+ session/)).toBeVisible()
  await expect(page.getByText(/codex · \d+ session/)).toBeVisible()
  await expect(page.getByText(/gemini · \d+ session/)).toBeVisible()
  await expect(page.getByText(/agy · \d+ session/)).toBeVisible()
})

test('needs attention explains uncommitted work and links to repos', async ({ page }) => {
  await expect(page.getByText('uncommitted changes', { exact: true })).toBeVisible()
  await expect(page.getByText(/never committed/)).toBeVisible()
  await page.getByRole('button', { name: 'Open in Repos →' }).first().click()
  await expect(page.getByRole('heading', { name: 'Repos' })).toBeVisible()
})

test('activity heatmap and commit bars render', async ({ page }) => {
  await expect(page.getByText('Activity heatmap')).toBeVisible()
  await expect(page.getByText('Commits per day')).toBeVisible()
})

test('project card click opens the latest transcript', async ({ page }) => {
  await page.getByRole('button', { name: 'Last 7 Days' }).click()
  await page.getByRole('button', { name: /alpha/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible()
})

test('standup section is gone', async ({ page }) => {
  await expect(page.getByText(/Standup/)).not.toBeVisible()
})

test('refresh button shows spin-then-checkmark feedback on click', async ({ page }) => {
  const button = page.getByRole('button', { name: 'Refresh' })
  await expect(button).toBeVisible()
  await button.click()
  // Spinning icon while the refresh promise is in flight
  await expect(button.locator('svg.animate-spin')).toBeVisible()
  // Then a checkmark confirming completion
  await expect(button).toHaveAttribute('title', 'Refreshed')
  await expect(button.locator('svg.animate-spin')).toHaveCount(0)
})

test('peak-end banner summarizes today and can be dismissed for the day', async ({ page }) => {
  await expect(page.getByText('Nice work today')).toBeVisible()
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByText('Nice work today')).not.toBeVisible()
  // Stays dismissed on reload within the same day
  await page.reload()
  await page.waitForSelector('text=Overview — Today', { timeout: 8000 })
  await expect(page.getByText('Nice work today')).not.toBeVisible()
})
