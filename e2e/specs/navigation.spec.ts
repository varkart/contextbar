import { browser, $ } from '@wdio/globals'

describe('navigation', () => {
  it('app window is visible on startup in test mode', async () => {
    const body = await $('body')
    await expect(body).toExist()
  })

  it('main list shows at least one installed tool', async () => {
    // Each tool row is a button (ToolRow)
    const toolButtons = await $$('button[aria-label]')
    // At minimum Claude Code should be detected on dev machine
    const texts = await Promise.all(toolButtons.map(b => b.getText()))
    expect(texts.length).toBeGreaterThan(0)
  })

  it('clicking a tool navigates to tool detail page', async () => {
    // Find first enabled tool button (not disabled)
    const buttons = await $$('button:not([disabled])')
    const toolButton = buttons[0]
    await toolButton.click()

    // Breadcrumb parent label should appear
    const breadcrumb = await $('span=aicontextbar')
    await expect(breadcrumb).toBeDisplayed()
  })

  it('back button returns to main list', async () => {
    const backBtn = await $('[aria-label="Back"]')
    await backBtn.click()

    // Main list search bar should be back
    const searchBar = await $('input[type="search"], input[placeholder*="Search"]')
    await expect(searchBar).toExist()
  })

  it('Escape key closes/returns from tool detail', async () => {
    // Navigate into a tool
    const buttons = await $$('button:not([disabled])')
    await buttons[0].click()

    // Press Escape
    await browser.keys(['Escape'])

    // Should be back at main list
    const breadcrumb = await $('span=aicontextbar')
    await expect(breadcrumb).not.toBeDisplayed()
  })
})
