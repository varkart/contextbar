import { test, expect } from '@playwright/test'
import { injectTauriMock } from '../fixtures/tauri-mock'
import type { Notification } from '../../src/types'

const makeNotif = (id: number, level: Notification['level'], title: string, body: string): Notification => ({
  id,
  tsMs: Date.now(),
  level,
  title,
  body,
})

// ── bell visibility ───────────────────────────────────────────────────────────

test.describe('notification bell', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
  })

  test('bell button is visible on main page', async ({ page }) => {
    await expect(page.getByRole('button', { name: /notifications/i })).toBeVisible()
  })

  test('no badge dot when there are no notifications', async ({ page }) => {
    const bell = page.getByRole('button', { name: /^Notifications$/ })
    await expect(bell).toBeVisible()
    // Badge is a small aria-hidden span inside the button
    await expect(bell.locator('[aria-hidden="true"]')).not.toBeVisible()
  })

  test('badge dot appears when notifications exist', async ({ page }) => {
    await injectTauriMock(page, {
      notifications: [makeNotif(1, 'warn', 'Missing binary', 'npx not found')],
    })
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })

    const bell = page.getByRole('button', { name: /notifications/i })
    await expect(bell.locator('[aria-hidden="true"]')).toBeVisible()
  })
})

// ── navigation ────────────────────────────────────────────────────────────────

test.describe('notification panel navigation', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
  })

  test('clicking bell opens notification panel', async ({ page }) => {
    await page.getByRole('button', { name: /notifications/i }).click()
    await expect(page.getByText('Notifications')).toBeVisible()
  })

  test('back button returns to main list', async ({ page }) => {
    await page.getByRole('button', { name: /notifications/i }).click()
    await page.waitForSelector('text=Notifications')

    await page.getByLabel('Back').click()
    await expect(page.getByText('Claude Code')).toBeVisible()
  })

  test('Escape returns from notification panel to main list', async ({ page }) => {
    await page.getByRole('button', { name: /notifications/i }).click()
    await page.waitForSelector('text=Notifications')

    await page.keyboard.press('Escape')
    await expect(page.getByText('Claude Code')).toBeVisible()
  })
})

// ── empty state ───────────────────────────────────────────────────────────────

test.describe('notification panel — empty state', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page)
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await page.getByRole('button', { name: /notifications/i }).click()
    await page.waitForSelector('text=Notifications')
  })

  test('shows No notifications message', async ({ page }) => {
    await expect(page.getByText('No notifications')).toBeVisible()
  })

  test('Clear all button absent when empty', async ({ page }) => {
    await expect(page.getByText('Clear all')).not.toBeVisible()
  })
})

// ── notifications present ─────────────────────────────────────────────────────

test.describe('notification panel — with notifications', () => {
  const notifs = [
    makeNotif(1, 'warn',  "'npx' not found",  "MCP 'github' requires 'npx' but it isn't on PATH."),
    makeNotif(2, 'error', 'Config parse error', 'settings.json contains invalid JSON.'),
    makeNotif(3, 'info',  'Update available',  'Version 0.9.0 is ready to install.'),
  ]

  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page, { notifications: notifs })
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })
    await page.getByRole('button', { name: /notifications/i }).click()
    await page.waitForSelector('text=Notifications')
  })

  test('shows all notification titles', async ({ page }) => {
    await expect(page.getByText("'npx' not found")).toBeVisible()
    await expect(page.getByText('Config parse error')).toBeVisible()
    await expect(page.getByText('Update available')).toBeVisible()
  })

  test('shows notification body text', async ({ page }) => {
    await expect(page.getByText(/isn't on PATH/)).toBeVisible()
  })

  test('shows level badges', async ({ page }) => {
    await expect(page.getByText('warn').first()).toBeVisible()
    await expect(page.getByText('error').first()).toBeVisible()
    await expect(page.getByText('info').first()).toBeVisible()
  })

  test('shows Clear all button', async ({ page }) => {
    await expect(page.getByText('Clear all')).toBeVisible()
  })

  test('dismissing a notification removes it from the list', async ({ page }) => {
    await expect(page.getByText("'npx' not found")).toBeVisible()

    // Hover to reveal the dismiss button, then click it
    const notifCard = page.locator('div').filter({ hasText: "'npx' not found" }).last()
    await notifCard.hover()
    await page.getByLabel('Dismiss').first().click()

    await expect(page.getByText("'npx' not found")).not.toBeVisible()
    // Other notifications remain
    await expect(page.getByText('Config parse error')).toBeVisible()
  })

  test('Clear all removes all notifications', async ({ page }) => {
    await page.getByText('Clear all').click()

    await expect(page.getByText('No notifications')).toBeVisible()
    await expect(page.getByText("'npx' not found")).not.toBeVisible()
  })

  test('after Clear all, Clear all button is hidden', async ({ page }) => {
    await page.getByText('Clear all').click()
    await expect(page.getByText('Clear all')).not.toBeVisible()
  })
})

// ── bell badge count ──────────────────────────────────────────────────────────

test.describe('bell badge after navigation', () => {
  test('bell badge visible before opening panel', async ({ page }) => {
    await injectTauriMock(page, {
      notifications: [makeNotif(1, 'warn', 'Test', 'Body')],
    })
    await page.goto('/')
    await page.waitForSelector('text=Claude Code', { timeout: 8000 })

    const bell = page.getByRole('button', { name: /notifications/i })
    await expect(bell.locator('[aria-hidden="true"]')).toBeVisible()
  })
})
