interface SearchBarProps {
  value: string
  onChange: (v: string) => void
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="px-3 py-2 border-b border-zinc-800/80 flex-shrink-0">
      <div className="relative flex items-center">
        <svg className="absolute left-2 w-3 h-3 text-zinc-600 pointer-events-none"
          xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Search tools, skills, MCPs…"
          className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-md pl-7 pr-7 py-1.5 text-[12px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600 focus:bg-zinc-800 transition-colors"
          autoComplete="off"
          spellCheck={false}
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="absolute right-2 text-zinc-600 hover:text-zinc-400 transition-colors"
            aria-label="Clear search"
          >
            <svg className="w-3 h-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
