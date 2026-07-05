interface WelcomeSheetProps {
  onDismiss: () => void
}

export default function WelcomeSheet({ onDismiss }: WelcomeSheetProps) {
  return (
    <div className="absolute inset-0 bg-black/50 flex items-end z-50">
      <div className="w-full bg-[var(--c-surface)] border-t border-[var(--c-border)] rounded-t-[14px] px-5 pt-5 pb-7 animate-slide-up">
        <div className="w-8 h-1 rounded-full bg-[var(--c-border)] mx-auto mb-5" />

        <p className="text-[16px] font-bold text-[var(--c-text)] tracking-[-0.02em] mb-1">
          Welcome to Context Bar
        </p>
        <p className="text-[12px] text-[var(--c-text-2)] leading-relaxed mb-4">
          Manage two things across all your AI agents in one place:
        </p>

        <div className="flex flex-col gap-2 mb-5">
          <div className="flex gap-3 items-start px-3 py-2.5 rounded-[9px] border border-[var(--c-border)] bg-[var(--c-surface-2)]">
            <div className="w-7 h-7 rounded-[7px] bg-indigo-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-[var(--c-text)] mb-0.5">Skills</p>
              <p className="text-[11px] text-[var(--c-text-2)] leading-relaxed">
                Markdown instruction files your agent reads automatically — rules, personas, project context.
              </p>
            </div>
          </div>

          <div className="flex gap-3 items-start px-3 py-2.5 rounded-[9px] border border-[var(--c-border)] bg-[var(--c-surface-2)]">
            <div className="w-7 h-7 rounded-[7px] bg-violet-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <path d="M8 21h8M12 17v4"/>
              </svg>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-[var(--c-text)] mb-0.5">MCP Servers</p>
              <p className="text-[11px] text-[var(--c-text-2)] leading-relaxed">
                Plugins that give your agent access to tools — databases, APIs, file systems — via a standard protocol.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={onDismiss}
            className="text-[12px] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
          >
            Skip
          </button>
          <button
            onClick={onDismiss}
            className="text-[12px] font-semibold bg-indigo-500 text-white rounded-[7px] px-4 py-1.5 hover:bg-indigo-600 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
