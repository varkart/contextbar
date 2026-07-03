import { useState, useEffect } from 'react'
import { TIPS } from '../constants/tips'

interface SplashScreenProps {
  backendReady: boolean
  onDismiss: () => void
}

export default function SplashScreen({ backendReady, onDismiss }: SplashScreenProps) {
  const [exiting, setExiting] = useState(false)
  const [completedTips, setCompletedTips] = useState<string[]>([])
  const [currentTipText, setCurrentTipText] = useState('')
  const [currentTipIndex, setCurrentTipIndex] = useState(0)

  useEffect(() => {
    if (currentTipIndex >= TIPS.length) return

    let charIdx = 0
    const fullText = TIPS[currentTipIndex]
    let timeout: ReturnType<typeof setTimeout>

    const typeChar = () => {
      if (charIdx < fullText.length) {
        charIdx++
        setCurrentTipText(fullText.substring(0, charIdx))
        timeout = setTimeout(typeChar, 60)
      } else {
        timeout = setTimeout(() => {
          setCompletedTips(prev => [...prev, fullText])
          setCurrentTipText('')
          setCurrentTipIndex(prev => prev + 1)
        }, 1500)
      }
    }

    timeout = setTimeout(typeChar, 200)

    return () => clearTimeout(timeout)
  }, [currentTipIndex])

  useEffect(() => {
    if (backendReady && currentTipIndex >= TIPS.length) {
      setExiting(true)
      const t = setTimeout(onDismiss, 280)
      return () => clearTimeout(t)
    }
  }, [backendReady, currentTipIndex, onDismiss])

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[var(--c-bg)] ${
        exiting ? 'splash-out' : ''
      }`}
      style={{ animationFillMode: 'forwards' }}
    >
      <img
        src="/sloth.png"
        alt="Context Bar"
        className="splash-float w-32 h-32 object-contain dark:brightness-0 dark:invert"
        draggable={false}
      />

      <div className="flex flex-col items-center gap-2 text-center w-full">
        <p className="text-[22px] font-bold text-[var(--c-text)] tracking-[-0.02em]">
          Context Bar
        </p>
        <div className="flex flex-col items-center justify-center gap-2">
          <span className="text-[13px] text-[var(--c-text-3)] mb-1">
            we are loading, until then
          </span>
          <div className="flex flex-col items-center gap-1.5 h-[96px] justify-start w-full">
            {completedTips.map((tip) => (
              <div
                key={tip}
                className="text-[13px] text-violet-400/80 dark:text-violet-400/80 font-medium w-full text-center"
                style={{ height: '20px', lineHeight: '20px' }}
              >
                {tip}
              </div>
            ))}
            {currentTipIndex < TIPS.length && (
              <div
                className="text-[13px] text-violet-400 dark:text-violet-400 font-medium w-full text-center flex items-center justify-center"
                style={{ height: '20px', lineHeight: '20px' }}
              >
                <span>{currentTipText}</span>
                <span
                  className="inline-block w-1.5 h-3.5 bg-violet-400 ml-1 flex-shrink-0"
                  style={{ animation: 'sp-blink 0.8s step-end infinite' }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* fixed-height action zone */}
      <div className="flex items-center justify-center" style={{ minHeight: '44px' }}>
        {!backendReady && (
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
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
