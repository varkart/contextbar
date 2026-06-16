interface HeaderProps {
  onSettingsClick: () => void
  onNotificationsClick: () => void
  updateAvailable?: boolean
  notificationCount?: number
}

function GearIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="w-3.5 h-3.5">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="w-3.5 h-3.5">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

export default function Header({ onSettingsClick, onNotificationsClick, updateAvailable, notificationCount }: HeaderProps) {
  const hasNotifications = (notificationCount ?? 0) > 0
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--c-border)] flex-shrink-0">
      <span className="text-[15px] font-semibold text-[var(--c-text)] tracking-[-0.01em]">
        LLM Manager
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={onNotificationsClick}
          title="Notifications — alerts about missing MCP binaries or config issues"
          className="relative text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors p-0.5 rounded"
          aria-label={hasNotifications ? `${notificationCount} notifications` : 'Notifications'}
        >
          <BellIcon />
          {hasNotifications && (
            <span className="absolute -top-0.5 -right-0.5 w-[6px] h-[6px] rounded-full bg-amber-400" aria-hidden="true" />
          )}
        </button>
        <button
          onClick={onSettingsClick}
          className="relative text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors p-0.5 -mr-0.5 rounded"
          aria-label={updateAvailable ? 'Open settings — update available' : 'Open settings'}
        >
          <GearIcon />
          {updateAvailable && (
            <span className="absolute -top-0.5 -right-0.5 w-[6px] h-[6px] rounded-full bg-indigo-400" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  )
}
