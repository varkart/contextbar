import { useState, useRef, useEffect, type ReactNode, type CSSProperties } from 'react';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
}

export default function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      // 180px: header(36) + search(44) + tool header(40) + section label(24) + ~2 rows
      const showAbove = rect.top > 180;
      setTooltipStyle({
        position: 'fixed',
        left: Math.max(8, rect.left + 8),
        ...(showAbove
          ? { bottom: window.innerHeight - rect.top + 6 }
          : { top: rect.bottom + 6 }
        ),
      });
    }
  }, [visible]);

  return (
    <div
      ref={containerRef}
      className="relative inline-flex w-full"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          style={tooltipStyle}
          className="z-50 max-w-[260px] min-w-[160px] bg-[var(--c-surface)] border border-[var(--c-border)] rounded-md px-2.5 py-2 text-[11px] text-[var(--c-text)] pointer-events-none shadow-xl shadow-black/20 animate-tooltip-in"
        >
          {content}
        </div>
      )}
    </div>
  );
}
