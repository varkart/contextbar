import { useState, useRef, useEffect, type ReactNode } from 'react';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
}

export default function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [above, setAbove] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible && containerRef.current && tooltipRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setAbove(rect.top > 80);
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
          ref={tooltipRef}
          role="tooltip"
          className={`
            absolute left-2 z-50 max-w-[260px] min-w-[160px]
            bg-zinc-900 border border-zinc-700/80
            rounded-md px-2.5 py-2
            text-[11px] text-zinc-300
            pointer-events-none
            shadow-xl shadow-black/40
            animate-tooltip-in
            ${above ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}
          `}
        >
          {content}
        </div>
      )}
    </div>
  );
}
