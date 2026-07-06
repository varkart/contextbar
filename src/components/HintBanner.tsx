import { useEffect, useState } from 'react';

interface HintBannerProps {
  onDismiss: () => void;
  onDontShowAgain: () => void;
}

export default function HintBanner({ onDismiss, onDontShowAgain }: HintBannerProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className="mx-3 mb-2.5 rounded-[10px] border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2.5 transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div className="flex items-start gap-2.5">
        <div className="w-6 h-6 rounded-[6px] bg-indigo-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-[var(--c-text)] mb-0.5">Tip: tap ? next to Skills or MCPs</p>
          <p className="text-[11px] text-[var(--c-text-3)] leading-relaxed">
            Open any agent to see what each section does.
          </p>
        </div>
        <button
          onClick={() => { setVisible(false); setTimeout(onDismiss, 300); }}
          aria-label="Close tip"
          className="text-[var(--c-text-3)] hover:text-[var(--c-text)] transition-colors flex-shrink-0 mt-0.5"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div className="flex gap-2 mt-2 pl-[34px]">
        <button
          onClick={() => { setVisible(false); setTimeout(onDismiss, 300); }}
          className="text-[11px] text-indigo-400 font-medium hover:text-indigo-300 transition-colors"
        >
          Got it
        </button>
        <span className="text-[11px] text-[var(--c-border)]">·</span>
        <button
          onClick={onDontShowAgain}
          className="text-[11px] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
        >
          Don't show again
        </button>
      </div>
    </div>
  );
}
