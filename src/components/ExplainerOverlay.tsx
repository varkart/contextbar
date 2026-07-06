interface ExplainerOverlayProps {
  topic: 'skills' | 'mcps';
  onClose: () => void;
}

const CONTENT = {
  skills: {
    accent: 'text-indigo-400',
    accentBg: 'bg-indigo-500/10',
    accentBorder: 'border-indigo-500/20',
    title: 'Skills',
    tagline: 'Standing instructions for your AI agent',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
    ),
    cards: [
      {
        heading: 'What they are',
        body: 'Markdown files your agent reads before every task — persona, rules, project context, repeatable workflows. Think of them as a handbook the agent always consults.',
      },
      {
        heading: 'How they work',
        body: 'Drop a .md file (or a folder with SKILL.md) into the agent\'s skills directory. The agent picks it up automatically on next run. No restart needed.',
      },
      {
        heading: 'Toggle without deleting',
        body: 'Disable a skill here to move it out of the active directory. Re-enable it later without losing content. Each agent manages its own set independently.',
      },
    ],
  },
  mcps: {
    accent: 'text-violet-400',
    accentBg: 'bg-violet-500/10',
    accentBorder: 'border-violet-500/20',
    title: 'MCP Servers',
    tagline: 'Tools agents can call mid-task',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <path d="M8 21h8M12 17v4"/>
      </svg>
    ),
    cards: [
      {
        heading: 'What they are',
        body: 'Plugins that extend what your agent can do at runtime — read files, query databases, call APIs, browse the web, run shell commands.',
      },
      {
        heading: 'How they work',
        body: 'Each server is a process your agent talks to over the open Model Context Protocol (MCP) standard. The agent discovers available tools at startup and calls them as needed.',
      },
      {
        heading: 'Toggle without removing',
        body: 'Disable a server here to stop the agent from loading it, without deleting the config. The server stays in your config, ready to re-enable.',
      },
    ],
  },
};

export default function ExplainerOverlay({ topic, onClose }: ExplainerOverlayProps) {
  const c = CONTENT[topic];

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-[var(--c-bg)] animate-slide-in-right">
      {/* header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-[var(--c-border)] flex-shrink-0">
        <div className={`w-7 h-7 rounded-[7px] flex items-center justify-center flex-shrink-0 ${c.accentBg}`}>
          {c.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[14px] font-semibold leading-none ${c.accent}`}>{c.title}</p>
          <p className="text-[11px] text-[var(--c-text-3)] mt-0.5">{c.tagline}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-1 rounded text-[var(--c-text-3)] hover:text-[var(--c-text)] hover:bg-[var(--c-hover)] transition-colors flex-shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* cards */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {c.cards.map((card, i) => (
          <div
            key={i}
            className={`rounded-[10px] border ${c.accentBorder} bg-[var(--c-surface)] px-3.5 py-3`}
          >
            <p className={`text-[12px] font-semibold mb-1.5 ${c.accent}`}>{card.heading}</p>
            <p className="text-[12px] text-[var(--c-text-2)] leading-relaxed">{card.body}</p>
          </div>
        ))}
      </div>

      {/* footer */}
      <div className="px-3 py-3 border-t border-[var(--c-border)] flex-shrink-0">
        <button
          onClick={onClose}
          className={`w-full py-2 rounded-lg text-[14px] font-medium transition-colors ${c.accentBg} ${c.accent} hover:opacity-80`}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
