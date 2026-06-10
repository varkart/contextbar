import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { Skill, FileEntry } from '../types'
import { capture, captureException } from '../analytics'

interface SkillDetailPanelProps {
  skill: Skill
  onBack: () => void
  toolName?: string
}

function FileIcon({ extension, isDir }: { extension?: string; isDir: boolean }) {
  if (isDir) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className="w-3.5 h-3.5 text-amber-400 flex-shrink-0">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    )
  }
  const color = {
    md: 'text-blue-400', mjs: 'text-yellow-400', js: 'text-yellow-400',
    ts: 'text-blue-500', tsx: 'text-blue-500', py: 'text-green-400',
    sh: 'text-zinc-400', json: 'text-orange-400',
  }[extension ?? ''] ?? 'text-[var(--c-text-3)]'

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={`w-3.5 h-3.5 ${color} flex-shrink-0`}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  )
}

function FileTree({ entries, depth = 0 }: { entries: FileEntry[]; depth?: number }) {
  return (
    <>
      {entries.map(entry => (
        <FileTreeNode key={entry.path} entry={entry} depth={depth} />
      ))}
    </>
  )
}

function FileTreeNode({ entry, depth }: { entry: FileEntry; depth: number }) {
  const [open, setOpen] = useState(depth === 0)

  const handleClick = async () => {
    if (entry.isDir) {
      setOpen(v => !v)
    } else {
      try {
        await invoke('open_path', { path: entry.path })
        capture('skill_file_opened', { extension: entry.extension ?? 'unknown' })
      } catch (e) {
        console.error('open_path failed:', e)
        captureException(e)
      }
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-2 py-[3px] pr-2 rounded-sm text-left
          hover:bg-[var(--c-hover)] transition-all duration-150 ease-out
          border-l-2 border-transparent hover:border-indigo-400/40 hover:translate-x-[1px]
          group`}
        style={{ paddingLeft: `${(depth * 16) + 8}px` }}
      >
        <FileIcon extension={entry.extension} isDir={entry.isDir} />
        <span className={`text-[14px] truncate flex-1 ${
          entry.isDir
            ? 'text-[var(--c-text)] font-medium'
            : 'text-[var(--c-text-2)]'
        }`}>
          {entry.name}
        </span>
        {!entry.isDir && (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="w-3 h-3 text-[var(--c-text-3)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        )}
        {entry.isDir && (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={`w-3 h-3 text-[var(--c-text-3)] flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        )}
      </button>
      {entry.isDir && open && entry.children.length > 0 && (
        <FileTree entries={entry.children} depth={depth + 1} />
      )}
    </div>
  )
}

function ExpandableDescription({ skill }: { skill: Skill }) {
  const [expanded, setExpanded] = useState(false)
  const [fullContent, setFullContent] = useState<string | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)

  const loadFull = async () => {
    if (fullContent !== null) { setExpanded(true); return }
    setLoadingContent(true)
    try {
      const candidates = [`${skill.path}/SKILL.md`, `${skill.path}.md`]
      for (const p of candidates) {
        try {
          const text = await invoke<string>('read_text_file', { path: p })
          setFullContent(text)
          setExpanded(true)
          capture('skill_description_expanded', { skill_name: skill.name })
          return
        } catch { /* try next */ }
      }
      setFullContent(skill.description ?? '')
      setExpanded(true)
    } finally {
      setLoadingContent(false)
    }
  }

  if (!skill.description) return null

  return (
    <div className="px-4 py-3 border-b border-[var(--c-border)]">
      {expanded && fullContent !== null ? (
        <>
          <pre className="text-[13px] text-[var(--c-text-2)] leading-relaxed whitespace-pre-wrap font-sans overflow-x-hidden">
            {fullContent}
          </pre>
          <button
            onClick={() => setExpanded(false)}
            className="text-[13px] text-indigo-500 hover:text-indigo-400 mt-2 transition-colors"
          >
            Show less
          </button>
        </>
      ) : (
        <>
          <p className="text-[14px] text-[var(--c-text-2)] leading-relaxed line-clamp-3">
            {skill.description}
          </p>
          <button
            onClick={loadFull}
            disabled={loadingContent}
            className="text-[13px] text-indigo-500 hover:text-indigo-400 mt-1.5 transition-colors disabled:opacity-50"
          >
            {loadingContent ? 'Loading…' : 'Show full description →'}
          </button>
        </>
      )}
    </div>
  )
}

export default function SkillDetailPanel({ skill, onBack, toolName }: SkillDetailPanelProps) {
  const [fileTree, setFileTree] = useState<FileEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    invoke<FileEntry>('read_skill_dir', { path: skill.path })
      .then(setFileTree)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [skill.path])

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--c-border)] flex-shrink-0">
        <button
          onClick={onBack}
          className="text-[var(--c-text-2)] hover:text-[var(--c-text)] transition-colors p-0.5 -ml-0.5 rounded"
          aria-label="Back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="w-3.5 h-3.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        {toolName && (
          <>
            <span className="text-[13px] text-[var(--c-text-3)] truncate max-w-[80px]">{toolName}</span>
            <span className="text-[12px] text-[var(--c-text-3)]">›</span>
          </>
        )}
        <span className="text-[15px] font-semibold text-[var(--c-text)] tracking-[-0.01em] truncate">
          {skill.name}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Expandable description */}
        <ExpandableDescription skill={skill} />

        {/* File tree */}
        <div className="px-2 py-2">
          <p className="text-[13px] font-semibold text-indigo-500 px-2 mb-1">Files</p>
          {loading && (
            <div className="px-2 py-4 animate-pulse space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-3 bg-[var(--c-skeleton)] rounded w-3/4"/>)}
            </div>
          )}
          {error && (
            <p className="text-[13px] text-red-400 px-2 py-2">{error}</p>
          )}
          {fileTree && !loading && (
            fileTree.isDir
              ? <FileTree entries={fileTree.children} depth={0} />
              : <FileTreeNode entry={fileTree} depth={0} />
          )}
        </div>

        {/* Path */}
        <div className="px-4 py-3 border-t border-[var(--c-border)] mt-auto">
          <p className="text-[12px] text-[var(--c-text-3)] font-mono break-all leading-relaxed">
            {skill.path}
          </p>
        </div>
      </div>
    </div>
  )
}
