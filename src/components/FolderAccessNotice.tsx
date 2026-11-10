import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

/** EPERM from a read macOS blocked (Documents, Desktop or Downloads). */
export function isFolderAccessError(error: string): boolean {
  return error.includes('os error 1)') || error.includes('Operation not permitted')
}

/**
 * Shown when macOS blocked reading a path, e.g. a skill symlinked into
 * ~/Documents. "Allow access" re-asks macOS (which never re-prompts on its
 * own after "Don't Allow"), then retries.
 */
export default function FolderAccessNotice({ path, onRetry }: { path: string; onRetry: () => void }) {
  const [busy, setBusy] = useState(false)
  const [stillBlocked, setStillBlocked] = useState(false)

  const request = async () => {
    setBusy(true)
    try {
      const ok = await invoke<boolean>('request_folder_access', { path })
      if (ok) onRetry()
      else setStillBlocked(true)
    } catch {
      setStillBlocked(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="text-[12px] rounded-lg px-3 py-2 bg-amber-500/10 text-amber-400 space-y-1.5">
      <p>
        macOS blocked access. This lives in a protected folder (Documents, Desktop or Downloads).
      </p>
      {stillBlocked && (
        <p className="text-[var(--c-text-2)]">
          Still blocked. Turn on Context Bar under Privacy &amp; Security → Files &amp; Folders.
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={request}
          disabled={busy}
          className="px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 font-medium disabled:opacity-50"
        >
          {busy ? 'Waiting for macOS…' : 'Allow access'}
        </button>
        {stillBlocked && (
          <button
            onClick={() => invoke('open_files_and_folders_settings').catch(() => {})}
            className="px-2.5 py-1 rounded-md border border-amber-500/30 hover:bg-amber-500/10"
          >
            Open System Settings
          </button>
        )}
      </div>
    </div>
  )
}
