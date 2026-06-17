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

export default function NotificationsPanel({ notifications, onBack, onChanged }: NotificationsPanelProps) {
  const dismiss = async (id: number) => {
    await invoke('dismiss_notification', { id });
    onChanged();
  };

  const dismissAll = async () => {
    await invoke('dismiss_all_notifications');
    onChanged();
  };

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--c-border)] flex-shrink-0">
        <button
          onClick={onBack}
          className="text-[var(--c-text-2)] hover:text-[var(--c-text)] transition-colors p-0.5 -ml-0.5 rounded"
          aria-label="Back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="w-3.5 h-3.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <span className="text-[15px] font-semibold text-[var(--c-text)] tracking-[-0.01em] flex-1">
          Notifications
        </span>

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

      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              className="w-8 h-8 text-[var(--c-text-3)]/40">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <p className="text-[14px] text-[var(--c-text-3)]">No notifications</p>
          </div>
        ) : (
          <div className="p-2 space-y-1.5">
            {notifications.map(n => (
              <div
                key={n.id}
                className="group flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-[var(--c-surface)] border border-[var(--c-border-sub)]"
              >
                <span className={`mt-0.5 shrink-0 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${LEVEL_COLORS[n.level] ?? LEVEL_COLORS.info}`}>
                  {n.level}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--c-text)] leading-snug">{n.title}</p>
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
        )}
      </div>
    </div>
  );
}
