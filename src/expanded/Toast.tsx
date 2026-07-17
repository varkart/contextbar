import { useState, useCallback, useRef } from 'react'

export type ToastType = 'success' | 'error'

export interface ToastEntry {
  id: number
  type: ToastType
  message: string
}

const AUTO_DISMISS_MS = 3500

export function useToasts() {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const nextId = useRef(0)

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = nextId.current++
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => dismissToast(id), AUTO_DISMISS_MS)
  }, [dismissToast])

  return { toasts, showToast, dismissToast }
}

export function ToastStack({ toasts, onDismiss }: { toasts: ToastEntry[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 items-end">
      {toasts.map(t => (
        <div
          key={t.id}
          role="status"
          className={`flex items-center gap-2.5 min-w-[240px] max-w-sm bg-[var(--c-surface)] border border-[var(--c-border)] border-l-2 rounded-lg px-3.5 py-2.5 text-[12px] shadow-xl animate-toast-in ${t.type === 'success' ? 'border-l-emerald-400' : 'border-l-rose-400'}`}
        >
          <span className={t.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}>
            {t.type === 'success' ? '✓' : '✕'}
          </span>
          <span className="flex-1 text-[var(--c-text-2)]">{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss"
            className="text-[var(--c-text-3)] hover:text-[var(--c-text)] transition-colors"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
