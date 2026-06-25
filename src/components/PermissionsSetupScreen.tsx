import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface Props {
  onDone: () => void
}

function KeyboardIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className="w-5 h-5 flex-shrink-0 text-[var(--c-text-2)]">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
    </svg>
  )
}

export default function PermissionsSetupScreen({ onDone }: Props) {
  const [granted, setGranted] = useState<boolean | null>(null)
  const [polling, setPolling] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    invoke<boolean>('check_accessibility')
      .then(setGranted)
      .catch(() => setGranted(false))

    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current)
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    }
  }, [])

  const handleOpenSettings = () => {
    invoke('open_accessibility_settings').catch(() => {})

    if (intervalRef.current !== null) clearInterval(intervalRef.current)
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)

    setPolling(true)
    intervalRef.current = setInterval(() => {
      invoke<boolean>('check_accessibility')
        .then((result) => {
          setGranted(result)
          if (result) {
            if (intervalRef.current !== null) clearInterval(intervalRef.current)
            if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
            setPolling(false)
          }
        })
        .catch(() => {})
    }, 2000)

    timeoutRef.current = setTimeout(() => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current)
      setPolling(false)
    }, 120_000)
  }

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] px-4 pt-5 pb-4">
      {/* Header */}
      <div className="mb-5">
        <p className="text-[11px] font-medium text-[var(--c-text-3)] uppercase tracking-widest mb-1.5">
          Context Bar
        </p>
        <h1 className="text-[18px] font-semibold text-[var(--c-text)] tracking-[-0.02em] leading-snug">
          One permission needed
        </h1>
        <p className="text-[13px] text-[var(--c-text-3)] mt-1">
          Here's exactly what it accesses and why.
        </p>
      </div>

      {/* Permission card */}
      <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-xl p-4 flex flex-col gap-3">
        {/* Card header row */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <KeyboardIcon />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-medium text-[var(--c-text)]">
                Accessibility Access
              </span>
              <span className="text-[11px] font-medium text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded-md leading-none">
                Global Shortcut
              </span>
            </div>

            {/* Status indicator */}
            <div className="flex items-center gap-1.5 mt-1.5">
              {granted === null ? (
                <span className="text-[12px] text-[var(--c-text-3)]">Checking…</span>
              ) : granted ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  <span className="text-[12px] text-emerald-500 font-medium">Granted</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                  <span className="text-[12px] text-amber-500 font-medium">Not granted</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Body copy */}
        <p className="text-[12px] text-[var(--c-text-3)] leading-relaxed">
          Registers your shortcut key (⌘⇧Space by default) as a system-wide hotkey,
          so you can open Context Bar from any app without switching focus.
        </p>
        <p className="text-[12px] text-[var(--c-text-3)] leading-relaxed">
          macOS requires Accessibility permission to intercept key combinations
          across applications.
        </p>
        <p className="text-[12px] text-[var(--c-text-3)] leading-relaxed">
          Context Bar only listens for your configured shortcut. It does not read
          your screen, control other apps, log keystrokes, or transmit any input data.
        </p>

        {/* Action button — only shown when not granted */}
        {granted === false && (
          <div className="pt-1">
            <button
              onClick={handleOpenSettings}
              disabled={polling}
              className="text-amber-500 border border-amber-500/30 hover:border-amber-400/50 text-[12px] px-3 py-1 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {polling ? 'Waiting for permission…' : 'Open System Settings →'}
            </button>
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer */}
      <div className="flex items-center justify-between pt-4">
        <p className="text-[12px] text-[var(--c-text-3)]">
          You can grant this later in Settings
        </p>
        <button
          onClick={onDone}
          className="bg-indigo-500 hover:bg-indigo-400 text-white text-[13px] font-medium px-4 py-1.5 rounded-lg transition-colors"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
