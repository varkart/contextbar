import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

const CACHE_KEY = 'contextbar:updateCheck'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export interface UpdateInfo {
  latestVersion: string
  releaseUrl: string
  checkedAt: number
}

function loadCache(): UpdateInfo | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as UpdateInfo
    if (Date.now() - data.checkedAt > CACHE_TTL_MS) return null
    return data
  } catch {
    return null
  }
}

function saveCache(info: UpdateInfo) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(info))
  } catch {}
}

function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number)
  const [lMaj, lMin, lPat] = parse(latest)
  const [cMaj, cMin, cPat] = parse(current)
  if (lMaj !== cMaj) return lMaj > cMaj
  if (lMin !== cMin) return lMin > cMin
  return lPat > cPat
}

export function useUpdateCheck(currentVersion: string) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    if (!currentVersion) return

    const cached = loadCache()
    if (cached && isNewer(cached.latestVersion, currentVersion)) {
      setUpdateInfo(cached)
      return
    }

    // Try tauri-plugin-updater IPC first (works when signed + endpoints configured)
    invoke<{ version: string; currentVersion: string } | null>('check_for_update')
      .then(result => {
        if (result && isNewer(result.version, currentVersion)) {
          const info: UpdateInfo = {
            latestVersion: result.version,
            releaseUrl: `https://github.com/varkart/contextbar/releases/tag/v${result.version}`,
            checkedAt: Date.now(),
          }
          saveCache(info)
          setUpdateInfo(info)
        }
      })
      .catch(() => {
        // Fallback: GitHub API (works without signing)
        fetch('https://api.github.com/repos/varkart/contextbar/releases/latest', {
          headers: { Accept: 'application/vnd.github+json' },
        })
          .then(r => r.json())
          .then((data: { tag_name: string; html_url: string }) => {
            if (!data.tag_name) return
            const info: UpdateInfo = {
              latestVersion: data.tag_name,
              releaseUrl: data.html_url,
              checkedAt: Date.now(),
            }
            saveCache(info)
            if (isNewer(data.tag_name, currentVersion)) {
              setUpdateInfo(info)
            }
          })
          .catch(() => {})
      })
  }, [currentVersion])

  return updateInfo
}
