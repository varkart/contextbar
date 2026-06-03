import { useState, useEffect } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'aicontextbar:theme'

function getSystemDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyTheme(pref: ThemePreference) {
  const dark = pref === 'dark' || (pref === 'system' && getSystemDark())
  document.documentElement.classList.toggle('dark', dark)
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemePreference>(() =>
    (localStorage.getItem(STORAGE_KEY) as ThemePreference) || 'system'
  )

  useEffect(() => {
    applyTheme(theme)

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => applyTheme('system')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])

  const setTheme = (pref: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, pref)
    setThemeState(pref)
    applyTheme(pref)
  }

  return { theme, setTheme }
}
