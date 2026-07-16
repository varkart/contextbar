import { useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'

/** Shows once per key, after a short delay, then never again once dismissed. */
export function useCoachmark(key: string, delayMs = 600) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(key)) return
    const t = setTimeout(() => setVisible(true), delayMs)
    return () => clearTimeout(t)
  }, [key, delayMs])

  const dismiss = useCallback(() => {
    localStorage.setItem(key, '1')
    setVisible(false)
  }, [key])

  return { visible, dismiss }
}

export function Coachmark({ title, children, onDismiss }: {
  title: string
  children: ReactNode
  onDismiss: () => void
}) {
  return (
    <div
      role="status"
      className="absolute top-full left-4 mt-2 z-40 w-64 rounded-lg bg-indigo-400 text-[#0a0a1a] px-3.5 py-3 text-[11.5px] shadow-xl leading-snug"
    >
      <div className="absolute -top-1.5 left-6 w-3 h-3 bg-indigo-400 rotate-45" aria-hidden="true" />
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute top-1.5 right-2 text-[#0a0a1a]/60 hover:text-[#0a0a1a] text-[12px]"
      >
        ✕
      </button>
      <b className="block mb-0.5">{title}</b>
      <p className="pr-3">{children}</p>
    </div>
  )
}
