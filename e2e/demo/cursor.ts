// Synthetic cursor for demo recordings. Automated Playwright clicks render no
// pointer, so a recording of raw page.click() calls looks like the UI is
// possessed — this injects a small dot that animates to each target before
// clicking, so the walkthrough reads as a real interaction.
import type { Page, Locator } from '@playwright/test'

export async function injectCursor(page: Page) {
  await page.addStyleTag({
    content: `
      #__demo-cursor {
        position: fixed; z-index: 2147483647; width: 18px; height: 18px;
        border-radius: 50%; background: rgba(99,102,241,0.9);
        box-shadow: 0 0 0 4px rgba(99,102,241,0.25), 0 1px 3px rgba(0,0,0,0.4);
        pointer-events: none; transition: left 420ms cubic-bezier(.22,.68,0,1.71), top 420ms cubic-bezier(.22,.68,0,1.71);
        left: -40px; top: -40px;
      }
      #__demo-cursor.click { transform: scale(0.7); }
    `,
  })
  await page.evaluate(() => {
    if (document.getElementById('__demo-cursor')) return
    const el = document.createElement('div')
    el.id = '__demo-cursor'
    document.body.appendChild(el)
  })
}

async function moveCursorTo(page: Page, x: number, y: number) {
  await page.evaluate(([x, y]) => {
    const el = document.getElementById('__demo-cursor')
    if (el) { el.style.left = `${x - 9}px`; el.style.top = `${y - 9}px` }
  }, [x, y] as [number, number])
}

/** Moves the synthetic cursor to `locator`'s center, pauses, clicks, pauses. */
export async function moveAndClick(page: Page, locator: Locator, opts: { pauseBefore?: number; pauseAfter?: number } = {}) {
  const box = await locator.first().boundingBox()
  if (!box) throw new Error('moveAndClick: target has no bounding box (not visible?)')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await moveCursorTo(page, x, y)
  await page.waitForTimeout(opts.pauseBefore ?? 450)
  await page.evaluate(() => document.getElementById('__demo-cursor')?.classList.add('click'))
  await locator.first().click()
  await page.evaluate(() => document.getElementById('__demo-cursor')?.classList.remove('click'))
  await page.waitForTimeout(opts.pauseAfter ?? 550)
}

/** Just moves the cursor to hover a target, no click — for "look here" beats. */
export async function moveTo(page: Page, locator: Locator, pause = 500) {
  const box = await locator.first().boundingBox()
  if (!box) return
  await moveCursorTo(page, box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(pause)
}
