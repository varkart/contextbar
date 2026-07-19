import { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Notification } from '../types';

interface NotificationsPanelProps {
  notifications: Notification[];
  onBack: () => void;
  onChanged: () => void;
}

const LEVEL_COLORS: Record<string, string> = {
  error: 'bg-red-500/15 text-red-400',
  warn: 'bg-amber-500/15 text-amber-400',
  info: 'bg-blue-500/15 text-blue-400',
};

type LevelFilter = 'all' | 'error' | 'warn' | 'info';

const FILTERS: { key: LevelFilter; label: string; active: string }[] = [
  { key: 'all', label: 'All', active: 'bg-[var(--c-text)] text-[var(--c-bg)] border-transparent' },
  { key: 'error', label: 'Errors', active: 'bg-red-500/15 text-red-400 border-red-500/30' },
  { key: 'warn', label: 'Warnings', active: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  { key: 'info', label: 'Info', active: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
];

function dayLabel(tsMs: number): string {
  const now = new Date();
  const d = new Date(tsMs);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This week';
  return 'Earlier';
}

function timeLabel(tsMs: number): string {
  return new Date(tsMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function NotificationsPanel({ notifications, onChanged }: NotificationsPanelProps) {
  const [filter, setFilter] = useState<LevelFilter>('all');

  const dismiss = async (id: number) => {
    await invoke('dismiss_notification', { id });
    onChanged();
  };

  const dismissAll = async () => {
    await invoke('dismiss_all_notifications');
    onChanged();
  };

  const counts = useMemo(() => {
    const c: Record<LevelFilter, number> = { all: notifications.length, error: 0, warn: 0, info: 0 };
    for (const n of notifications) c[n.level] = (c[n.level] ?? 0) + 1;
    return c;
  }, [notifications]);

  const groups = useMemo(() => {
    const filtered = filter === 'all' ? notifications : notifications.filter(n => n.level === filter);
    const sorted = [...filtered].sort((a, b) => b.tsMs - a.tsMs);
    const out: { label: string; items: Notification[] }[] = [];
    for (const n of sorted) {
      const label = dayLabel(n.tsMs);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(n);
      else out.push({ label, items: [n] });
    }
    return out;
  }, [notifications, filter]);

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--c-border)] flex-shrink-0">
        {FILTERS.map(f => {
          const isActive = filter === f.key;
          const count = counts[f.key];
          if (f.key !== 'all' && count === 0) return null;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                isActive
                  ? f.active
                  : 'border-[var(--c-border-sub)] bg-[var(--c-surface)] text-[var(--c-text-2)] hover:text-[var(--c-text)]'
              }`}
            >
              {f.label} {count}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          {import.meta.env.DEV && (
            <button
              onClick={async () => { await invoke('debug_add_notification'); onChanged(); }}
              className="text-[11px] text-[var(--c-text-3)]/50 hover:text-[var(--c-text-3)] transition-colors border border-dashed border-[var(--c-border)] rounded px-1.5 py-0.5"
              title="Dev only: add a test notification"
            >
              + test
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={dismissAll}
              className="text-[12px] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              className="w-8 h-8 text-[var(--c-text-3)]/40">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <p className="text-[14px] text-[var(--c-text-3)]">
              {notifications.length === 0 ? 'No notifications' : 'Nothing matches this filter'}
            </p>
          </div>
        ) : (
          <div className="p-2 pb-3">
            {groups.map(group => (
              <div key={group.label}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--c-text-3)] px-1.5 pt-2 pb-1.5">
                  {group.label}
                </p>
                <div className="space-y-1.5">
                  {group.items.map(n => (
                    <div
                      key={n.id}
                      className="group flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-[var(--c-surface)] border border-[var(--c-border-sub)]"
                    >
                      <span className={`mt-0.5 shrink-0 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${LEVEL_COLORS[n.level] ?? LEVEL_COLORS.info}`}>
                        {n.level}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <p className="text-[13px] font-medium text-[var(--c-text)] leading-snug flex-1 min-w-0">{n.title}</p>
                          <span className="text-[10px] text-[var(--c-text-3)] tabular-nums shrink-0">{timeLabel(n.tsMs)}</span>
                        </div>
                        {n.body && (
                          <p className="text-[12px] text-[var(--c-text-2)] mt-0.5 leading-relaxed">{n.body}</p>
                        )}
                      </div>
                      <button
                        onClick={() => dismiss(n.id)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--c-text-3)]/50 hover:text-[var(--c-text-2)] transition-all mt-0.5"
                        aria-label="Dismiss"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
