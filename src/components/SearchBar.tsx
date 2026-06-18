import type React from 'react'

interface SearchBarProps {
  value: string
  onChange: (v: string) => void
  inputRef?: React.RefObject<HTMLInputElement | null>
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

export default function SearchBar({ value, onChange, inputRef, onKeyDown }: SearchBarProps) {
  return (
    <div className="px-3 py-2 border-b border-[var(--c-border)] flex-shrink-0">
      <div className="relative flex items-center">
        <svg className="absolute left-2 w-3 h-3 text-[var(--c-text-3)] pointer-events-none"
          xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search tools, skills, MCPs…"
          className="w-full bg-[var(--c-input)] border border-[var(--c-border)] rounded-md pl-7 pr-7 py-1.5 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none focus:border-[var(--c-text-2)] transition-colors"
          autoComplete="off"
          spellCheck={false}
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="absolute right-2 text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
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
