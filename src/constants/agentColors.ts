export const AGENT_COLORS: Record<string, { bg: string; text: string }> = {
  claude:   { bg: 'bg-orange-500/10',   text: 'text-orange-500'  },
  cursor:   { bg: 'bg-sky-500/10',      text: 'text-sky-500'     },
  gemini:   { bg: 'bg-blue-500/10',     text: 'text-blue-500'    },
  codex:    { bg: 'bg-emerald-500/10',  text: 'text-emerald-500' },
  copilot:  { bg: 'bg-zinc-500/15',     text: 'text-zinc-500'    },
  windsurf: { bg: 'bg-teal-500/10',     text: 'text-teal-500'    },
  kiro:     { bg: 'bg-amber-500/10',    text: 'text-amber-500'   },
  agy:      { bg: 'bg-violet-500/10',   text: 'text-violet-500'  },
};

const FALLBACK_PALETTES: { bg: string; text: string }[] = [
  { bg: 'bg-pink-500/10',    text: 'text-pink-500'    },
  { bg: 'bg-cyan-500/10',    text: 'text-cyan-500'    },
  { bg: 'bg-lime-500/10',    text: 'text-lime-500'    },
  { bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-500' },
  { bg: 'bg-rose-500/10',    text: 'text-rose-500'    },
  { bg: 'bg-indigo-500/10',  text: 'text-indigo-500'  },
];

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function agentColor(id: string): { bg: string; text: string } {
  return AGENT_COLORS[id] ?? FALLBACK_PALETTES[hashId(id) % FALLBACK_PALETTES.length];
}
