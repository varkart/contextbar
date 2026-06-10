import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { ThemePreference } from '../useTheme'
import { capture } from '../analytics'

interface SettingsProps {
  onBack: () => void
  updateInfo?: { latestVersion: string; releaseUrl: string } | null
  theme: ThemePreference
  onThemeChange: (t: ThemePreference) => void
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-[18px] w-[32px] flex-shrink-0 rounded-full transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
        checked ? 'bg-indigo-500' : 'bg-[var(--c-track)]'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`inline-block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform duration-150 mt-[2px] ${
        checked ? 'translate-x-[16px]' : 'translate-x-[2px]'
      }`} />
    </button>
  )
}

function SettingRow({ label, description, children }: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-[15px] text-[var(--c-text)]">{label}</p>
        {description && <p className="text-[13px] text-[var(--c-text-3)] mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px] text-[var(--c-text-3)] font-medium mb-1 mt-4 first:mt-0">
      {children}
    </p>
  )
}

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="w-4 h-4">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="w-4 h-4">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

function SystemIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="w-4 h-4">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  )
}

function ThemeSelector({ value, onChange }: { value: ThemePreference; onChange: (t: ThemePreference) => void }) {
  const options: { key: ThemePreference; label: string; Icon: () => React.ReactElement }[] = [
    { key: 'light',  label: 'Light',  Icon: SunIcon    },
    { key: 'system', label: 'System', Icon: SystemIcon  },
    { key: 'dark',   label: 'Dark',   Icon: MoonIcon    },
  ]
  return (
    <div className="flex gap-2 py-2">
      {options.map(({ key, label, Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all duration-150 ${
            value === key
              ? 'border-indigo-500 bg-indigo-500/10 text-indigo-500'
              : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:border-[var(--c-text-3)] hover:text-[var(--c-text-2)]'
          }`}
          aria-pressed={value === key}
        >
          <Icon />
          <span className="text-[13px] font-medium">{label}</span>
        </button>
      ))}
    </div>
  )
}

function ShortcutRecorder({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const [recording, setRecording] = useState(false)
  const [pending, setPending] = useState<string | null>(null)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') { setRecording(false); setPending(null); return }

    const modifiers: string[] = []
    if (e.metaKey || e.ctrlKey) modifiers.push('CommandOrControl')
    if (e.shiftKey) modifiers.push('Shift')
    if (e.altKey) modifiers.push('Alt')

    const ignored = new Set(['Meta', 'Control', 'Shift', 'Alt', 'CapsLock', 'Tab'])
    if (ignored.has(e.key)) return

    const keyMap: Record<string, string> = {
      ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
      Enter: 'Return', Backspace: 'Backspace', Delete: 'Delete', Escape: 'Escape',
    }
    const key = keyMap[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key)
    if (!modifiers.length) return

    const combo = [...modifiers, key].join('+')
    setPending(combo)
  }

  const handleKeyUp = async () => {
    if (!pending) return
    setRecording(false)
    const next = pending
    setPending(null)
    onChange(next)
  }

  return (
    <button
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={() => { setRecording(false); setPending(null) }}
      onClick={() => setRecording(true)}
      className={`text-[13px] font-mono px-1.5 py-0.5 rounded border transition-all duration-150 min-w-[72px] text-center ${
        recording
          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400 outline-none'
          : 'border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-2)] hover:border-indigo-400/50'
      }`}
      title="Click to record new shortcut"
    >
      {recording ? (pending ? formatShortcut(pending) : 'Press keys…') : formatShortcut(value)}
    </button>
  )
}

function ExternalLinkIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="w-2.5 h-2.5">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

function formatShortcut(raw: string): string {
  return raw
    .replace('CommandOrControl', '⌘')
    .replace('Command', '⌘')
    .replace('Control', '⌃')
    .replace('Shift', '⇧')
    .replace('Alt', '⌥')
    .replace(/\+/g, '')
}

export default function Settings({ onBack, updateInfo, theme, onThemeChange }: SettingsProps) {
  const [autostart, setAutostart] = useState(false)
  const [autostartLoading, setAutostartLoading] = useState(true)
  const [shortcut, setShortcut] = useState('CommandOrControl+Shift+Space')
  const [shortcutLoading, setShortcutLoading] = useState(true)
  const [vibrancy, setVibrancy] = useState(true)
  const [vibrancyLoading, setVibrancyLoading] = useState(true)
  const [version, setVersion] = useState('')

  useEffect(() => {
    Promise.all([
      invoke<boolean>('get_autostart').then(setAutostart).catch(() => {}),
      invoke<string>('get_version').then(setVersion).catch(() => setVersion('0.5.0')),
      invoke<string>('get_shortcut').then(setShortcut).catch(() => {}),
      invoke<boolean>('get_vibrancy').then(setVibrancy).catch(() => {}),
    ]).finally(() => {
      setAutostartLoading(false)
      setShortcutLoading(false)
      setVibrancyLoading(false)
    })
  }, [])

  const handleAutostart = async (enabled: boolean) => {
    setAutostart(enabled)
    try {
      await invoke('set_autostart', { enabled })
      capture('settings_autostart_changed', { enabled })
    } catch { setAutostart(!enabled) }
  }

  const handleVibrancy = async (enabled: boolean) => {
    setVibrancy(enabled)
    try {
      await invoke('set_vibrancy', { enabled })
      capture('settings_vibrancy_changed', { enabled })
    } catch { setVibrancy(!enabled) }
  }

  const handleShortcutChange = async (s: string) => {
    const prev = shortcut
    setShortcut(s)
    try {
      await invoke('set_shortcut', { shortcut: s })
      capture('settings_shortcut_changed', { shortcut: s })
    } catch { setShortcut(prev) }
  }

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--c-border)] flex-shrink-0">
        <button
          onClick={onBack}
          className="text-[var(--c-text-2)] hover:text-[var(--c-text)] transition-colors p-0.5 -ml-0.5 rounded"
          aria-label="Back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="w-3.5 h-3.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="text-[15px] font-semibold text-[var(--c-text)] tracking-[-0.01em]">Settings</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <SectionLabel>General</SectionLabel>
        <div className="divide-y divide-[var(--c-border-sub)]">
          <SettingRow label="Launch at login" description="Start aicontextbar when you log in">
            <Toggle checked={autostart} onChange={handleAutostart} disabled={autostartLoading} />
          </SettingRow>
          <SettingRow label="Global shortcut" description="Click to record new shortcut">
            {shortcutLoading ? (
              <span className="text-[13px] text-[var(--c-text-3)] font-mono bg-[var(--c-surface)] px-1.5 py-0.5 rounded">—</span>
            ) : (
              <ShortcutRecorder value={shortcut} onChange={handleShortcutChange} />
            )}
          </SettingRow>
        </div>

        <SectionLabel>Appearance</SectionLabel>
        <ThemeSelector value={theme} onChange={(t) => {
          capture('settings_theme_changed', { theme: t })
          onThemeChange(t)
        }} />
        <div className="divide-y divide-[var(--c-border-sub)]">
          <SettingRow label="Window vibrancy" description="Takes effect when panel reopens">
            <Toggle checked={vibrancy} onChange={handleVibrancy} disabled={vibrancyLoading} />
          </SettingRow>
        </div>

        <SectionLabel>About</SectionLabel>
        <div className="divide-y divide-[var(--c-border-sub)]">
          <SettingRow label="Version">
            <span className="text-[14px] text-[var(--c-text-3)] font-mono tabular-nums">v{version}</span>
          </SettingRow>
          {updateInfo && (
            <SettingRow label="Update">
              <a href={updateInfo.releaseUrl} target="_blank" rel="noopener noreferrer"
                className="text-[13px] text-indigo-500 hover:text-indigo-400 transition-colors flex items-center gap-1">
                {updateInfo.latestVersion} available <ExternalLinkIcon />
              </a>
            </SettingRow>
          )}
          <SettingRow label="Source">
            <a href="https://github.com/varkart/aicontextbar" target="_blank" rel="noopener noreferrer"
              className="text-[13px] text-indigo-500 hover:text-indigo-400 transition-colors flex items-center gap-1">
              github.com/varkart/aicontextbar <ExternalLinkIcon />
            </a>
          </SettingRow>
        </div>
      </div>
    </div>
  )
}
