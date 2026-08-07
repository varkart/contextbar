// Single source of truth for "how do we represent agent X" across the app —
// AgentDot, AgentRow, AgentChips, AgentBadge, and My Work's usage bars all
// read from here. Previously AgentBadge and My Work each kept their own
// hardcoded color table, so the same agent (e.g. claude) rendered a
// different color depending which screen you were on.
export const AGENT_COLORS: Record<string, { label: string; bg: string; text: string; hex: string }> = {
  claude:   { label: 'Claude',      bg: 'bg-orange-500/10',   text: 'text-orange-500',  hex: '#f97316' },
  cursor:   { label: 'Cursor',      bg: 'bg-sky-500/10',      text: 'text-sky-500',     hex: '#0ea5e9' },
  gemini:   { label: 'Gemini',      bg: 'bg-blue-500/10',     text: 'text-blue-500',    hex: '#3b82f6' },
  codex:    { label: 'Codex',       bg: 'bg-emerald-500/10',  text: 'text-emerald-500', hex: '#10b981' },
  copilot:  { label: 'Copilot',     bg: 'bg-zinc-500/15',     text: 'text-zinc-500',    hex: '#71717a' },
  windsurf: { label: 'Windsurf',    bg: 'bg-teal-500/10',     text: 'text-teal-500',    hex: '#14b8a6' },
  kiro:     { label: 'Kiro',        bg: 'bg-amber-500/10',    text: 'text-amber-500',   hex: '#f59e0b' },
  agy:      { label: 'Antigravity', bg: 'bg-violet-500/10',   text: 'text-violet-500',  hex: '#8b5cf6' },
  opencode: { label: 'OpenCode',    bg: 'bg-lime-500/10',     text: 'text-lime-500',    hex: '#84cc16' },
};

const FALLBACK_PALETTES: { bg: string; text: string; hex: string }[] = [
  { bg: 'bg-pink-500/10',    text: 'text-pink-500',    hex: '#ec4899' },
  { bg: 'bg-cyan-500/10',    text: 'text-cyan-500',    hex: '#06b6d4' },
  { bg: 'bg-lime-500/10',    text: 'text-lime-500',    hex: '#84cc16' },
  { bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-500', hex: '#d946ef' },
  { bg: 'bg-rose-500/10',    text: 'text-rose-500',    hex: '#f43f5e' },
  { bg: 'bg-indigo-500/10',  text: 'text-indigo-500',  hex: '#6366f1' },
];

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function agentColor(id: string): { label: string; bg: string; text: string; hex: string } {
  const known = AGENT_COLORS[id];
  if (known) return known;
  const fallback = FALLBACK_PALETTES[hashId(id) % FALLBACK_PALETTES.length];
  return { label: id.charAt(0).toUpperCase() + id.slice(1), ...fallback };
}
