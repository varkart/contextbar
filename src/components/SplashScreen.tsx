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
    if (!backendReady) return
    setExiting(true)
    setTimeout(onDismiss, 280)
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[var(--c-bg)] ${exiting ? 'splash-out' : 'splash-fade-in'}`}
      style={{ animationFillMode: 'forwards' }}
    >
      {/* glow ring + logo */}
      <div className="relative flex items-center justify-center">
        <div
          className="splash-glow absolute w-48 h-48 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(139,92,246,0.45) 0%, rgba(99,102,241,0.15) 50%, rgba(139,92,246,0) 75%)',
          }}
        />
        <img
          src="/sloth.png"
          alt="LLM Manager"
          className="splash-float relative w-32 h-32 object-contain"
          style={{ filter: 'drop-shadow(0 8px 24px rgba(139,92,246,0.5)) drop-shadow(0 4px 8px rgba(0,0,0,0.4))' }}
          draggable={false}
        />
      </div>

      {/* title + cycling tip */}
      <div className="flex flex-col items-center gap-2 text-center px-6 w-full">
        <p className="text-[22px] font-bold text-[var(--c-text)] tracking-[-0.02em]">
          LLM Manager
        </p>
        <p
          key={tipIndex}
          className="text-[14px] text-[var(--c-text-3)] splash-fade-in whitespace-nowrap"
          style={{ animationDuration: '0.35s' }}
        >
          {TIPS[tipIndex]}
        </p>
      </div>

      {/* loading dots while backend spinning up */}
      {!backendReady && (
        <div className="flex gap-2">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-violet-400/60 animate-pulse"
              style={{ animationDelay: `${i * 180}ms` }}
            />
          ))}
        </div>
      )}

      {/* Continue button */}
      <button
        onClick={handleContinue}
        disabled={!backendReady || exiting}
        className={`
          relative px-7 py-2.5 text-[15px] font-semibold rounded-2xl
          transition-all duration-200 select-none
          ${backendReady && !exiting
            ? 'splash-fade-in text-white cursor-pointer hover:scale-105 active:scale-95'
            : 'opacity-0 pointer-events-none'
          }
        `}
        style={{
          animationDuration: '0.35s',
          background: backendReady ? 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)' : undefined,
          boxShadow: backendReady ? '0 4px 24px rgba(124,58,237,0.45), 0 1px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)' : undefined,
        }}
      >
        Continue
        <span className="ml-1.5 opacity-70">→</span>
      </button>
    </div>
  )
}
