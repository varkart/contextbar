import { useState, useEffect } from 'react'

const CACHE_KEY = 'agentbar:updateCheck'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface UpdateInfo {
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
  // Strip leading 'v'
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

    // Check cache first
    const cached = loadCache()
    if (cached && isNewer(cached.latestVersion, currentVersion)) {
      setUpdateInfo(cached)
      return
    }

    // Fetch GitHub API
    fetch('https://api.github.com/repos/varkart/agentbar/releases/latest', {
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
      .catch(() => {}) // silent fail — no update info is fine
  }, [currentVersion])

  return updateInfo
}
