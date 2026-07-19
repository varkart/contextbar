import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Skill, FileEntry, Agent } from '../types'
import { capture } from '../analytics'
import { SkillInstalledOn } from './InstalledOnSection'
import { agentColor } from '../constants/agentColors'

interface SkillDetailPanelProps {
  skill: Skill
  onBack: () => void
  agentName?: string
  agentId?: string
  onToggled?: () => void
  allAgents?: Agent[]
  /** All variants of this skill across tools (same name, possibly different content). */
  variants?: Skill[]
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

function isMarkdown(entry: FileEntry): boolean {
  const ext = (entry.extension ?? '').toLowerCase()
  return ext === 'md' || ext === 'markdown'
}

function FileTree({ entries, depth = 0, onOpenMarkdown }: {
  entries: FileEntry[]
  depth?: number
  onOpenMarkdown: (entry: FileEntry) => void
}) {
  return (
    <>
      {entries.map(entry => (
        <FileTreeNode key={entry.path} entry={entry} depth={depth} onOpenMarkdown={onOpenMarkdown} />
      ))}
    </>
  )
}

function FileTreeNode({ entry, depth, onOpenMarkdown }: {
  entry: FileEntry
  depth: number
  onOpenMarkdown: (entry: FileEntry) => void
}) {
  const [open, setOpen] = useState(false)

  // Only markdown files are openable from the file browser; other files are
  // listed for orientation but stay inert.
  const openable = entry.isDir || isMarkdown(entry)

  const handleClick = () => {
    if (entry.isDir) {
      setOpen(v => !v)
    } else if (isMarkdown(entry)) {
      // Markdown renders inline, same as the full-description view
      onOpenMarkdown(entry)
      capture('skill_file_opened', { extension: entry.extension ?? 'unknown', viewer: 'inline' })
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={!openable}
        title={openable ? undefined : 'Only markdown files can be opened here'}
        className={`w-full flex items-center gap-2 py-[3px] pr-2 rounded-sm text-left
          border-l-2 border-transparent group transition-all duration-150 ease-out
          ${openable
            ? 'hover:bg-[var(--c-hover)] hover:border-indigo-400/40 hover:translate-x-[1px]'
            : 'cursor-default opacity-60'}`}
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
        {isMarkdown(entry) && (
          <span className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 text-[var(--c-text-3)]">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="w-3 h-3">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </span>
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
        <FileTree entries={entry.children} depth={depth + 1} onOpenMarkdown={onOpenMarkdown} />
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

export default function SkillDetailPanel({ skill: initialSkill, agentId, onToggled, onBack, allAgents, variants }: SkillDetailPanelProps) {
  // Variant switcher — active skill may change if user picks a different variant
  const hasVariants = variants && variants.length > 1 &&
    new Set(variants.map(v => v.contentHash).filter(Boolean)).size > 1
  const [activeVariant, setActiveVariant] = useState<Skill>(initialSkill)
  const skill = hasVariants ? activeVariant : initialSkill

  // Which provider row is selected — determines which path shows at the bottom
  const initialAgentId = agentId ?? initialSkill.agentId ?? ''
  const [selectedPathAgentId, setSelectedPathToolId] = useState<string>(initialAgentId)

  // Derive path to display from the selected provider's variant
  const displayedSkill = variants?.find(v => v.agentId === selectedPathAgentId) ?? skill
  const displayedPath = displayedSkill.path
  const displayedSourceUrl = displayedSkill.sourceUrl ?? skill.sourceUrl

  const [fileTree, setFileTree] = useState<FileEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Full description overlay
  const [descOpen, setDescOpen] = useState(false)
  const [fullContent, setFullContent] = useState<string | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)
  const loadedForPath = useRef<string | null>(null)

  // Inline markdown file viewer (same rendering as the full description)
  const [mdFile, setMdFile] = useState<FileEntry | null>(null)
  const [mdContent, setMdContent] = useState<string | null>(null)
  const [mdError, setMdError] = useState<string | null>(null)
  const [loadingMd, setLoadingMd] = useState(false)

  const handleOpenMarkdown = (entry: FileEntry) => {
    setMdFile(entry)
    setMdContent(null)
    setMdError(null)
    setLoadingMd(true)
    invoke<string>('read_markdown_file', { path: entry.path })
      .then(setMdContent)
      .catch(e => setMdError(String(e)))
      .finally(() => setLoadingMd(false))
  }

  useEffect(() => {
    setLoading(true)
    setError(null)
    invoke<FileEntry>('read_skill_dir', { path: skill.path })
      .then(setFileTree)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [skill.path])

  // Close overlays and reset content when skill changes
  useEffect(() => {
    setDescOpen(false)
    setMdFile(null)
  }, [skill.path])

  // Capture-phase Escape closes the markdown viewer before global handlers
  useEffect(() => {
    if (!mdFile) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        setMdFile(null)
      }
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [mdFile])

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

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[var(--c-border)] flex-shrink-0 min-w-0">
        <button
          onClick={onBack}
          className="text-[12px] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors flex-shrink-0"
        >
          Skills
        </button>
        <span className="text-[11px] text-[var(--c-text-3)] opacity-40 flex-shrink-0">›</span>
        <span className="text-[12.5px] font-semibold font-mono text-indigo-400 truncate">{skill.name}</span>
      </div>

      {/* Variant switcher — only when multiple tools have different content */}
      {hasVariants && variants && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[var(--c-border)] bg-[var(--c-surface)]/40 flex-shrink-0 flex-wrap">
          <span className="text-[11px] text-[var(--c-text-3)] flex-shrink-0">Variant:</span>
          {variants.map(v => {
            const colors = agentColor(v.agentId ?? '')
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
                {v.agentName ?? v.agentId}
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
        {allAgents && (
          <SkillInstalledOn
            skill={skill}
            currentAgentId={agentId ?? skill.agentId ?? ''}
            allAgents={allAgents}
            onInstalled={async () => { await onToggled?.() }}
            onSelectForPath={tool => setSelectedPathToolId(tool.id)}
            selectedAgentId={selectedPathAgentId}
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
              ? <FileTree entries={fileTree.children} depth={0} onOpenMarkdown={handleOpenMarkdown} />
              : <FileTreeNode entry={fileTree} depth={0} onOpenMarkdown={handleOpenMarkdown} />
          )}
        </div>

        {/* Path + source link — updates when user selects a provider row above */}
        <div className="px-4 py-3 border-t border-[var(--c-border)] mt-auto space-y-1.5">
          {displayedSourceUrl && (
            <button
              onClick={async () => {
                try { await invoke('open_url', { url: displayedSourceUrl }) } catch {}
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
              <span className="truncate">{displayedSourceUrl}</span>
            </button>
          )}
          <p className="text-[12px] text-[var(--c-text-3)] font-mono break-all leading-relaxed">
            {displayedPath}
          </p>
        </div>
      </div>

      {/* Markdown file viewer — same rendering as the full description */}
      {mdFile && (
        <div className="absolute inset-0 z-10 flex flex-col bg-[var(--c-bg)] animate-slide-in-right">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--c-border)] flex-shrink-0">
            <button
              onClick={() => setMdFile(null)}
              className="text-[var(--c-text-2)] hover:text-[var(--c-text)] transition-colors p-0.5 -ml-0.5 rounded"
              aria-label="Back"
            >
              <ChevronLeft />
            </button>
            <span className="text-[15px] font-semibold text-indigo-400 tracking-[-0.01em] font-mono flex-1 truncate">
              {mdFile.name}
            </span>
            <button
              onClick={() => invoke('open_path', { path: mdFile.path }).catch(() => {})}
              className="text-[12px] text-[var(--c-text-3)] hover:text-indigo-400 transition-colors flex-shrink-0"
            >
              Open in editor
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {loadingMd && (
              <div className="flex gap-1.5 py-4">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-[var(--c-text-3)] animate-pulse"
                    style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            )}
            {mdError && !loadingMd && (
              <p className="text-[12px] text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{mdError}</p>
            )}
            {mdContent && !loadingMd && (
              <div className="text-[13px] text-[var(--c-text-2)] leading-relaxed overflow-x-hidden skill-md">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(mdContent)}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      )}

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
