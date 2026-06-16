import { useState, useEffect, useCallback } from 'react'

const TIPS = [
  'take a small break',
  'rest ur eyes',
  'stretch ur back',
  'have a sip of water',
  'breathe slowly',
]
const MIN_MS = 5000
const TIP_INTERVAL_MS = 2200

interface SplashScreenProps {
  backendReady: boolean
  onDismiss: () => void
}

export default function SplashScreen({ backendReady, onDismiss }: SplashScreenProps) {
  const [elapsed, setElapsed] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [tipIndex, setTipIndex] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setElapsed(true), MIN_MS)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setTipIndex(i => (i + 1) % TIPS.length), TIP_INTERVAL_MS)
    return () => clearInterval(t)
  }, [])

  const dismiss = useCallback(() => {
    setExiting(true)
    setTimeout(onDismiss, 300)
  }, [onDismiss])

  useEffect(() => {
    if (backendReady && elapsed) dismiss()
  }, [backendReady, elapsed, dismiss])

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-[var(--c-bg)] ${exiting ? 'splash-out' : 'splash-fade-in'}`}
      style={{ animationFillMode: 'forwards' }}
    >
      {/* glow ring behind logo */}
      <div className="relative flex items-center justify-center">
        <div
          className="splash-glow absolute w-28 h-28 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(139,92,246,0.35) 0%, rgba(139,92,246,0) 70%)',
          }}
        />
        <img
          src="/sloth.png"
          alt="LLM Manager"
          className="splash-float relative w-20 h-20 object-contain drop-shadow-lg"
          draggable={false}
        />
      </div>

      {/* title */}
      <div className="flex flex-col items-center gap-1">
        <p className="text-[17px] font-semibold text-[var(--c-text)] tracking-[-0.01em]">
          LLM Manager
        </p>
        <p
          key={tipIndex}
          className="text-[13px] text-[var(--c-text-3)] splash-fade-in"
          style={{ animationDuration: '0.4s' }}
        >
          {TIPS[tipIndex]}
        </p>
      </div>

      {/* loading dots while backend not ready */}
      {!backendReady && (
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="w-1 h-1 rounded-full bg-[var(--c-text-3)] animate-pulse"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </div>
      )}

      {/* continue button — only when backend is ready */}
      {backendReady && (
        <button
          onClick={dismiss}
          className="mt-1 px-4 py-1.5 text-[13px] font-medium text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 rounded-lg transition-colors splash-fade-in"
          style={{ animationDuration: '0.3s' }}
        >
          Continue
        </button>
      )}
    </div>
  )
}
