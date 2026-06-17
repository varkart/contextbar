import { useState, useEffect } from 'react'

const TIPS_TEXT = 'take a small break  •  rest ur eyes  •  stretch ur back  •  have a sip of water  •  breathe slowly'

interface SplashScreenProps {
  backendReady: boolean
  onDismiss: () => void
}

export default function SplashScreen({ backendReady, onDismiss }: SplashScreenProps) {
  const [exiting, setExiting] = useState(false)
  const [scrollDone, setScrollDone] = useState(false)

  useEffect(() => {
    if (backendReady && scrollDone) {
      setExiting(true)
      const t = setTimeout(onDismiss, 280)
      return () => clearTimeout(t)
    }
  }, [backendReady, scrollDone, onDismiss])

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

      {/* title + scrolling tip */}
      <div className="flex flex-col items-center gap-2 text-center w-full overflow-hidden">
        <p className="text-[22px] font-bold text-[var(--c-text)] tracking-[-0.02em]">
          LLM Manager
        </p>
        <div className="w-full relative h-[20px] overflow-hidden">
          <p
            className="text-[14px] text-[var(--c-text-3)] whitespace-nowrap absolute"
            style={{ animation: 'splash-scroll 7s linear forwards' }}
            onAnimationEnd={() => setScrollDone(true)}
          >
            {TIPS_TEXT}
          </p>
        </div>
      </div>

      {/* fixed-height action zone — shows dots if backend not ready or animation still going */}
      <div className="flex items-center justify-center" style={{ minHeight: '44px' }}>
        {(!backendReady || !scrollDone) && (
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
      </div>
    </div>
  )
}
