type StatusState = 'installed' | 'no-config' | 'not-installed' | 'error';

interface StatusDotProps {
  state: StatusState;
}

const stateColors: Record<StatusState, string> = {
  installed: 'bg-green-500',
  'no-config': 'bg-yellow-500',
  'not-installed': 'bg-zinc-600',
  error: 'bg-red-500',
};

export default function StatusDot({ state }: StatusDotProps) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${stateColors[state]}`}
      aria-label={state}
    />
  );
}
