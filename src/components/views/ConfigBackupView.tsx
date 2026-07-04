import { useState, useEffect, useCallback } from 'react'
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

function FileBackupSection({
  configPath,
  onRestored,
}: {
  configPath: string
  onRestored: () => void
}) {
  const [entries, setEntries] = useState<BackupEntry[]>([])
  const [preview, setPreview] = useState<{ ts: number; content: string } | null>(null)
  const [restoring, setRestoring] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(() => {
    invoke<BackupEntry[]>('list_config_backups', { configPath })
      .then(setEntries)
      .catch(() => setEntries([]))
  }, [configPath])

  useEffect(() => { load() }, [load])

  const handlePreview = async (entry: BackupEntry) => {
    if (preview?.ts === entry.timestampMs) {
      setPreview(null)
      return
    }
    try {
      const content = await invoke<string>('read_backup_content', { backupPath: entry.path })
      setPreview({ ts: entry.timestampMs, content })
    } catch (e) {
      setError(String(e))
    }
  }

  const handleRestore = async (entry: BackupEntry) => {
    setRestoring(entry.timestampMs)
    setError(null)
    try {
      await invoke('restore_config_backup', { configPath, timestampMs: entry.timestampMs })
      setPreview(null)
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
    <div className="border border-[var(--c-border)] rounded-lg overflow-hidden mx-3 mb-3">
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--c-surface-1)] border-b border-[var(--c-border)]">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-[var(--c-text-2)] truncate font-mono">
            {shortPath(configPath)}
          </p>
          <p className="text-[11px] text-[var(--c-text-3)]">
            {entries.length === 0 ? 'No backups yet' : `${entries.length} snapshot${entries.length > 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="px-3 py-3 text-[12px] text-[var(--c-text-3)]">
          Backups are created automatically before every config write.
        </div>
      ) : (
        <div className="divide-y divide-[var(--c-border-sub)]">
          {displayed.map(entry => (
            <div key={entry.timestampMs}>
              <div className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--c-hover)] transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-[var(--c-text-2)]">
                    {new Date(entry.timestampMs).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-[var(--c-text-3)]">{timeAgo(entry.timestampMs)}</p>
                </div>
                <button
                  onClick={() => handlePreview(entry)}
                  className="text-[11px] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors px-1.5 py-0.5 rounded"
                >
                  {preview?.ts === entry.timestampMs ? 'hide' : 'preview'}
                </button>
                <button
                  onClick={() => handleRestore(entry)}
                  disabled={restoring === entry.timestampMs}
                  className="text-[11px] bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                >
                  {restoring === entry.timestampMs ? 'restoring…' : 'Restore'}
                </button>
              </div>
              {preview?.ts === entry.timestampMs && (
                <div className="px-3 pb-2 bg-[var(--c-surface-1)]">
                  <pre className="text-[11px] font-mono text-[var(--c-text-3)] overflow-x-auto max-h-40 leading-relaxed whitespace-pre-wrap break-all">
                    {preview.content.slice(0, 2000)}
                    {preview.content.length > 2000 && '\n…'}
                  </pre>
                </div>
              )}
            </div>
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
        <p className="px-3 py-2 text-[11px] text-red-400">{error}</p>
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

      <div className="flex-1 overflow-y-auto pt-3">
        {(agent.configFiles ?? []).length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-[var(--c-text-3)]">
            No config files tracked for this agent.
          </div>
        ) : (
          (agent.configFiles ?? []).map(path => (
            <FileBackupSection
              key={path}
              configPath={path}
              onRestored={onRestored}
            />
          ))
        )}

        <p className="px-4 pb-4 text-[11px] text-[var(--c-text-3)] leading-relaxed">
          Backups are created automatically before every toggle, install, or remove. Restoring overwrites the current config and creates a new backup first.
        </p>
      </div>
    </div>
  )
}
