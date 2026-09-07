import { test, expect } from '@playwright/test'
import { injectTauriMock, mockClaudeTool, mockCursorTool } from '../fixtures/tauri-mock'

const now = Date.now()

// A minimal, purpose-built fixture (not the shared expandedFixture) so the
// tool-call run below reliably crosses the 3-call collapse threshold and the
// "hidden" needle is guaranteed to exist nowhere except inside it.
const fixture = {
  sessions: [
    {
      agent: 'claude',
      sessionId: 'ses-find-1',
      display: 'debug the flaky retry test',
      timestamp: now,
      project: '/Users/test/proj/alpha',
      projectName: 'alpha',
      totalTokens: 100,
      isLive: false,
      errorCount: 0,
      promptCount: 1,
    },
  ],
  sessionDetails: {
    'ses-find-1': {
      agent: 'claude',
      sessionId: 'ses-find-1',
      project: '/Users/test/proj/alpha',
      projectName: 'alpha',
      timestamp: now,
      totalTokens: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0 },
      messages: [
        {
          role: 'user',
          content: [{ blockType: 'text', text: 'debug the flaky retry test', isError: false }],
        },
        {
          role: 'assistant',
          content: [{ blockType: 'text', text: 'The zzzvisiblemarker text is right here on the page.', isError: false }],
        },
        // 3+ consecutive tool-only messages collapse by default (ToolCallGroup,
        // COLLAPSE_THRESHOLD = 3) — one of them carries a needle that exists
        // nowhere else, to prove find-on-page opens the group to reach it.
        {
          role: 'assistant',
          content: [{ blockType: 'tool_use', toolName: 'grep', toolInput: '{"pattern":"retry"}', isError: false }],
        },
        {
          role: 'assistant',
          content: [{ blockType: 'tool_use', toolName: 'read', toolInput: '{"path":"retry.ts"}', isError: false }],
        },
        {
          role: 'assistant',
          content: [{ blockType: 'tool_use', toolName: 'bash', toolInput: '{"command":"echo zzzhiddenneedle"}', isError: false }],
        },
      ],
    },
  },
}

test.beforeEach(async ({ page }) => {
  await injectTauriMock(page, {}, [mockClaudeTool, mockCursorTool], {
    windowLabel: 'expanded',
    expanded: fixture,
  })
  await page.goto('/#sessions')
  await page.waitForSelector('text=debug the flaky retry test', { timeout: 8000 })
  await page.getByText('debug the flaky retry test').first().click()
  await expect(page.getByText('zzzvisiblemarker')).toBeVisible()
})

test('Cmd+F opens find bar and highlights a visible match', async ({ page }) => {
  await expect(page.getByPlaceholder('Find in session')).not.toBeVisible()
  await page.keyboard.press('Meta+f')
  const input = page.getByPlaceholder('Find in session')
  await expect(input).toBeVisible()
  await input.fill('zzzvisiblemarker')
  await expect(page.getByText('1/1')).toBeVisible()
})

test('no results message shown for a query that matches nothing', async ({ page }) => {
  await page.keyboard.press('Meta+f')
  await page.getByPlaceholder('Find in session').fill('zzznothingmatchesthis')
  await expect(page.getByText('No results')).toBeVisible()
})

test('Escape closes the find bar', async ({ page }) => {
  await page.keyboard.press('Meta+f')
  await expect(page.getByPlaceholder('Find in session')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByPlaceholder('Find in session')).not.toBeVisible()
})

test('searching for text inside a collapsed tool-call group opens it', async ({ page }) => {
  // Collapsed by default — the needle only exists inside this group's data.
  await expect(page.getByText('zzzhiddenneedle')).not.toBeVisible()
  await page.keyboard.press('Meta+f')
  await page.getByPlaceholder('Find in session').fill('zzzhiddenneedle')
  await expect(page.getByText('1/1')).toBeVisible()
  await expect(page.getByText('zzzhiddenneedle')).toBeVisible()
})

test('search is scoped to the transcript, not the rest of the page', async ({ page }) => {
  // "Resume" only appears in the session header's own action button
  // (outside the transcript container this find bar is scoped to) — it
  // must not count as a match, even though it's visibly on the page.
  await expect(page.getByText('▶ Resume')).toBeVisible()
  await page.keyboard.press('Meta+f')
  await page.getByPlaceholder('Find in session').fill('Resume')
  await expect(page.getByText('No results')).toBeVisible()
})
