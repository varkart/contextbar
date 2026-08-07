import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { ThemePreference } from '../useTheme'
import type { GitCliStatus, GitCliInfo, CustomGitHost } from '../types'
import { getCustomGitHosts, setCustomGitHosts } from '../gitHosts'
import { capture } from '../analytics'

interface SettingsProps {
  onBack: () => void
  updateInfo?: { latestVersion: string; releaseUrl: string } | null
  checkingUpdate?: boolean
  onCheckUpdateNow?: () => void
  theme: ThemePreference
  onThemeChange: (t: ThemePreference) => void
  onOpenLogs?: () => void
  onOpenDoctor?: () => void
}

function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
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
          className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-all duration-150 ${
            value === key
              ? 'border-transparent ring-1 ring-indigo-500 bg-indigo-500/10 text-indigo-500'
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

const EMPTY_CLI_INFO: GitCliInfo = { installed: false, authenticated: false }

function CliRow({ name, icon, info, onRecheck }: { name: string; icon: string; info: GitCliInfo; onRecheck: () => Promise<void> }) {
  const [rechecking, setRechecking] = useState(false)
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${info.installed ? 'border-[var(--c-border)]' : 'border-amber-500/35 bg-amber-500/5'}`}>
      <span className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white bg-[var(--c-text-3)] shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{name}</p>
        <p className="text-[11px] text-[var(--c-text-3)]">
          {info.installed
            ? `Detected — v${info.version ?? '?'}${info.authenticated ? `, authenticated${info.account ? ` as ${info.account}` : ''}` : ', not authenticated'}`
            : 'Not found on PATH'}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${info.installed ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-600'}`}>
          {info.installed ? 'Installed' : 'Not found'}
        </span>
        <button
          onClick={async () => { setRechecking(true); await onRecheck(); setRechecking(false) }}
          disabled={rechecking}
          className="text-[11px] px-2 py-1 rounded-md border border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors disabled:opacity-50"
        >
          {rechecking ? 'Checking…' : 'Recheck'}
        </button>
      </div>
    </div>
  )
}

function GitHostsSection() {
  const [cli, setCli] = useState<GitCliStatus | null>(null)
  const [hosts, setHosts] = useState<CustomGitHost[]>(() => getCustomGitHosts())
  const [addOpen, setAddOpen] = useState(false)
  const [newDomain, setNewDomain] = useState('')
  const [newKind, setNewKind] = useState<'github' | 'gitlab'>('gitlab')

  const fetchStatus = () => invoke<GitCliStatus>('get_git_cli_status').then(setCli).catch(() => {})

  useEffect(() => { fetchStatus() }, [])

  const addHost = () => {
    const domain = newDomain.trim()
    if (!domain) return
    const next = [...hosts, { domain, kind: newKind }]
    setHosts(next)
    setCustomGitHosts(next)
    setNewDomain('')
    setAddOpen(false)
  }

  const removeHost = (i: number) => {
    const next = hosts.filter((_, idx) => idx !== i)
    setHosts(next)
    setCustomGitHosts(next)
  }

  const gh = cli?.gh ?? EMPTY_CLI_INFO
  const glab = cli?.glab ?? EMPTY_CLI_INFO
  const anyGitlabHost = hosts.some(h => h.kind === 'gitlab')

  let warning: string | null = null
  if (cli !== null) {
    if (!gh.installed && !glab.installed) {
      warning = 'Neither gh nor glab is installed — PR/MR tracking is off for every repo until at least one is set up.'
    } else if (!glab.installed) {
      const suffix = anyGitlabHost ? ` — including ${hosts.find(h => h.kind === 'gitlab')!.domain}, which you've configured below` : ''
      warning = `glab isn't installed, so GitLab repos won't show their open MRs${suffix}. Install glab, or ignore this if you don't use GitLab.`
    } else if (!gh.installed) {
      warning = "gh isn't installed, so GitHub repos won't show their open PRs. Install gh."
    }
  }

  return (
    <>
      <div className="space-y-2">
        <CliRow name="GitHub CLI" icon="gh" info={gh} onRecheck={fetchStatus} />
        <CliRow name="GitLab CLI" icon="gl" info={glab} onRecheck={fetchStatus} />
      </div>
      {warning && (
        <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/25 text-[12px] text-amber-600 leading-relaxed">
          <span className="shrink-0">⚠</span>
          <span>{warning}</span>
        </div>
      )}

      <p className="text-[12px] text-[var(--c-text-3)] mt-4 mb-2">
        github.com and gitlab.com work automatically. Add a domain if your team runs GitHub Enterprise or self-managed GitLab.
      </p>
      {hosts.length === 0 ? (
        <p className="text-[12px] text-[var(--c-text-3)]">No self-hosted instances configured.</p>
      ) : (
        <div className="space-y-1.5">
          {hosts.map((h, i) => {
            const cliMissing = cli !== null && ((h.kind === 'gitlab' && !glab.installed) || (h.kind === 'github' && !gh.installed))
            return (
              <div key={`${h.kind}:${h.domain}`} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md border border-[var(--c-border)]">
                <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${h.kind === 'github' ? 'bg-zinc-500/15 text-zinc-500' : 'bg-orange-500/15 text-orange-500'}`}>
                  {h.kind === 'github' ? 'GH Enterprise' : 'GitLab'}
                </span>
                <span className="text-[12.5px] font-mono flex-1 min-w-0 truncate">{h.domain}</span>
                {cliMissing && <span className="text-[10px] text-amber-600 shrink-0">⚠ {h.kind === 'gitlab' ? 'glab' : 'gh'} missing</span>}
                <button onClick={() => removeHost(i)} aria-label={`Remove ${h.domain}`} className="text-[13px] text-[var(--c-text-3)] hover:text-rose-400 transition-colors px-1">✕</button>
              </div>
            )
          })}
        </div>
      )}

      {addOpen ? (
        <div className="flex items-center gap-2 mt-2 p-2.5 rounded-lg border border-dashed border-[var(--c-border)]">
          <select
            value={newKind}
            onChange={e => setNewKind(e.target.value as 'github' | 'gitlab')}
            className="text-[12.5px] px-2 py-1.5 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)]"
          >
            <option value="github">GitHub Enterprise</option>
            <option value="gitlab">GitLab self-managed</option>
          </select>
          <input
            type="text"
            value={newDomain}
            onChange={e => setNewDomain(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addHost(); if (e.key === 'Escape') setAddOpen(false) }}
            placeholder="git.mycompany.com"
            autoFocus
            className="flex-1 min-w-0 text-[12.5px] font-mono px-2 py-1.5 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-text)] outline-none focus:border-indigo-400/50"
          />
          <button onClick={addHost} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md bg-indigo-500 text-white">Add</button>
          <button onClick={() => { setAddOpen(false); setNewDomain('') }} className="text-[11px] px-2.5 py-1.5 rounded-md border border-[var(--c-border)] text-[var(--c-text-3)]">Cancel</button>
        </div>
      ) : (
        <button
          onClick={() => setAddOpen(true)}
          className="mt-2 text-[11.5px] font-medium px-2.5 py-1.5 rounded-md border border-[var(--c-border)] text-[var(--c-text-2)] hover:border-[var(--c-text-3)] transition-colors"
        >
          + Add self-hosted instance
        </button>
      )}
    </>
  )
}

export default function Settings({ updateInfo, checkingUpdate, onCheckUpdateNow, theme, onThemeChange, onOpenLogs, onOpenDoctor }: SettingsProps) {
  const [autostart, setAutostart] = useState(false)
  const [autostartLoading, setAutostartLoading] = useState(true)
  const [shortcut, setShortcut] = useState('CommandOrControl+Shift+Space')
  const [shortcutLoading, setShortcutLoading] = useState(true)
  const [vibrancy, setVibrancy] = useState(true)
  const [vibrancyLoading, setVibrancyLoading] = useState(true)
  const [version, setVersion] = useState('')
  const [accessibilityGranted, setAccessibilityGranted] = useState<boolean | null>(null)
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const [terminal, setTerminal] = useState('Terminal')
  const [terminals, setTerminals] = useState<string[]>(['Terminal'])
  const [justCheckedUpdate, setJustCheckedUpdate] = useState(false)
  const wasCheckingUpdate = useRef(false)

  useEffect(() => {
    const finishedChecking = wasCheckingUpdate.current && !checkingUpdate
    wasCheckingUpdate.current = !!checkingUpdate
    if (!finishedChecking) return
    setJustCheckedUpdate(true)
    const t = setTimeout(() => setJustCheckedUpdate(false), 3000)
    return () => clearTimeout(t)
  }, [checkingUpdate])

  useEffect(() => {
    Promise.all([
      invoke<boolean>('get_autostart').then(setAutostart).catch(() => {}),
      invoke<string>('get_version').then(setVersion).catch(() => setVersion('0.5.0')),
      invoke<string>('get_shortcut').then(setShortcut).catch(() => {}),
      invoke<boolean>('get_vibrancy').then(setVibrancy).catch(() => {}),
      invoke<string>('get_terminal')
        .then(t => { if (typeof t === 'string' && t) setTerminal(t) })
        .catch(() => {}),
      invoke<string[]>('list_terminals')
        .then(t => { if (Array.isArray(t) && t.length) setTerminals(t) })
        .catch(() => {}),
      invoke<boolean>('check_accessibility').then(setAccessibilityGranted).catch(() => setAccessibilityGranted(true)),
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
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <SectionLabel>General</SectionLabel>
        <div className="divide-y divide-[var(--c-border-sub)]">
          <SettingRow label="Launch at login" description="Start Context Bar when you log in">
            <Toggle checked={autostart} onChange={handleAutostart} disabled={autostartLoading} label="Launch at login" />
          </SettingRow>
          <SettingRow label="Global shortcut" description="Click to record new shortcut">
            {shortcutLoading ? (
              <span className="text-[13px] text-[var(--c-text-3)] font-mono bg-[var(--c-surface)] px-1.5 py-0.5 rounded">—</span>
            ) : (
              <ShortcutRecorder value={shortcut} onChange={handleShortcutChange} />
            )}
          </SettingRow>
          {accessibilityGranted === false && (
            <SettingRow
              label="Accessibility"
              description="Required for global shortcut to work"
            >
              <button
                onClick={() => invoke('open_accessibility_settings')}
                className="text-[12px] text-amber-500 hover:text-amber-400 border border-amber-500/30 hover:border-amber-400/50 px-2 py-0.5 rounded transition-colors"
              >
                Open Settings
              </button>
            </SettingRow>
          )}
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
          {terminals.length > 1 && (
            <SettingRow label="Resume terminal" description="App used by ▶ Resume buttons">
              <div className="flex gap-1">
                {terminals.map(t => (
                  <button
                    key={t}
                    onClick={async () => {
                      const prev = terminal
                      setTerminal(t)
                      try {
                        await invoke('set_terminal', { terminal: t })
                        capture('settings_terminal_changed', { terminal: t })
                      } catch { setTerminal(prev) }
                    }}
                    className={`text-[12px] px-2.5 py-1 rounded-md border transition-colors ${terminal === t ? 'border-indigo-400/60 bg-indigo-500/10 text-indigo-400' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </SettingRow>
          )}
        </div>

        <SectionLabel>Source control</SectionLabel>
        <GitHostsSection />

        {(onOpenLogs || onOpenDoctor) && (
          <>
            <SectionLabel>Developer</SectionLabel>
            <div className="divide-y divide-[var(--c-border-sub)]">
              {onOpenDoctor && (
                <button
                  onClick={onOpenDoctor}
                  className="w-full flex items-center justify-between px-4 py-2 hover:bg-[var(--c-hover)] transition-colors text-left"
                >
                  <span className="text-[14px] text-[var(--c-text-2)]">Doctor</span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="w-3 h-3 text-[var(--c-text-3)]">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
              )}
              {onOpenLogs && (
                <button
                  onClick={onOpenLogs}
                  className="w-full flex items-center justify-between px-4 py-2 hover:bg-[var(--c-hover)] transition-colors text-left"
                >
                  <span className="text-[14px] text-[var(--c-text-2)]">Activity Log</span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="w-3 h-3 text-[var(--c-text-3)]">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
              )}
            </div>
          </>
        )}

        <SectionLabel>About</SectionLabel>
        <div className="divide-y divide-[var(--c-border-sub)]">
          <SettingRow label="Version">
            <span className="text-[14px] text-[var(--c-text-3)] font-mono tabular-nums">v{version}</span>
          </SettingRow>
          {updateInfo ? (
            <SettingRow label="Update">
              <div className="flex flex-col items-end gap-1">
                <button
                  onClick={async () => {
                    setInstalling(true)
                    setInstallError(null)
                    try {
                      await invoke('install_update')
                    } catch (e) {
                      setInstallError(String(e))
                      setInstalling(false)
                    }
                  }}
                  disabled={installing}
                  className="text-[13px] px-2 py-0.5 rounded-md border border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {installing ? 'Installing…' : `Install ${updateInfo.latestVersion}`}
                </button>
                {installError && (
                  <span className="text-[11px] text-red-400 max-w-[160px] text-right">{installError}</span>
                )}
              </div>
            </SettingRow>
          ) : (
            onCheckUpdateNow && (
              <SettingRow label="Update">
                {justCheckedUpdate ? (
                  <span className="text-[13px] text-[var(--c-text-3)]">Up to date</span>
                ) : (
                  <button
                    onClick={onCheckUpdateNow}
                    disabled={checkingUpdate}
                    className="text-[13px] text-indigo-500 hover:text-indigo-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {checkingUpdate ? 'Checking…' : 'Check for updates'}
                  </button>
                )}
              </SettingRow>
            )
          )}
          <SettingRow label="Source">
            <a href="https://github.com/varkart/contextbar" target="_blank" rel="noopener noreferrer"
              className="text-[13px] text-indigo-500 hover:text-indigo-400 transition-colors flex items-center gap-1">
              github.com/varkart/contextbar <ExternalLinkIcon />
            </a>
          </SettingRow>
        </div>
      </div>
    </div>
  )
}
