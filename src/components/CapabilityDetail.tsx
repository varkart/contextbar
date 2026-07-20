import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import Markdown from './Markdown'
import Toggle from './Toggle'
import type { CapabilityState } from '../types'

function ChevronLeft() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className="w-3.5 h-3.5">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

/** Before/after settings-file snippets, generated from the writer spec so
 *  they are always accurate — no hand-authored config examples to drift. */
function snippets(cap: CapabilityState): { before: string; after: string; beforeLabel: string; afterLabel: string } {
  if (cap.kind === 'enum') {
    const example = cap.values.find(v => v !== cap.defaultValue) ?? cap.values[0]
    if (cap.writerKind === 'toml_key') {
      return {
        beforeLabel: `DEFAULT (${cap.defaultValue ?? 'unset'})`,
        afterLabel: 'EXPLICIT',
        before: `# "${cap.writerKey}" absent —\n# agent default applies`,
        after: `${cap.writerKey} = "${example}"`,
      }
    }
    return {
      beforeLabel: `DEFAULT (${cap.defaultValue ?? 'unset'})`,
      afterLabel: 'EXPLICIT',
      before: `{\n  ...\n  // "${cap.writerKey}" absent\n}`,
      after: `{\n  ...\n  "${cap.writerKey?.split('.').pop()}": "${example}"\n}`,
    }
  }
  if (cap.writerKind === 'toml_key') {
    const off = typeof cap.writerOffValue === 'string' ? `"${cap.writerOffValue}"` : String(cap.writerOffValue)
    return {
      beforeLabel: 'ENABLED (default)',
      afterLabel: 'DISABLED',
      before: `# "${cap.writerKey}" absent —\n# agent default (on)`,
      after: `${cap.writerKey} = ${off}`,
    }
  }
  if (cap.writerKind === 'json_flag') {
    const off = JSON.stringify(cap.writerOffValue)
    return {
      beforeLabel: 'ENABLED (default)',
      afterLabel: 'DISABLED',
      before: `{\n  ...\n  // "${cap.writerKey}" absent — agent default (on)\n}`,
      after: `{\n  ...\n  "${cap.writerKey}": ${off}\n}`,
    }
  }
  const path = cap.writerPath ?? 'permissions.deny'
  const segs = path.split('.')
  const members = cap.writerMembers.map(m => `"${m}"`).join(', ')
  const wrap = (inner: string) =>
    segs.reduceRight((acc, seg, i) => {
      const pad = '  '.repeat(i + 1)
      return `${pad}"${seg}": ${i === segs.length - 1 ? acc : `{\n${acc}\n${pad}}`}`
    }, inner)
  return {
    beforeLabel: 'ENABLED (default)',
    afterLabel: 'DISABLED',
    before: `{\n${wrap('[ ... ]')}\n}`,
    after: `{\n${wrap(`[ ..., ${members} ]`)}\n}`,
  }
}

function fallbackExpectation(cap: CapabilityState): string {
  if (cap.kind === 'enum') {
    return `Selecting a value writes it to the config; selecting **${cap.defaultValue ?? 'the default'}** removes the key so the agent's own default applies. Options: ${cap.values.map(v => `\`${v}\``).join(', ')}.`
  }
  if (cap.writerKind === 'json_list_member') {
    return `Denying ${cap.writerMembers.map(m => `\`${m}\``).join(' and ')} removes the tool definition${cap.writerMembers.length > 1 ? 's' : ''} from Claude's context entirely in new sessions — Claude never sees ${cap.writerMembers.length > 1 ? 'them' : 'it'}. Re-enabling removes the deny entr${cap.writerMembers.length > 1 ? 'ies' : 'y'} and restores the default.`
  }
  const off = JSON.stringify(cap.writerOffValue)
  const assign = cap.writerKind === 'toml_key' ? `${cap.writerKey} = ${off}` : `"${cap.writerKey}": ${off}`
  return `Turning this off writes \`${assign}\` to the config file; turning it on removes the key, restoring the agent's default behavior.`
}

interface CapabilityDetailProps {
  cap: CapabilityState
  toggling: boolean
  /** Agent-specific reference docs; link hidden when absent. */
  docs?: { url: string; label: string }
  onToggle: (enabled: boolean) => void
  onSetValue?: (value: string) => void
  onClose: () => void
}

export default function CapabilityDetail({ cap, toggling, docs, onToggle, onSetValue, onClose }: CapabilityDetailProps) {
  // Close on Escape before the app-level escape handler fires.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onClose])

  const { before, after, beforeLabel, afterLabel } = snippets(cap)

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-[var(--c-bg)] animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--c-border)] flex-shrink-0">
        <button
          onClick={onClose}
          className="text-[var(--c-text-2)] hover:text-[var(--c-text)] transition-colors p-0.5 -ml-0.5 rounded"
          aria-label="Back"
        >
          <ChevronLeft />
        </button>
        <span className="text-[14px] font-semibold text-[var(--c-text)] tracking-[-0.01em] flex-1 truncate">
          {cap.label}
        </span>
        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--c-surface)] text-[var(--c-text-3)] border border-[var(--c-border-sub)]">
          {cap.category}
        </span>
        {cap.tokensHint != null && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded tabular-nums ${cap.enabled ? 'bg-[var(--c-surface)] text-[var(--c-text-3)]' : 'bg-emerald-500/10 text-emerald-400'}`}>
            ~{cap.tokensHint} tok
          </span>
        )}
        {cap.kind === 'enum' && onSetValue ? (
          <select
            value={cap.value ?? cap.defaultValue ?? ''}
            disabled={toggling}
            onChange={e => onSetValue(e.target.value)}
            className="text-[11px] rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-2)] px-1.5 py-1 focus:outline-none disabled:opacity-40"
            aria-label={`${cap.label} value`}
          >
            {cap.values.map(v => (
              <option key={v} value={v}>
                {v}{v === cap.defaultValue ? ' (default)' : ''}
              </option>
            ))}
          </select>
        ) : (
          <Toggle
            active={cap.enabled}
            toggling={toggling}
            onChange={onToggle}
            activeColor="bg-emerald-500"
            entityLabel={cap.label}
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* What it does */}
        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--c-text-3)] mb-1.5">
            What it does
          </h3>
          <p className="text-[12.5px] text-[var(--c-text-2)] leading-relaxed">
            {cap.help ?? cap.description ?? cap.label}
          </p>
        </section>

        {/* What changes in the config */}
        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--c-text-3)] mb-1.5">
            What changes in <span className="font-mono normal-case">{cap.writerFile}</span>
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[9.5px] text-emerald-400 mb-1">{beforeLabel}</p>
              <pre className="text-[10px] font-mono bg-[var(--c-surface)] border border-[var(--c-border-sub)] rounded-lg p-2 overflow-x-auto leading-relaxed text-[var(--c-text-2)] whitespace-pre">{before}</pre>
            </div>
            <div>
              <p className="text-[9.5px] text-[var(--c-text-3)] mb-1">{afterLabel}</p>
              <pre className="text-[10px] font-mono bg-[var(--c-surface)] border border-[var(--c-border-sub)] rounded-lg p-2 overflow-x-auto leading-relaxed text-[var(--c-text-2)] whitespace-pre">{after}</pre>
            </div>
          </div>
          <p className="text-[10px] text-[var(--c-text-3)] mt-1.5">
            Only this {cap.writerKind === 'json_flag' ? 'key' : 'list entry'} is written — everything else in the file is untouched, and a backup is taken before every change.
          </p>
        </section>

        {/* What to expect */}
        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--c-text-3)] mb-1.5">
            What to expect
          </h3>
          <Markdown>{cap.example ?? fallbackExpectation(cap)}</Markdown>
        </section>

        {/* Verify */}
        <section className="rounded-lg border border-sky-500/25 bg-sky-500/5 px-3 py-2.5">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-sky-400 mb-1.5">
            Verify
          </h3>
          <ol className="text-[11.5px] text-[var(--c-text-2)] leading-relaxed list-decimal list-inside space-y-0.5">
            <li>Applies to <b>new sessions only</b> — restart running sessions to pick it up.</li>
            <li>Start a fresh session and run <span className="font-mono">/context</span>.</li>
            <li>
              {cap.writerKind === 'json_list_member'
                ? 'The denied tool(s) are gone from the tool list and the token total drops.'
                : 'The related context block is gone and the token total drops.'}
            </li>
          </ol>
        </section>

        {docs && (
          <button
            onClick={() => invoke('open_url', { url: docs.url }).catch(() => {})}
            className="text-[11px] text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors"
          >
            Official {docs.label.toLowerCase()} ↗
          </button>
        )}
      </div>
    </div>
  )
}
