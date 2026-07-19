import { useState, useEffect, useRef, useCallback } from 'react'
import { TIPS } from '../constants/tips'

interface SplashScreenProps {
  backendReady: boolean
  onDismiss: () => void
}

const MIN_SPLASH_MS = 800
const TYPE_SPEED_MS = 30
const TIP_HOLD_MS = 1100
const EXIT_MS = 280

// Tips play only on the first launch of the calendar day; every other
// launch dismisses as soon as the backend is ready.
function claimFirstLaunchToday(): boolean {
  const today = new Date().toDateString()
  if (localStorage.getItem('splash_tips_date') === today) return false
  localStorage.setItem('splash_tips_date', today)
  return true
}

export default function SplashScreen({ backendReady, onDismiss }: SplashScreenProps) {
  const [exiting, setExiting] = useState(false)
  const [showTips] = useState(claimFirstLaunchToday)
  const [completedTips, setCompletedTips] = useState<string[]>([])
  const [currentTipText, setCurrentTipText] = useState('')
  const [currentTipIndex, setCurrentTipIndex] = useState(0)
  const [minElapsed, setMinElapsed] = useState(false)
  const exitingRef = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!showTips || currentTipIndex >= TIPS.length) return

    let charIdx = 0
    const fullText = TIPS[currentTipIndex]
    let timeout: ReturnType<typeof setTimeout>

    const typeChar = () => {
      if (charIdx < fullText.length) {
        charIdx++
        setCurrentTipText(fullText.substring(0, charIdx))
        timeout = setTimeout(typeChar, TYPE_SPEED_MS)
      } else {
        timeout = setTimeout(() => {
          setCompletedTips(prev => [...prev, fullText])
          setCurrentTipText('')
          setCurrentTipIndex(prev => prev + 1)
        }, TIP_HOLD_MS)
      }
    }

    timeout = setTimeout(typeChar, 200)

    return () => clearTimeout(timeout)
  }, [showTips, currentTipIndex])

  const dismiss = useCallback(() => {
    if (exitingRef.current) return
    exitingRef.current = true
    setExiting(true)
    setTimeout(onDismiss, EXIT_MS)
  }, [onDismiss])

  const tipsDone = !showTips || currentTipIndex >= TIPS.length

  useEffect(() => {
    if (backendReady && minElapsed && tipsDone) dismiss()
  }, [backendReady, minElapsed, tipsDone, dismiss])

  const showContinue = showTips && backendReady && minElapsed && !tipsDone

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 ${
        exiting ? 'splash-out' : ''
      }`}
      style={{
        animationFillMode: 'forwards',
        background:
          'radial-gradient(circle at 50% 38%, color-mix(in srgb, #8b5cf6 6%, var(--c-bg)), var(--c-bg) 72%)',
      }}
    >
      <img
        src="/sloth.png"
        alt="Context Bar"
        className="splash-float w-32 h-32 object-contain dark:hidden"
        draggable={false}
      />
      <img
        src="/sloth-dark.png"
        alt="Context Bar"
        className="splash-float w-32 h-32 object-contain hidden dark:block"
        draggable={false}
      />

      <div className="flex flex-col items-center gap-2 text-center w-full">
        <p className="text-[22px] font-bold text-[var(--c-text)] tracking-[-0.02em]">
          Context Bar
        </p>
        {showTips && (
          <div className="flex flex-col items-center justify-center gap-2">
            <span className="text-[13px] text-[var(--c-text-3)] mb-1">
              first launch of the day — a note from the sloth
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
        )}
      </div>

      {/* fixed-height action zone */}
      <div className="flex items-center justify-center" style={{ minHeight: '44px' }}>
        {showContinue ? (
          <button
            onClick={dismiss}
            className="text-[12px] font-medium text-[var(--c-text-2)] hover:text-[var(--c-text)] border border-[var(--c-border)] hover:border-[var(--c-text-3)] rounded-md px-4 py-1.5 transition-colors"
          >
            Continue →
          </button>
        ) : !backendReady ? (
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-violet-400/60 animate-pulse"
                style={{ animationDelay: `${i * 180}ms` }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
