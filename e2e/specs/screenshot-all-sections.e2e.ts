import { test } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { injectTauriMock, mockClaudeTool, mockCursorTool } from '../fixtures/tauri-mock'
import { expandedFixture } from '../fixtures/expanded-data'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '../../docs/screenshots')

const SECTIONS: { hash: string; name: string; waitText: string }[] = [
  { hash: '#work', name: '1-my-work', waitText: 'My Work' },
  { hash: '#sessions', name: '2-sessions', waitText: 'fix the login bug' },
  { hash: '#worktrees', name: '3-repos', waitText: 'Repos' },
  { hash: '#agents', name: '4-agents', waitText: 'Cursor' },
  { hash: '#skills', name: '5-skills', waitText: 'impeccable' },
  { hash: '#mcps', name: '6-mcps', waitText: 'github' },
]

test.describe.configure({ mode: 'serial' })

for (const section of SECTIONS) {
  test(`screenshot: ${section.name}`, async ({ page }) => {
    await injectTauriMock(page, {}, [mockClaudeTool, mockCursorTool], {
      windowLabel: 'expanded',
      expanded: expandedFixture,
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/${section.hash}`)
    await page.waitForSelector(`text=${section.waitText}`, { timeout: 8000 })
    await page.waitForTimeout(300) // let transitions/animations settle
    await page.screenshot({ path: path.join(OUT_DIR, `${section.name}.png`), fullPage: false })
  })
}
