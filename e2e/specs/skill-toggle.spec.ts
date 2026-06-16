import { browser, $ } from '@wdio/globals'
import {
  createTestSkill,
  removeTestSkill,
  isSkillActive,
  isSkillDisabled,
} from '../fixtures/skill-helper'

// Navigate into Claude Code detail page
async function openClaudeDetail() {
  const buttons = await $$('button:not([disabled])')
  for (const btn of buttons) {
    const text = await btn.getText()
    if (text.includes('Claude Code')) {
      await btn.click()
      return
    }
  }
  throw new Error('Claude Code tool not found in list')
}

async function goBack() {
  const backBtn = await $('[aria-label="Back"]')
  await backBtn.click()
}

describe('skill enable/disable', () => {
  before(async () => {
    createTestSkill()
    // Wait for FSEvents watcher to pick up new skill
    await browser.pause(1500)
    // Refresh tools list via the refresh button or re-open
    const refreshBtn = await $('[aria-label="Refresh tools"]')
    if (await refreshBtn.isExisting()) await refreshBtn.click()
    await browser.pause(500)
  })

  after(async () => {
    removeTestSkill()
  })

  it('test skill appears as active in Claude detail page', async () => {
    await openClaudeDetail()

    const skillRow = await $(`span*=__e2e_test_skill__`)
    await expect(skillRow).toBeDisplayed()

    // Toggle button should say "Disable skill"
    const toggleBtn = await $('[aria-label="Disable skill"]')
    await expect(toggleBtn).toExist()

    await goBack()
  })

  it('toggling off moves skill to .disabled/ on disk', async () => {
    expect(isSkillActive()).toBe(true)
    expect(isSkillDisabled()).toBe(false)

    await openClaudeDetail()

    // Find and click the disable toggle for our test skill
    const skillRow = await $(`span*=__e2e_test_skill__`)
    await skillRow.scrollIntoView()
    const toggleBtn = await skillRow.$('..') // parent
    const disableBtn = await toggleBtn.$('[aria-label="Disable skill"]')
    await disableBtn.click()

    // Wait for IPC + FSEvents
    await browser.pause(1500)

    expect(isSkillDisabled()).toBe(true)
    expect(isSkillActive()).toBe(false)

    await goBack()
  })

  it('disabled skill shows with reduced opacity', async () => {
    await openClaudeDetail()

    const opacityRow = await $('.opacity-40')
    await expect(opacityRow).toExist()

    await goBack()
  })

  it('toggling on moves skill back to active', async () => {
    expect(isSkillDisabled()).toBe(true)

    await openClaudeDetail()

    const enableBtn = await $('[aria-label="Enable skill"]')
    await enableBtn.click()

    await browser.pause(1500)

    expect(isSkillActive()).toBe(true)
    expect(isSkillDisabled()).toBe(false)

    await goBack()
  })

  it('re-enabled skill no longer has opacity-40', async () => {
    await openClaudeDetail()

    // Find skill row — should not have opacity-40 anymore
    const disabledRows = await $$('.opacity-40')
    const names = await Promise.all([...disabledRows].map(r => r.getText()))
    expect(names.every((n: string) => !n.includes('__e2e_test_skill__'))).toBe(true)

    await goBack()
  })
})
