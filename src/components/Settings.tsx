import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface SettingsProps {
  onBack: () => void
  updateInfo?: { latestVersion: string; releaseUrl: string } | null
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-[18px] w-[32px] flex-shrink-0 rounded-full transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
        checked ? 'bg-indigo-500' : 'bg-zinc-700'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform duration-150 mt-[2px] ${
          checked ? 'translate-x-[16px]' : 'translate-x-[2px]'
        }`}
      />
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
        <p className="text-[13px] text-zinc-200">{label}</p>
        {description && (
          <p className="text-[11px] text-zinc-600 mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] text-zinc-600 font-medium mb-1 mt-4 first:mt-0">
      {children}
    </p>
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
    .replace('Space', 'Space')
}

export default function Settings({ onBack, updateInfo }: SettingsProps) {
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
      invoke<string>('get_version').then(setVersion).catch(() => setVersion('0.2.0')),
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
    } catch {
      setAutostart(!enabled) // revert on error
    }
  }

  const handleVibrancy = async (enabled: boolean) => {
    setVibrancy(enabled)
    try {
      await invoke('set_vibrancy', { enabled })
    } catch {
      setVibrancy(!enabled) // revert
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800/80 flex-shrink-0">
        <button
          onClick={onBack}
          className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5 -ml-0.5 rounded"
          aria-label="Back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="w-3.5 h-3.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="text-[13px] font-semibold text-zinc-200 tracking-[-0.01em]">Settings</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <SectionLabel>General</SectionLabel>
        <div className="divide-y divide-zinc-800/60">
          <SettingRow
            label="Launch at login"
            description="Start agentbar when you log in"
          >
            <Toggle
              checked={autostart}
              onChange={handleAutostart}
              disabled={autostartLoading}
            />
          </SettingRow>

          <SettingRow
            label="Global shortcut"
            description="Open agentbar from anywhere"
          >
            {shortcutLoading ? (
              <span className="text-[11px] text-zinc-600 font-mono bg-zinc-800 px-1.5 py-0.5 rounded">
                —
              </span>
            ) : (
              <span className="text-[11px] text-zinc-400 font-mono bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded tabular-nums">
                {formatShortcut(shortcut)}
              </span>
            )}
          </SettingRow>
        </div>

        <SectionLabel>Appearance</SectionLabel>
        <div className="divide-y divide-zinc-800/60">
          <SettingRow
            label="Window vibrancy"
            description="Takes effect when panel reopens"
          >
            <Toggle checked={vibrancy} onChange={handleVibrancy} disabled={vibrancyLoading} />
          </SettingRow>
        </div>

        <SectionLabel>About</SectionLabel>
        <div className="divide-y divide-zinc-800/60">
          <SettingRow label="Version">
            <span className="text-[12px] text-zinc-500 font-mono tabular-nums">
              v{version}
            </span>
          </SettingRow>

          {updateInfo && (
            <SettingRow label="Update">
              <a
                href={updateInfo.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
              >
                {updateInfo.latestVersion} available
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className="w-2.5 h-2.5">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </SettingRow>
          )}

          <SettingRow label="Source">
            <a
              href="https://github.com/varkart/agentbar"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
            >
              github.com/varkart/agentbar
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="w-2.5 h-2.5">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </SettingRow>
        </div>
      </div>
    </div>
  )
}
