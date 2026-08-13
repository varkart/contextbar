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
  await expect(page.getByText('3 worktrees · 2 branches · base main')).toBeVisible()
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
  // Stale/Abandoned/Uncommitted consolidate into one "Needs attention" tile
  await expect(page.getByText('Needs attention')).toBeVisible()
  await expect(page.getByTitle('Merged into base and clean')).toBeVisible()
})

test('PRs button loads and lists open PRs for the repo', async ({ page }) => {
  await page.getByRole('button', { name: 'PRs' }).click()
  await expect(page.getByText('Fix retry backoff jitter')).toBeVisible()
  await expect(page.getByText('WIP: payment provider abstraction')).toBeVisible()
  await expect(page.getByText('Draft')).toBeVisible()
})

test('needs attention tile shows a breakdown on hover', async ({ page }) => {
  await page.getByText('Needs attention').hover()
  await expect(page.getByText('Abandoned')).toBeVisible()
  await expect(page.getByText('Uncommitted')).toBeVisible()
  await expect(page.getByText('Stale')).toBeVisible()
})

test('filter pill auto-expands and narrows to safe worktrees', async ({ page }) => {
  await page.getByRole('button', { name: 'Safe to delete' }).click()
  await expect(page.getByText('feature/done')).toBeVisible()
  await expect(page.getByText('feature/wip')).not.toBeVisible()
})

test('safe-to-delete count includes merged bare branches, not just worktrees', async ({ page }) => {
  // Fixture has 1 safe worktree (feature/done) + 1 safe bare branch
  // (feature/old-experiment) — the tile/banner must count both, matching
  // what the "safe" filter itself reveals.
  await expect(page.getByRole('button', { name: /Safe to delete: 2\./ })).toBeVisible()
  await expect(page.getByText(/2 branches are merged and clean/)).toBeVisible()
  // The "safe" filter auto-expands matching repos — no extra click needed.
  await page.getByRole('button', { name: 'Safe to delete' }).click()
  await expect(page.getByText('feature/done')).toBeVisible()
  await expect(page.getByText('feature/old-experiment')).toBeVisible()
  await expect(page.getByText('feature/wip')).not.toBeVisible()
  await expect(page.getByText('feature/queued')).not.toBeVisible()
})

test('delete flow: only safe worktrees offer delete, confirm invokes backend', async ({ page }) => {
  await page.getByRole('button', { name: /alpha/ }).first().click()
  // dirty worktree: no delete button
  const wipCard = page.getByTestId('wt-card-/Users/test/proj/alpha-wt-dirty')
  await wipCard.click()
  await expect(wipCard.getByRole('button', { name: 'Delete', exact: true })).not.toBeVisible()
  await wipCard.click() // collapse
  // safe worktree: delete → confirm
  const doneCard = page.getByTestId('wt-card-/Users/test/proj/alpha-wt-merged')
  await doneCard.click()
  await doneCard.getByRole('button', { name: 'Delete', exact: true }).click()
  await doneCard.getByRole('button', { name: 'Confirm delete' }).click()
  const log = await page.evaluate(() =>
    (globalThis as unknown as { __invokeLog: { cmd: string; args: Record<string, unknown> }[] }).__invokeLog
  )
  const removal = log.find(l => l.cmd === 'remove_worktree')
  expect(removal).toBeTruthy()
  expect(removal!.args.worktreePath).toBe('/Users/test/proj/alpha-wt-merged')
})

test('branches subsection lists not-checked-out branches separately from worktrees', async ({ page }) => {
  await page.getByRole('button', { name: /alpha/ }).first().click()
  await expect(page.getByText('Worktrees', { exact: true })).toBeVisible()
  await expect(page.getByText('Branches · not checked out')).toBeVisible()
  await expect(page.getByText('feature/old-experiment')).toBeVisible()
  await expect(page.getByText('feature/queued')).toBeVisible()
  await expect(page.getByText('merged · safe to delete')).toBeVisible()
})

test('branch delete flow: merged bare branch can be deleted, unmerged cannot', async ({ page }) => {
  await page.getByRole('button', { name: /alpha/ }).first().click()
  const repoPath = '/Users/test/proj/alpha'
  const queuedCard = page.getByTestId(`branch-card-${repoPath}:feature/queued`)
  await expect(queuedCard.getByRole('button', { name: 'Delete', exact: true })).not.toBeVisible()

  const mergedCard = page.getByTestId(`branch-card-${repoPath}:feature/old-experiment`)
  await mergedCard.getByRole('button', { name: 'Delete', exact: true }).click()
  await mergedCard.getByRole('button', { name: 'Confirm delete' }).click()
  const log = await page.evaluate(() =>
    (globalThis as unknown as { __invokeLog: { cmd: string; args: Record<string, unknown> }[] }).__invokeLog
  )
  const deletion = log.find(l => l.cmd === 'delete_branch')
  expect(deletion).toBeTruthy()
  expect(deletion!.args.branchName).toBe('feature/old-experiment')
})

test('remote toggle shows branches that exist upstream but have no local copy', async ({ page }) => {
  await expect(page.getByText('feature/teammate-spike')).not.toBeVisible()
  await page.getByRole('button', { name: 'Remote' }).click()
  await expect(page.getByText('feature/teammate-spike')).toBeVisible()
  await expect(page.getByText('origin', { exact: true })).toBeVisible()
})

test('local-only badge appears on branches with no remote-tracking ref', async ({ page }) => {
  await page.getByRole('button', { name: /alpha/ }).first().click()
  // feature/wip (worktree) and feature/queued (bare branch) are local-only in the fixture.
  await expect(page.getByText('local only')).toHaveCount(2)
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

test('repo Sessions button scopes Sessions to that repo only', async ({ page }) => {
  await page.getByRole('button', { name: '◷ Sessions' }).first().click()
  await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible()
  await expect(page.getByText('Repo: alpha')).toBeVisible()
  // alpha-scoped sessions visible
  await expect(page.getByText('fix the login bug in the auth middleware')).toBeVisible()
  await expect(page.getByText('refactor the payment retry logic')).toBeVisible()
  // beta-only sessions filtered out
  await expect(page.getByText('write integration tests for the parser')).not.toBeVisible()
})

test('clearing the repo scope chip shows all sessions again', async ({ page }) => {
  await page.getByRole('button', { name: '◷ Sessions' }).first().click()
  await expect(page.getByText('Repo: alpha')).toBeVisible()
  await page.getByRole('button', { name: 'Clear repo filter' }).click()
  await expect(page.getByText('Repo: alpha')).not.toBeVisible()
  await expect(page.getByText('write integration tests for the parser')).toBeVisible()
})

test('Agent settings expands a collapsed repo card and shows Agent permissions', async ({ page }) => {
  // Repo card starts collapsed — clicking Agent settings must still work.
  await expect(page.getByText('feature/done')).not.toBeVisible()
  await page.getByRole('button', { name: 'Agent settings' }).click()
  await expect(page.getByText('Agent permissions')).toBeVisible()
})

test('Agent settings swaps out branches/worktrees for Agent permissions', async ({ page }) => {
  await page.getByRole('button', { name: /alpha/ }).first().click()
  await expect(page.getByText('feature/done')).toBeVisible()
  await expect(page.getByText('Agent permissions')).not.toBeVisible()

  await page.getByRole('button', { name: 'Agent settings' }).click()
  await expect(page.getByText('Agent permissions')).toBeVisible()
  await expect(page.getByText('feature/done')).not.toBeVisible()
  await expect(page.getByText('feature/wip')).not.toBeVisible()

  await page.getByRole('button', { name: 'Agent settings' }).click()
  await expect(page.getByText('feature/done')).toBeVisible()
  await expect(page.getByText('Agent permissions')).not.toBeVisible()
})

test('navigating to Sessions via sidebar does not carry a stale repo scope', async ({ page }) => {
  await page.getByRole('button', { name: '◷ Sessions' }).first().click()
  await expect(page.getByText('Repo: alpha')).toBeVisible()
  await page.getByRole('navigation').getByRole('button', { name: /Repos/ }).click()
  await page.getByRole('navigation').getByRole('button', { name: /Sessions/ }).click()
  await expect(page.getByText('Repo: alpha')).not.toBeVisible()
})
