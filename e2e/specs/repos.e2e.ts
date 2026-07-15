import { test, expect } from '@playwright/test'
import { injectTauriMock, mockClaudeTool, mockCursorTool } from '../fixtures/tauri-mock'
import { expandedFixture } from '../fixtures/expanded-data'

test.beforeEach(async ({ page }) => {
  await injectTauriMock(page, {}, [mockClaudeTool, mockCursorTool], {
    windowLabel: 'expanded',
    expanded: expandedFixture,
  })
  await page.goto('/#worktrees')
  await page.waitForSelector('text=alpha', { timeout: 8000 })
})

test('repo cards start collapsed', async ({ page }) => {
  await expect(page.getByText('3 worktrees · base main')).toBeVisible()
  await expect(page.getByText('feature/done')).not.toBeVisible()
})

test('expanding a repo reveals worktrees and chips', async ({ page }) => {
  await page.getByRole('button', { name: /alpha/ }).first().click()
  await expect(page.getByText('feature/done')).toBeVisible()
  await expect(page.getByText('feature/wip')).toBeVisible()
  await expect(page.getByText('CLAUDE.md')).toBeVisible()
  await expect(page.getByText('1 skill')).toBeVisible()
})

test('insight tiles show status counts', async ({ page }) => {
  // Tiles carry explanatory hover hints — unambiguous vs filter pills
  await expect(page.getByTitle('Merged into base and clean')).toBeVisible()
  await expect(page.getByTitle('Worktrees with uncommitted changes')).toBeVisible()
})

test('filter pill auto-expands and narrows to safe worktrees', async ({ page }) => {
  await page.getByRole('button', { name: 'Safe to delete' }).click()
  await expect(page.getByText('feature/done')).toBeVisible()
  await expect(page.getByText('feature/wip')).not.toBeVisible()
})

test('delete flow: only safe worktrees offer delete, confirm invokes backend', async ({ page }) => {
  await page.getByRole('button', { name: /alpha/ }).first().click()
  // dirty worktree: no delete button
  await page.getByText('feature/wip').click()
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).not.toBeVisible()
  await page.getByText('feature/wip').click() // collapse
  // safe worktree: delete → confirm
  await page.getByText('feature/done').click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm delete' }).click()
  const log = await page.evaluate(() =>
    (globalThis as unknown as { __invokeLog: { cmd: string; args: Record<string, unknown> }[] }).__invokeLog
  )
  const removal = log.find(l => l.cmd === 'remove_worktree')
  expect(removal).toBeTruthy()
  expect(removal!.args.worktreePath).toBe('/Users/test/proj/alpha-wt-merged')
})

test('vs code button opens the repo path', async ({ page }) => {
  await page.getByRole('button', { name: 'VS Code' }).first().click()
  const log = await page.evaluate(() =>
    (globalThis as unknown as { __invokeLog: { cmd: string; args: Record<string, unknown> }[] }).__invokeLog
  )
  const open = log.find(l => l.cmd === 'open_in_vscode')
  expect(open).toBeTruthy()
  expect(open!.args.path).toBe('/Users/test/proj/alpha')
})

test('linked session on a worktree opens its transcript in Sessions', async ({ page }) => {
  await page.getByRole('button', { name: /alpha/ }).first().click()
  // primary worktree path === codex session project
  await page.getByText('main', { exact: true }).first().click()
  await page.getByText('refactor the payment retry logic').first().click()
  await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible()
  await expect(page.getByText('Refactored with exponential backoff.')).toBeVisible()
})
