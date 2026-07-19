import { useState, useEffect, useCallback, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { Agent } from '../../types'

interface BackupEntry {
  timestampMs: number
  path: string
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (mins > 0) return `${mins}m ago`
  return 'just now'
}

function shortPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, '~')
}

function baseName(p: string): string {
  return p.split('/').pop() ?? p
}

interface DiffLine {
  kind: 'ctx' | 'del' | 'add'
  text: string
}

/** Trim common prefix/suffix lines, emit the changed middle as del/add blocks. */
function simpleDiff(backup: string, current: string, maxLines = 40): DiffLine[] {
  const a = backup.split('\n')
  const b = current.split('\n')
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length, endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }

  if (start === endA && start === endB) return []

  const out: DiffLine[] = []
  if (start > 0) out.push({ kind: 'ctx', text: a[start - 1] })
  for (const line of a.slice(start, endA)) out.push({ kind: 'del', text: line })
  for (const line of b.slice(start, endB)) out.push({ kind: 'add', text: line })
  if (endA < a.length) out.push({ kind: 'ctx', text: a[endA] })
  return out.slice(0, maxLines)
}

function SnapshotRow({
  entry,
  configPath,
  restoring,
  onRestore,
}: {
  entry: BackupEntry
  configPath: string
  restoring: boolean
  onRestore: () => void
}) {
  const [diff, setDiff] = useState<DiffLine[] | null>(null)
  const [raw, setRaw] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const toggleDiff = async () => {
    if (open) { setOpen(false); return }
    setOpen(true)
    if (diff !== null || raw !== null) return
    try {
      const backupContent = await invoke<string>('read_backup_content', { backupPath: entry.path })
      try {
        const currentContent = await invoke<string>('read_config_content', { configPath })
        setDiff(simpleDiff(backupContent, currentContent))
      } catch {
        setRaw(backupContent.slice(0, 2000))
      }
    } catch (e) {
      setRaw(String(e))
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--c-hover)] transition-colors">
        <div className="flex-1 min-w-0">
          <p className="text-[12px] text-[var(--c-text-2)]">
            {new Date(entry.timestampMs).toLocaleString()}
          </p>
          <p className="text-[11px] text-[var(--c-text-3)]">{timeAgo(entry.timestampMs)}</p>
        </div>
        <button
          onClick={toggleDiff}
          className="text-[11px] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors px-1.5 py-0.5 rounded"
        >
          {open ? 'hide' : 'diff'}
        </button>
        <button
          onClick={onRestore}
          disabled={restoring}
          className="text-[11px] bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
        >
          {restoring ? 'restoring…' : 'Restore'}
        </button>
      </div>
      {open && (
        <div className="px-3 pb-2 bg-[var(--c-surface-1)]">
          {diff !== null && diff.length === 0 && (
            <p className="text-[11px] text-[var(--c-text-3)] py-1.5">Identical to current file.</p>
          )}
          {diff !== null && diff.length > 0 && (
            <div className="rounded border border-[var(--c-border-sub)] overflow-hidden">
              <div className="px-2 py-1 text-[10px] text-[var(--c-text-3)] bg-[var(--c-surface)] flex justify-between">
                <span>snapshot vs current</span>
                <span>
                  <span className="text-red-400">−{diff.filter(l => l.kind === 'del').length}</span>{' '}
                  <span className="text-emerald-400">+{diff.filter(l => l.kind === 'add').length}</span>
                </span>
              </div>
              <pre className="text-[10.5px] font-mono overflow-x-auto max-h-44 leading-relaxed">
                {diff.map((l, i) => (
                  <div
                    key={i}
                    className={`px-2 whitespace-pre-wrap break-all ${
                      l.kind === 'del' ? 'bg-red-500/10 text-red-400'
                      : l.kind === 'add' ? 'bg-emerald-500/10 text-emerald-400'
                      : 'text-[var(--c-text-3)]'
                    }`}
                  >
                    {l.kind === 'del' ? '− ' : l.kind === 'add' ? '+ ' : '  '}{l.text}
                  </div>
                ))}
              </pre>
            </div>
          )}
          {raw !== null && (
            <pre className="text-[11px] font-mono text-[var(--c-text-3)] overflow-x-auto max-h-40 leading-relaxed whitespace-pre-wrap break-all">
              {raw}
            </pre>
          )}
          {diff === null && raw === null && (
            <p className="text-[11px] text-[var(--c-text-3)] py-1.5">Loading…</p>
          )}
        </div>
      )}
    </div>
  )
}

function FileBackupStack({
  configPath,
  onRestored,
}: {
  configPath: string
  onRestored: () => void
}) {
  const [entries, setEntries] = useState<BackupEntry[]>([])
  const [expanded, setExpanded] = useState(false)
  const [restoring, setRestoring] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(() => {
    invoke<BackupEntry[]>('list_config_backups', { configPath })
      .then(setEntries)
      .catch(() => setEntries([]))
  }, [configPath])

  useEffect(() => { load(); setExpanded(false); setShowAll(false) }, [load])

  const handleRestore = async (entry: BackupEntry) => {
    setRestoring(entry.timestampMs)
    setError(null)
    try {
      await invoke('restore_config_backup', { configPath, timestampMs: entry.timestampMs })
      load()
      onRestored()
    } catch (e) {
      setError(String(e))
    } finally {
      setRestoring(null)
    }
  }

  const displayed = showAll ? entries : entries.slice(0, 5)

  return (
    <div className="mx-3 mb-4">
      {/* stacked-card header: layers behind = older snapshots */}
      <div className="relative">
        {entries.length > 1 && (
          <div className="absolute left-3 right-3 -bottom-2 h-full rounded-lg bg-[var(--c-surface)] border border-[var(--c-border-sub)]" aria-hidden="true" />
        )}
        {entries.length > 2 && (
          <div className="absolute left-1.5 right-1.5 -bottom-1 h-full rounded-lg bg-[var(--c-surface)] border border-[var(--c-border-sub)]" aria-hidden="true" />
        )}
        <button
          onClick={() => setExpanded(v => !v)}
          className="relative w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[var(--c-bg)] border border-[var(--c-border)] hover:border-[var(--c-text-3)] transition-colors text-left shadow-sm"
        >
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-[var(--c-text-2)] truncate font-mono">
              {shortPath(configPath)}
            </p>
            <p className="text-[11px] text-[var(--c-text-3)]">
              {entries.length === 0
                ? 'No backups yet'
                : `${entries.length} snapshot${entries.length > 1 ? 's' : ''} · latest ${timeAgo(entries[0].timestampMs)}`}
            </p>
          </div>
          {entries.length > 0 && (
            <svg
              className={`w-3.5 h-3.5 text-[var(--c-text-3)] flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
            >
              <polyline points="9 18 15 12 9 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>

      {expanded && entries.length > 0 && (
        <div className="mt-3 border border-[var(--c-border)] rounded-lg overflow-hidden divide-y divide-[var(--c-border-sub)]">
          {displayed.map(entry => (
            <SnapshotRow
              key={entry.timestampMs}
              entry={entry}
              configPath={configPath}
              restoring={restoring === entry.timestampMs}
              onRestore={() => handleRestore(entry)}
            />
          ))}
          {entries.length > 5 && (
            <button
              onClick={() => setShowAll(v => !v)}
              className="w-full px-3 py-2 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors text-center"
            >
              {showAll ? 'Show fewer' : `Show all ${entries.length} snapshots`}
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="px-1 py-2 text-[11px] text-red-400">{error}</p>
      )}
    </div>
  )
}

export default function ConfigBackupView({
  agent,
  onBack,
  onRestored,
}: {
  agent: Agent
  onBack: () => void
  onRestored: () => void
}) {
  const files = useMemo(() => agent.configFiles ?? [], [agent.configFiles])
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (files.length > 0 && (selected === null || !files.includes(selected))) {
      setSelected(files[0])
    }
  }, [files, selected])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--c-border)]">
        <button
          onClick={onBack}
          className="p-1 rounded hover:bg-[var(--c-surface-2)] text-[var(--c-text-3)] hover:text-[var(--c-text-1)] transition-colors"
          aria-label="Back"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-semibold text-[var(--c-text-1)]">Config Backups</span>
          <span className="text-[12px] text-[var(--c-text-3)] ml-2">{agent.name}</span>
        </div>
      </div>

      {files.length > 1 && (
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--c-border)] flex-wrap flex-shrink-0">
          {files.map(path => (
            <button
              key={path}
              onClick={() => setSelected(path)}
              className={`text-[11px] font-mono px-2 py-0.5 rounded-full border transition-colors ${
                selected === path
                  ? 'bg-[var(--c-text)] text-[var(--c-bg)] border-transparent'
                  : 'border-[var(--c-border-sub)] bg-[var(--c-surface)] text-[var(--c-text-2)] hover:text-[var(--c-text)]'
              }`}
            >
              {baseName(path)}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto pt-3">
        {files.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-[var(--c-text-3)]">
            No config files tracked for this agent.
          </div>
        ) : selected ? (
          <FileBackupStack
            key={selected}
            configPath={selected}
            onRestored={onRestored}
          />
        ) : null}

        <p className="px-4 pb-4 text-[11px] text-[var(--c-text-3)] leading-relaxed">
          Backups are created automatically before every toggle, install, or remove. Restoring overwrites the current config and creates a new backup first.
        </p>
      </div>
    </div>
  )
}
