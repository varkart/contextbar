import { useState, useEffect } from 'react'

const TIPS = [
  'take a small break',
  'rest ur eyes',
  'stretch ur back',
  'have a sip of water'
]

interface SplashScreenProps {
  backendReady: boolean
  onDismiss: () => void
}

export default function SplashScreen({ backendReady, onDismiss }: SplashScreenProps) {
  const [exiting, setExiting] = useState(false)
  const [cycleDone, setCycleDone] = useState(false)
  const [text, setText] = useState('')

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    let charIdx = 0
    let msgIdx = 0
    let isDel = false

    const type = () => {
      const msg = TIPS[msgIdx]
      
      if (isDel) {
        charIdx--
      } else {
        charIdx++
      }
      
      setText(msg.substring(0, charIdx))
      
      let spd = isDel ? 30 : 70
      
      if (!isDel && charIdx === msg.length) {
        spd = 1500
        isDel = true
        if (msgIdx === TIPS.length - 1) {
          setCycleDone(true)
        }
      } else if (isDel && charIdx === 0) {
        isDel = false
        msgIdx = (msgIdx + 1) % TIPS.length
        spd = 500
      }
      
      timeout = setTimeout(type, spd)
    }
    
    type()
    
    return () => clearTimeout(timeout)
  }, [])

  useEffect(() => {
    if (backendReady && cycleDone) {
      setExiting(true)
      const t = setTimeout(onDismiss, 280)
      return () => clearTimeout(t)
    }
  }, [backendReady, cycleDone, onDismiss])

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[var(--c-bg)] ${exiting ? 'splash-out' : 'splash-fade-in'}`}
      style={{ animationFillMode: 'forwards' }}
    >
      <img
        src="/sloth.png"
        alt="LLM Manager"
        className="splash-float w-32 h-32 object-contain"
        draggable={false}
      />

      {/* title + typewriter tip */}
      <div className="flex flex-col items-center gap-2 text-center w-full">
        <p className="text-[22px] font-bold text-[var(--c-text)] tracking-[-0.02em]">
          LLM Manager
        </p>
        <div className="flex flex-col items-center justify-center h-[44px] gap-1">
          <span className="text-[14px] text-[var(--c-text-3)]">
            we are loading, until then
          </span>
          <div className="flex items-center">
            <span className="font-mono text-[14px] text-violet-400 dark:text-violet-400">
              {text}
            </span>
            <span 
              className="inline-block w-2 h-4 bg-violet-400 ml-1"
              style={{ animation: 'sp-blink 0.8s step-end infinite' }} 
            />
          </div>
        </div>
      </div>

      {/* fixed-height action zone — shows dots if backend not ready or animation still going */}
      <div className="flex items-center justify-center" style={{ minHeight: '44px' }}>
        {(!backendReady || !cycleDone) && (
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
