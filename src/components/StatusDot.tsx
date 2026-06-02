type StatusState = 'installed' | 'no-config' | 'not-installed' | 'error';

interface StatusDotProps {
  state: StatusState;
}

const stateConfig: Record<StatusState, { color: string; label: string }> = {
  installed:       { color: 'bg-emerald-500',  label: 'installed' },
  'no-config':     { color: 'bg-amber-400',    label: 'no config found' },
  'not-installed': { color: 'bg-zinc-600',      label: 'not installed' },
  error:           { color: 'bg-red-500',       label: 'error' },
};

export default function StatusDot({ state }: StatusDotProps) {
  const { color, label } = stateConfig[state];
  return (
    <span
      className={`inline-block w-[7px] h-[7px] rounded-full flex-shrink-0 ${color}`}
      aria-label={label}
      title={label}
      role="img"
    />
  );
}
