import { useState, useEffect } from 'react'

const TIPS = [
  'take a small break',
  'rest ur eyes',
  'stretch ur back',
  'have a sip of water',
  'breathe slowly',
]

interface SplashScreenProps {
  backendReady: boolean
  onDismiss: () => void
}

export default function SplashScreen({ backendReady, onDismiss }: SplashScreenProps) {
  const [exiting, setExiting] = useState(false)
  const [tipIndex, setTipIndex] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setTipIndex(i => (i + 1) % TIPS.length), 2200)
    return () => clearInterval(t)
  }, [])

  const handleContinue = () => {
    setExiting(true)
    setTimeout(onDismiss, 280)
  }

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

      {/* title + cycling tip */}
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

      {/* Continue button — only when backend is ready (user can skip remaining wait) */}
      {backendReady && (
        <button
          onClick={handleContinue}
          className="mt-1 px-4 py-1.5 text-[13px] font-medium text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 rounded-lg transition-colors splash-fade-in"
          style={{ animationDuration: '0.3s' }}
        >
          Continue
        </button>
      )}
    </div>
  )
}
