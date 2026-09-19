import { useSyncExternalStore } from 'react';

// Optional user override for AGENT_COLORS' hex values (agentColors.ts still
// owns labels and the Tailwind bg/text badge classes — this only reskins the
// "true color" used by charts, dots, and anything else keyed off `.hex`).
// Persisted so it survives restarts; a module-level listener set plus a
// `storage` event listener keep every open window in sync when it changes.

const AGENT_IDS = [
  'claude', 'cursor', 'gemini', 'codex', 'copilot', 'windsurf', 'kiro', 'agy', 'opencode',
] as const;

export interface AgentPalette {
  name: string;
  /** One hex per AGENT_IDS, same order. */
  colors: string[];
}

export const PALETTES: AgentPalette[] = [
  { name: 'Default', colors: ['#f97316', '#0ea5e9', '#3b82f6', '#10b981', '#71717a', '#14b8a6', '#f59e0b', '#8b5cf6', '#84cc16'] },
  { name: 'Vibrant rainbow', colors: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#84cc16'] },
  { name: 'Pastel', colors: ['#fca5a5', '#fdba74', '#fde047', '#86efac', '#a5f3fc', '#93c5fd', '#c4b5fd', '#f9a8d4', '#bef264'] },
  { name: 'Ocean', colors: ['#0ea5e9', '#06b6d4', '#14b8a6', '#0891b2', '#0284c7', '#22d3ee', '#2563eb', '#67e8f9', '#0369a1'] },
  { name: 'Sunset', colors: ['#f97316', '#fb7185', '#c084fc', '#f59e0b', '#e879f9', '#fbbf24', '#f472b6', '#fb923c', '#facc15'] },
  { name: 'Forest', colors: ['#166534', '#65a30d', '#84cc16', '#a16207', '#4d7c0f', '#15803d', '#ca8a04', '#3f6212', '#059669'] },
  { name: 'Neon / cyberpunk', colors: ['#f0abfc', '#22d3ee', '#a3e635', '#facc15', '#f472b6', '#818cf8', '#2dd4bf', '#e879f9', '#fb7185'] },
  { name: 'Monochrome blue', colors: ['#1e3a8a', '#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd', '#2563eb', '#1e40af', '#bfdbfe', '#3730a3'] },
  { name: 'Earth tones', colors: ['#b45309', '#78716c', '#a8a29e', '#c2410c', '#57534e', '#92400e', '#a16207', '#78350f', '#6b7280'] },
  { name: 'Material accents', colors: ['#e91e63', '#3f51b5', '#009688', '#ff9800', '#673ab7', '#00bcd4', '#8bc34a', '#f44336', '#607d8b'] },
];

const STORAGE_KEY = 'agent_color_palette_v1';
const listeners = new Set<() => void>();

function readStoredIndex(): number {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n >= 0 && n < PALETTES.length ? n : 0;
}

let index = readStoredIndex();

if (typeof window !== 'undefined') {
  // A different window (tray popover vs. expanded) changed the preference —
  // pick it up here too instead of staying on the stale palette.
  window.addEventListener('storage', e => {
    if (e.key === STORAGE_KEY) {
      index = readStoredIndex();
      listeners.forEach(l => l());
    }
  });
}

export function getPaletteIndex(): number {
  return index;
}

export function setPaletteIndex(i: number): void {
  if (i < 0 || i >= PALETTES.length) return;
  index = i;
  localStorage.setItem(STORAGE_KEY, String(i));
  listeners.forEach(l => l());
}

export function subscribePalette(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** This agent's hex under the active palette, or undefined for an agent id
 *  the palette table doesn't know about (agentColor() falls back to its own
 *  default/hash-based color in that case). */
export function paletteHexFor(agentId: string): string | undefined {
  const i = AGENT_IDS.indexOf(agentId as (typeof AGENT_IDS)[number]);
  return i === -1 ? undefined : PALETTES[index].colors[i];
}

/** Re-renders the calling component when the active palette changes —
 *  agentColor() itself doesn't need to be reactive, but callers holding onto
 *  its result (colors already baked into a chart's render) do. */
export function usePaletteIndex(): number {
  return useSyncExternalStore(subscribePalette, getPaletteIndex);
}
