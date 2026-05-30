type StatusState = 'installed' | 'no-config' | 'not-installed' | 'error';

interface StatusDotProps {
  state: StatusState;
}

const stateConfig: Record<StatusState, { color: string; label: string }> = {
  installed:       { color: 'bg-indigo-400',    label: 'installed' },
  'no-config':     { color: 'bg-amber-400/70',  label: 'no config found' },
  'not-installed': { color: 'bg-zinc-700',       label: 'not installed' },
  error:           { color: 'bg-red-400',        label: 'error' },
};

export default function StatusDot({ state }: StatusDotProps) {
  const { color, label } = stateConfig[state];
  return (
    <span
      className={`inline-block w-[7px] h-[7px] rounded-full flex-shrink-0 ${color}`}
      aria-label={label}
      role="img"
    />
  );
}
