import { invoke } from '@tauri-apps/api/core'

/**
 * "Source" reference shown at the bottom of skill/MCP detail pages — where
 * the item's content was resolved from (install URL, npm registry lookup,
 * etc.), not necessarily the same as its on-disk path.
 */
export default function SourceLink({ url, accent }: { url: string; accent: 'indigo' | 'violet' }) {
  const color = accent === 'indigo'
    ? 'text-indigo-400 hover:text-indigo-300'
    : 'text-violet-400 hover:text-violet-300'

  return (
    <div>
      <p className="text-[10px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-0.5">
        Source
      </p>
      <button
        onClick={() => invoke('open_url', { url }).catch(() => {})}
        className={`flex items-center gap-1.5 text-[12px] transition-colors ${color}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="w-3 h-3 flex-shrink-0">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
        <span className="truncate">{url}</span>
      </button>
    </div>
  )
}
