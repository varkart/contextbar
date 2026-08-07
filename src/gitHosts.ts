import type { CustomGitHost } from './types'

const STORAGE_KEY = 'contextbar:git-hosts'

export function getCustomGitHosts(): CustomGitHost[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function setCustomGitHosts(hosts: CustomGitHost[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hosts))
}
