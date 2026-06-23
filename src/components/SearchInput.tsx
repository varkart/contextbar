interface Props {
  value: string
  onChange: (value: string) => void
  placeholder: string
  accentColor?: 'indigo' | 'violet'
}

export default function SearchInput({ value, onChange, placeholder, accentColor = 'indigo' }: Props) {
  const focusBorder = accentColor === 'violet' ? 'focus:border-violet-500/50' : 'focus:border-indigo-500/50'

  return (
    <div className="relative">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--c-text-3)]"
      >
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-md pl-8 pr-3 py-1.5 text-[13px] text-[var(--c-text)] placeholder:text-[var(--c-text-3)] focus:outline-none ${focusBorder}`}
      />
    </div>
  )
}
