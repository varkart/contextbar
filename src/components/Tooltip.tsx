import { useState, useRef, useEffect, type ReactNode } from 'react';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
}

export default function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [above, setAbove] = useState(true);

  useEffect(() => {
    if (visible && containerRef.current && tooltipRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const tooltipHeight = tooltipRef.current.offsetHeight;
      setAbove(rect.top > tooltipHeight + 8);
    }
  }, [visible]);

  return (
    <div
      ref={containerRef}
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          ref={tooltipRef}
          className={`absolute left-0 z-50 max-w-[260px] bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200 pointer-events-none shadow-lg ${
            above ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
          role="tooltip"
        >
          {content}
        </div>
      )}
    </div>
  );
}
