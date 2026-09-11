// Records the two demo scenes (menu bar popover + extended view) as .webm
// clips using the same mocked-Tauri harness the rest of the e2e suite uses —
// synthetic data only, no real paths or accounts. scripts/record-demo.mjs
// stitches the clips into the README gif. Run via `npm run demo:record`
// (or `playwright test demo-walkthrough` to just produce the .webm clips).
import { test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { injectTauriMock, mockClaudeWithMcpVariants, mockWindsurfTool } from '../fixtures/tauri-mock'
import { demoFixture } from '../fixtures/demo-data'
import { injectCursor, moveAndClick, moveTo } from '../demo/cursor'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const OUT_DIR = path.join(__dirname, '../demo/out')
fs.mkdirSync(OUT_DIR, { recursive: true })

// Only the video matters here — tracing/screenshots just add overhead.
test.use({ trace: 'off', screenshot: 'off' })

const tools = [mockClaudeWithMcpVariants, mockWindsurfTool]

async function saveVideo(page: import('@playwright/test').Page, name: string) {
  const video = page.video()
  if (!video) return
  const src = await video.path()
  fs.copyFileSync(src, path.join(OUT_DIR, name))
}

test('demo scene: menu bar popover', async ({ browser }) => {
  test.setTimeout(90_000)
  const context = await browser.newContext({
    recordVideo: { dir: OUT_DIR, size: { width: 380, height: 520 } },
    viewport: { width: 380, height: 520 },
  })
  const page = await context.newPage()
  await injectTauriMock(page, {}, tools)
  await page.goto('/')
  await page.waitForSelector('text=Claude Code', { timeout: 8000 })
  await injectCursor(page)
  await page.waitForTimeout(600)

  // Hover-only: a live notification-permission check on this build currently
  // blocks click-through navigation in headless webkit (tracked separately,
  // unrelated to this recorder — see PR description). Until that's fixed,
  // the popover scene shows the real landing screen (category tiles) with
  // the cursor visiting each one, rather than drilling into a category.
  const dismissTip = page.getByText("Don't show again")
  if (await dismissTip.count()) await moveAndClick(page, dismissTip, { pauseAfter: 400 })
  await moveTo(page, page.getByText('Coding Agents'), 700)
  await moveTo(page, page.getByText('Skills', { exact: true }), 700)
  await moveTo(page, page.getByText('MCPs', { exact: true }), 700)

  await context.close()
  await saveVideo(page, 'scene-popover.webm')
})

test('demo scene: extended view', async ({ browser }) => {
  test.setTimeout(120_000)
  const context = await browser.newContext({
    recordVideo: { dir: OUT_DIR, size: { width: 1000, height: 700 } },
    viewport: { width: 1000, height: 700 },
  })
  const page = await context.newPage()
  // Skip the first-run "Try ⌘K" coachmark — it overlaps the sidebar and has
  // nothing to do with the walkthrough.
  await page.addInitScript(() => localStorage.setItem('contextbar:expanded:coachmark:palette', '1'))
  await injectTauriMock(page, {}, tools, { windowLabel: 'expanded', expanded: demoFixture })
  await page.goto('/#work')
  await page.waitForSelector('text=My Work', { timeout: 8000 })
  await injectCursor(page)
  await page.waitForTimeout(600)

  const nav = page.getByRole('navigation')

  await moveAndClick(page, nav.getByRole('button', { name: /Sessions/ }), { pauseAfter: 400 })
  await page.waitForSelector('text=refactor the session driver attribution pass', { timeout: 8000 })

  await moveAndClick(page, page.getByText('refactor the session driver attribution pass').first(), { pauseAfter: 700 })

  await moveAndClick(page, page.getByText('Tokens', { exact: true }).first(), { pauseAfter: 600 })

  const pivotChip = page.getByRole('button', { name: 'Repos', exact: true })
  if (await pivotChip.count()) {
    await moveAndClick(page, pivotChip.first(), { pauseAfter: 500 })
  }

  await moveAndClick(page, nav.getByRole('button', { name: /Repos/ }), { pauseAfter: 400 })
  await page.waitForSelector('text=contextbar', { timeout: 8000 })
  await moveAndClick(page, page.getByRole('button', { name: /contextbar/ }).first(), { pauseAfter: 700 })

  await moveAndClick(page, nav.getByRole('button', { name: /Agents/ }), { pauseAfter: 550 })
  await moveAndClick(page, nav.getByRole('button', { name: /Skills/ }), { pauseAfter: 550 })
  await moveAndClick(page, nav.getByRole('button', { name: /MCPs/ }), { pauseAfter: 550 })

  await context.close()
  await saveVideo(page, 'scene-expanded.webm')
})
