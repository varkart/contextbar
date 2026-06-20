import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface FooterProps {
  lastUpdated: Date | null;
  onRefresh: () => void;
  loading: boolean;
  cloudSyncing?: boolean;
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
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className={`w-3 h-3 ${spinning ? 'animate-spin' : ''}`}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function QuitIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className="w-3 h-3">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export default function Footer({ lastUpdated, onRefresh, loading, cloudSyncing }: FooterProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center justify-between px-3 border-t border-[var(--c-border)] flex-shrink-0" style={{ height: 36 }}>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="text-[var(--c-text-3)] hover:text-[var(--c-text-2)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors p-1 -ml-1 rounded"
        aria-label="Refresh tools"
        title="Refresh"
      >
        <RefreshIcon spinning={loading} />
      </button>

      <span className="text-[11px] text-[var(--c-text-3)] tabular-nums flex items-center gap-1.5 select-none">
        {formatAgo(lastUpdated)}
        {cloudSyncing && (
          <span className="text-[10px] text-[var(--c-text-3)] opacity-50 animate-pulse">cloud</span>
        )}
      </span>

      <button
        onClick={() => invoke('quit_app')}
        className="text-[var(--c-text-3)] hover:text-red-400 transition-colors p-1 -mr-1 rounded"
        aria-label="Quit app"
        title="Quit"
      >
        <QuitIcon />
      </button>
    </div>
  );
}
