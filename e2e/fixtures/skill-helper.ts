import fs from 'fs'
import path from 'path'
import os from 'os'

const SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills')
const DISABLED_DIR = path.join(SKILLS_DIR, '.disabled')
const TEST_SKILL = '__e2e_test_skill__'

export function createTestSkill() {
  const skillPath = path.join(SKILLS_DIR, TEST_SKILL)
  fs.mkdirSync(skillPath, { recursive: true })
  fs.writeFileSync(path.join(skillPath, 'SKILL.md'), `# ${TEST_SKILL}\nE2E test skill.`)
  return skillPath
}

export function removeTestSkill() {
  const active = path.join(SKILLS_DIR, TEST_SKILL)
  const disabled = path.join(DISABLED_DIR, TEST_SKILL)
  if (fs.existsSync(active)) fs.rmSync(active, { recursive: true })
  if (fs.existsSync(disabled)) fs.rmSync(disabled, { recursive: true })
}

export function isSkillActive(): boolean {
  return fs.existsSync(path.join(SKILLS_DIR, TEST_SKILL))
}

export function isSkillDisabled(): boolean {
  return fs.existsSync(path.join(DISABLED_DIR, TEST_SKILL))
}
