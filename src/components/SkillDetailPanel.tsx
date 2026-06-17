import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Skill, FileEntry } from '../types'
import { capture, captureException } from '../analytics'

interface SkillDetailPanelProps {
  skill: Skill
  onBack: () => void
  toolName?: string
  toolId?: string
  onToggled?: () => void
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

function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content
  const end = content.indexOf('\n---', 4)
  if (end === -1) return content
  return content.slice(end + 4).trimStart()
}

function ExpandableDescription({ skill }: { skill: Skill }) {
  const [expanded, setExpanded] = useState(false)

  if (!skill.description) return null

  const hasFullContent = !!skill.fullDescription

  return (
    <div className="px-4 py-3 border-b border-[var(--c-border)]">
      {expanded && skill.fullDescription ? (
        <>
          <div className="text-[13px] text-[var(--c-text-2)] leading-relaxed overflow-x-hidden skill-md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(skill.fullDescription)}</ReactMarkdown>
          </div>
          <button
            onClick={() => { setExpanded(false); capture('skill_description_collapsed', { skill_name: skill.name }) }}
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
          {hasFullContent && (
            <button
              onClick={() => { setExpanded(true); capture('skill_description_expanded', { skill_name: skill.name }) }}
              className="text-[13px] text-indigo-500 hover:text-indigo-400 mt-1.5 transition-colors"
            >
              Show full description →
            </button>
          )}
        </>
      )}
    </div>
  )
}

function SkillToggle({
  active,
  toggling,
  justToggled,
  onToggle,
}: {
  active: boolean
  toggling: boolean
  justToggled: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      disabled={toggling}
      aria-label={active ? 'Disable skill' : 'Enable skill'}
      style={{ transition: 'background-color 0.25s ease' }}
      className={`relative w-11 h-6 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 flex-shrink-0 ${
        active ? 'bg-emerald-500' : 'bg-[var(--c-track)]'
      } ${justToggled && active ? 'ring-2 ring-emerald-400/30' : ''}`}
    >
      {/* knob */}
      <span
        style={{ transition: 'left 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md flex items-center justify-center ${
          active ? 'left-6' : 'left-1'
        }`}
      >
        {/* spinner while IPC in flight */}
        {toggling && (
          <svg className="w-2.5 h-2.5 text-zinc-400 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="3.5"
              strokeDasharray="38" strokeDashoffset="9" strokeLinecap="round"/>
          </svg>
        )}
        {/* checkmark on success */}
        {justToggled && !toggling && (
          <svg className="w-2.5 h-2.5 text-emerald-500" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
      </span>
    </button>
  )
}

export default function SkillDetailPanel({ skill, onBack, toolName, toolId, onToggled }: SkillDetailPanelProps) {
  const [active, setActive] = useState(skill.active)
  const [toggling, setToggling] = useState(false)
  const [justToggled, setJustToggled] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [fileTree, setFileTree] = useState<FileEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const handleToggle = async () => {
    if (!toolId) return
    setToggling(true)
    setToggleError(null)
    // yield one frame so React paints the spinner before the IPC call blocks
    await new Promise<void>(r => requestAnimationFrame(() => r()))
    try {
      await invoke('set_skill_active', {
        toolId,
        skillName: skill.name,
        skillPath: skill.path,
        active: !active,
      })
      capture('skill_toggled', { tool_id: toolId, skill_name: skill.name, active: !active })
      setActive(v => !v)
      setJustToggled(true)
      await onToggled?.()
    } catch (e) {
      setToggleError(String(e))
      captureException(e)
    } finally {
      setToggling(false)
      setTimeout(() => setJustToggled(false), 1200)
    }
  }

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
            <button onClick={onBack} className="text-[13px] text-[var(--c-text-3)] truncate max-w-[80px] hover:text-[var(--c-text-2)] transition-colors">
              {toolName}
            </button>
            <span className="text-[12px] text-[var(--c-text-3)]">›</span>
          </>
        )}
        <span className="text-[15px] font-semibold text-[var(--c-text)] tracking-[-0.01em] truncate">
          {skill.name}
        </span>
      </div>

      {/* Status + toggle strip */}
      {toolId && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--c-border)] bg-[var(--c-surface)]/40 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {/* status dot */}
            <span
              style={{ transition: 'background-color 0.25s ease' }}
              className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? 'bg-emerald-400' : 'bg-[var(--c-text-3)]'}`}
            />
            <span
              style={{ transition: 'color 0.25s ease' }}
              className={`text-[13px] font-medium ${active ? 'text-emerald-400' : 'text-[var(--c-text-3)]'}`}
            >
              {active ? 'Active' : 'Inactive'}
            </span>
            {toggleError && (
              <span className="text-[12px] text-red-400 truncate ml-1">— {toggleError}</span>
            )}
            {toggleError && (
              <button onClick={() => setToggleError(null)} className="text-[11px] text-red-400/60 hover:text-red-400 flex-shrink-0 ml-1">✕</button>
            )}
          </div>
          <SkillToggle
            active={active}
            toggling={toggling}
            justToggled={justToggled}
            onToggle={handleToggle}
          />
        </div>
      )}

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
