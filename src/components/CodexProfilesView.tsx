import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { CodexProfiles } from '../types'

const ACCESS_CHIP: Record<string, string> = {
  read: 'bg-sky-500/10 text-sky-400 border-sky-500/25',
  write: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  deny: 'bg-red-500/10 text-red-400 border-red-500/25',
}

const ACTION_CHIP: Record<string, string> = {
  allow: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  deny: 'bg-red-500/10 text-red-400 border-red-500/25',
}

/** Read-only rendering of Codex's [permissions.<name>] profiles. */
export default function CodexProfilesView() {
  const [data, setData] = useState<CodexProfiles | null>(null)

  useEffect(() => {
    invoke<CodexProfiles>('get_codex_profiles').then(setData).catch(() => {})
  }, [])

  if (!data) return null

  return (
    <div className="mb-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--c-text-3)] mb-1.5">
        Permission profiles
      </p>

      {data.mixedConfig && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-2.5 py-2 mb-2">
          <p className="text-[11px] text-red-400 leading-relaxed">
            <b>Conflicting config:</b> config.toml sets both legacy sandbox keys and permission
            profiles — Codex forbids combining them. Keep only one system (see Doctor).
          </p>
        </div>
      )}

      {data.profiles.length === 0 ? (
        <p className="text-[11px] text-[var(--c-text-3)]">
          No custom profiles defined. Built-in profiles (<span className="font-mono">:read-only</span>,{' '}
          <span className="font-mono">:workspace</span>,{' '}
          <span className="font-mono">:danger-full-access</span>) are available in the
          Permission profile picker above; custom ones are defined under{' '}
          <span className="font-mono">[permissions.&lt;name&gt;]</span> in config.toml.
        </p>
      ) : (
        <div className="space-y-2">
          {data.profiles.map(p => (
            <div key={p.name} className="rounded-lg border border-[var(--c-border-sub)] px-2.5 py-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[12px] font-mono font-semibold text-[var(--c-text)]">{p.name}</span>
                {data.defaultProfile === p.name && (
                  <span className="text-[9px] px-1.5 py-px rounded-full bg-[var(--c-accent,#8b5cf6)]/15 text-[var(--c-accent,#8b5cf6)]">active</span>
                )}
                {p.extends && (
                  <span className="text-[9px] font-mono px-1.5 py-px rounded-full border border-[var(--c-border-sub)] bg-[var(--c-surface)] text-[var(--c-text-3)]">
                    extends {p.extends}
                  </span>
                )}
                <span className={`text-[9px] px-1.5 py-px rounded-full border ml-auto ${p.networkEnabled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-[var(--c-surface)] text-[var(--c-text-3)] border-[var(--c-border-sub)]'}`}>
                  network {p.networkEnabled ? 'on' : 'off'}
                </span>
              </div>
              {p.description && (
                <p className="text-[10.5px] text-[var(--c-text-3)] mt-1">{p.description}</p>
              )}
              {p.workspaceRoots.length > 0 && (
                <p className="text-[10px] font-mono text-[var(--c-text-2)] mt-1.5 break-all">
                  ⌂ {p.workspaceRoots.join('  ·  ')}
                </p>
              )}
              {p.filesystem.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {p.filesystem.map(r => (
                    <div key={r.path} className="flex items-center gap-2 min-w-0">
                      <span className="text-[10.5px] font-mono text-[var(--c-text-2)] truncate flex-1">{r.path}</span>
                      <span className={`text-[9px] px-1.5 py-px rounded-full border flex-shrink-0 ${ACCESS_CHIP[r.access] ?? 'bg-[var(--c-surface)] text-[var(--c-text-3)] border-[var(--c-border-sub)]'}`}>
                        {r.access}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {p.domains.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {p.domains.map(d => (
                    <span key={d.pattern} className={`text-[9.5px] font-mono px-1.5 py-px rounded-full border ${ACTION_CHIP[d.action] ?? ''}`}>
                      {d.pattern}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
