import { useState, useEffect } from 'react';

interface FooterProps {
  lastUpdated: Date | null;
  onRefresh: () => void;
  loading: boolean;
}

function formatAgo(date: Date | null): string {
  if (!date) return 'Never synced';
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 5) return 'Just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-3 h-3 ${spinning ? 'animate-spin' : ''}`}
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

export default function Footer({ lastUpdated, onRefresh, loading }: FooterProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800/80 flex-shrink-0">
      <span className="text-[11px] text-zinc-600 tabular-nums">
        {formatAgo(lastUpdated)}
      </span>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="text-zinc-600 hover:text-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors p-1 -mr-1 rounded"
        aria-label="Refresh tools"
      >
        <RefreshIcon spinning={loading} />
      </button>
    </div>
  );
}
