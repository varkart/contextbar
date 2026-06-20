import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Skill, FileEntry, AiTool } from '../types'
import { capture, captureException } from '../analytics'
import { SkillInstalledOn } from './InstalledOnSection'
import { TOOL_COLORS } from '../constants/toolColors'

interface SkillDetailPanelProps {
  skill: Skill
  onBack: () => void
  toolName?: string
  toolId?: string
  onToggled?: () => void
  allTools?: AiTool[]
  /** All variants of this skill across tools (same name, possibly different content). */
  variants?: Skill[]
  onSelectTool?: (tool: AiTool) => void
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
  const [open, setOpen] = useState(false)

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

const ChevronLeft = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    className="w-3.5 h-3.5">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)

export default function SkillDetailPanel({ skill: initialSkill, onBack, toolName, toolId, onToggled, allTools, variants, onSelectTool }: SkillDetailPanelProps) {
  // Variant switcher — active skill may change if user picks a different variant
  const hasVariants = variants && variants.length > 1 &&
    new Set(variants.map(v => v.contentHash).filter(Boolean)).size > 1
  const [activeVariant, setActiveVariant] = useState<Skill>(initialSkill)
  const skill = hasVariants ? activeVariant : initialSkill

  const [fileTree, setFileTree] = useState<FileEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Full description overlay
  const [descOpen, setDescOpen] = useState(false)
  const [fullContent, setFullContent] = useState<string | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)
  const loadedForPath = useRef<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    invoke<FileEntry>('read_skill_dir', { path: skill.path })
      .then(setFileTree)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [skill.path])

  // Close overlay and reset content when skill changes
  useEffect(() => {
    setDescOpen(false)
  }, [skill.path])

  // Capture-phase Escape closes the overlay before App.tsx's global handler fires
  useEffect(() => {
    if (!descOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        setDescOpen(false)
        capture('skill_description_collapsed', { skill_name: skill.name })
      }
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [descOpen, skill.name])

  const handleShowFull = async () => {
    setDescOpen(true)
    capture('skill_description_expanded', { skill_name: skill.name })
    if (loadedForPath.current === skill.path) return
    setLoadingContent(true)
    try {
      const content = await invoke<string | null>('get_skill_full_description', { path: skill.path })
      setFullContent(content)
      loadedForPath.current = skill.path
    } catch (e) {
      console.error('get_skill_full_description failed:', e)
    } finally {
      setLoadingContent(false)
    }
  }

  const handleCloseDesc = () => {
    setDescOpen(false)
    capture('skill_description_collapsed', { skill_name: skill.name })
  }

  return (
    <div className="relative flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--c-border)] flex-shrink-0">
        <button
          onClick={onBack}
          className="text-[var(--c-text-2)] hover:text-[var(--c-text)] transition-colors p-0.5 -ml-0.5 rounded"
          aria-label="Back"
        >
          <ChevronLeft />
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
          Skills
        </span>
      </div>

      {/* Variant switcher — only when multiple tools have different content */}
      {hasVariants && variants && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[var(--c-border)] bg-[var(--c-surface)]/40 flex-shrink-0 flex-wrap">
          <span className="text-[11px] text-[var(--c-text-3)] flex-shrink-0">Variant:</span>
          {variants.map(v => {
            const colors = TOOL_COLORS[v.toolId ?? ''] ?? { bg: 'bg-zinc-500/15', text: 'text-zinc-400' }
            const selected = v.path === activeVariant.path
            return (
              <button
                key={v.path}
                onClick={() => setActiveVariant(v)}
                className={`text-[12px] font-medium px-2 py-0.5 rounded-full border transition-colors flex-shrink-0 ${
                  selected
                    ? `${colors.bg} ${colors.text} border-current/30`
                    : 'bg-transparent text-[var(--c-text-3)] border-[var(--c-border)] hover:text-[var(--c-text-2)]'
                }`}
              >
                {v.toolName ?? v.toolId}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Skill name + short description */}
        {skill.description && (
          <div className="px-4 pt-3 pb-2.5 border-b border-[var(--c-border)]">
            <p className="text-[15px] font-semibold text-indigo-400 leading-tight tracking-[-0.01em] font-mono">
              {skill.name}
            </p>
            <p className="text-[13px] text-[var(--c-text-2)] leading-relaxed mt-1">
              {skill.description}
            </p>
            {skill.hasFullDescription && (
              <button
                onClick={handleShowFull}
                className="text-[13px] text-indigo-500 hover:text-indigo-400 mt-1.5 transition-colors"
              >
                Show full description →
              </button>
            )}
          </div>
        )}

        {/* Installed on */}
        {allTools && (
          <SkillInstalledOn
            skill={skill}
            currentToolId={toolId ?? skill.toolId ?? ''}
            allTools={allTools}
            onInstalled={async () => { await onToggled?.() }}
            onSelectTool={onSelectTool}
          />
        )}

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

        {/* Path + source link */}
        <div className="px-4 py-3 border-t border-[var(--c-border)] mt-auto space-y-1.5">
          {skill.sourceUrl && (
            <button
              onClick={async () => {
                try { await invoke('open_url', { url: skill.sourceUrl }) } catch {}
              }}
              className="flex items-center gap-1.5 text-[12px] text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="w-3 h-3 flex-shrink-0">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              <span className="truncate">{skill.sourceUrl}</span>
            </button>
          )}
          <p className="text-[12px] text-[var(--c-text-3)] font-mono break-all leading-relaxed">
            {skill.path}
          </p>
        </div>
      </div>

      {/* Full description overlay — slides in from right over the detail page */}
      {descOpen && (
        <div className="absolute inset-0 z-10 flex flex-col bg-[var(--c-bg)] animate-slide-in-right">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--c-border)] flex-shrink-0">
            <button
              onClick={handleCloseDesc}
              className="text-[var(--c-text-2)] hover:text-[var(--c-text)] transition-colors p-0.5 -ml-0.5 rounded"
              aria-label="Back"
            >
              <ChevronLeft />
            </button>
            <span className="text-[15px] font-semibold text-indigo-400 tracking-[-0.01em] font-mono flex-1 truncate">
              {skill.name}
            </span>
            <button
              onClick={handleCloseDesc}
              className="text-[12px] text-[var(--c-text-3)] hover:text-indigo-400 transition-colors flex-shrink-0"
            >
              Show less
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {loadingContent && (
              <div className="flex gap-1.5 py-4">
                {[0,1,2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-[var(--c-text-3)] animate-pulse"
                    style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            )}
            {fullContent && !loadingContent && (
              <div className="text-[13px] text-[var(--c-text-2)] leading-relaxed overflow-x-hidden skill-md">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(fullContent)}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
