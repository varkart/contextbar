import { useState, useEffect } from 'react';

interface FooterProps {
  lastUpdated: Date | null;
  onRefresh: () => void;
  loading: boolean;
}

function formatAgo(date: Date | null): string {
  if (!date) return 'Never';
  const diffMs = Date.now() - date.getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `Updated ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `Updated ${minutes}m ago`;
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`}
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
    <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800 flex-shrink-0">
      <span className="text-xs text-zinc-500">{formatAgo(lastUpdated)}</span>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="text-zinc-400 hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors p-1 rounded"
        aria-label="Refresh"
      >
        <RefreshIcon spinning={loading} />
      </button>
    </div>
  );
}
