interface ToggleProps {
  active: boolean;
  toggling: boolean;
  onChange: (v: boolean) => void;
  activeColor: string;
  entityLabel: string;
}

export default function Toggle({ active, toggling, onChange, activeColor, entityLabel }: ToggleProps) {
  return (
    <button
      onClick={e => { e.stopPropagation(); if (!toggling) onChange(!active); }}
      disabled={toggling}
      aria-label={active ? `Disable ${entityLabel}` : `Enable ${entityLabel}`}
      className={`relative flex-shrink-0 w-7 h-4 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-40 ${
        active ? activeColor : 'bg-[var(--c-border)]'
      }`}
    >
      <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform duration-200 ${
        active ? 'translate-x-3' : 'translate-x-0'
      }`} />
    </button>
  );
}
