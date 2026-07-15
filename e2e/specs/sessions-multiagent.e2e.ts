import { test, expect } from '@playwright/test'
import { injectTauriMock, mockClaudeTool, mockCursorTool } from '../fixtures/tauri-mock'
import { expandedFixture } from '../fixtures/expanded-data'

test.beforeEach(async ({ page }) => {
  await injectTauriMock(page, {}, [mockClaudeTool, mockCursorTool], {
    windowLabel: 'expanded',
    expanded: expandedFixture,
  })
  await page.goto('/#sessions')
  await page.waitForSelector('text=fix the login bug', { timeout: 8000 })
})

test('rows show agent badges for all three agents', async ({ page }) => {
  await expect(page.getByText('Claude', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Codex', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Gemini', { exact: true }).first()).toBeVisible()
})

test('agent filter pills narrow the list', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'All agents' })).toBeVisible()
  await page.getByRole('button', { name: 'codex', exact: true }).click()
  await expect(page.getByText('refactor the payment retry logic')).toBeVisible()
  await expect(page.getByText('fix the login bug in the auth middleware')).not.toBeVisible()
  await page.getByRole('button', { name: 'All agents' }).click()
  await expect(page.getByText('fix the login bug in the auth middleware')).toBeVisible()
})

test('live session shows live indicator group', async ({ page }) => {
  await expect(page.getByText('Live', { exact: true }).first()).toBeVisible()
})

test('codex transcript opens with tool call and tokens', async ({ page }) => {
  await page.getByText('refactor the payment retry logic').first().click()
  await expect(page.getByText('Refactored with exponential backoff.')).toBeVisible()
  await expect(page.getByText('exec_command')).toBeVisible()
})

test('gemini transcript opens', async ({ page }) => {
  await page.getByText('write integration tests for the parser').first().click()
  await expect(page.getByText('Added 12 integration tests.')).toBeVisible()
})

test('resume passes the session agent to the backend', async ({ page }) => {
  await page.getByText('refactor the payment retry logic').first().click()
  await expect(page.getByText('Refactored with exponential backoff.')).toBeVisible()
  await page.getByRole('button', { name: /Resume/ }).click()
  const log = await page.evaluate(() =>
    (globalThis as unknown as { __invokeLog: { cmd: string; args: Record<string, unknown> }[] }).__invokeLog
  )
  const resume = log.find(l => l.cmd === 'resume_in_terminal')
  expect(resume).toBeTruthy()
  expect(resume!.args.agent).toBe('codex')
  expect(resume!.args.sessionId).toBe('codex-abc-1')
})

test('sessions-changed event refreshes the list without reload', async ({ page }) => {
  await page.evaluate(() => {
    const g = globalThis as unknown as Record<string, unknown>
    const internals = g.__TAURI_INTERNALS__ as { invoke: (c: string, a?: unknown) => Promise<unknown> }
    // Swap the fixture: next list_sessions call returns one extra session
    const orig = internals.invoke.bind(internals)
    internals.invoke = (cmd: string, args?: unknown) => {
      if (cmd === 'list_sessions') {
        return orig(cmd, args).then(list => [
          {
            agent: 'claude', sessionId: 'brand-new', display: 'freshly started session',
            timestamp: Date.now(), project: '/Users/test/proj/alpha', projectName: 'alpha',
            totalTokens: 0, model: null, durationMinutes: null, isLive: true,
            errorCount: 0, promptCount: 1,
          },
          ...(list as unknown[]),
        ])
      }
      return orig(cmd, args)
    }
    ;(g.__emitMockEvent as (n: string, p: unknown) => void)('sessions-changed', null)
  })
  await expect(page.getByText('freshly started session')).toBeVisible()
})
