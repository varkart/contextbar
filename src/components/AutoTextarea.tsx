import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react'

/** Grows with its content up to `maxRows`. Enter submits, Shift+Enter adds a line. */
export default function AutoTextarea({ value, onSubmit, maxRows = 6, onKeyDown, ...rest }: {
  value: string
  onSubmit: () => void
  maxRows?: number
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const cs = getComputedStyle(el)
    const px = (v: string) => parseFloat(v) || 0
    const border = px(cs.borderTopWidth) + px(cs.borderBottomWidth)
    const max = (px(cs.lineHeight) || 18) * maxRows + px(cs.paddingTop) + px(cs.paddingBottom)
    el.style.height = `${Math.min(el.scrollHeight, max) + border}px`
  }, [value, maxRows])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onKeyDown={e => {
        onKeyDown?.(e)
        if (e.defaultPrevented) return
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault()
          onSubmit()
        }
      }}
      {...rest}
      style={{ resize: 'none', ...rest.style }}
    />
  )
}
