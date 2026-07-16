import { useState, useEffect, useMemo, useRef } from 'react'
import type { SessionEntry, RepoWorktrees } from '../types'
import type { Section } from './ExpandedApp'

export interface PaletteItem {
  id: string
  group: 'Go to' | 'Sessions' | 'Repos'
  title: string
  sub?: string
  action: () => void
}

export interface FuzzyResult {
  ok: boolean
  idx: number[]
}

/** All query chars must appear in text, in order (not necessarily contiguous). */
export function fuzzyMatch(query: string, text: string): FuzzyResult {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (!q) return { ok: true, idx: [] }
  let ti = 0
  const idx: number[] = []
  for (const c of q) {
    const found = t.indexOf(c, ti)
    if (found === -1) return { ok: false, idx: [] }
    idx.push(found)
    ti = found + 1
  }
  return { ok: true, idx }
}

const SECTION_ITEMS: { id: Section; label: string; sub: string }[] = [
  { id: 'work', label: 'My Work', sub: 'Overview & recent activity' },
  { id: 'sessions', label: 'Sessions', sub: 'Conversation history' },
  { id: 'worktrees', label: 'Repos', sub: 'Repos & worktrees' },
  { id: 'agents', label: 'Agents', sub: 'Installed AI tools' },
  { id: 'skills', label: 'Skills', sub: 'Skills across agents' },
  { id: 'mcps', label: 'MCPs', sub: 'MCP servers' },
  { id: 'settings', label: 'Settings', sub: 'App preferences' },
  { id: 'notifications', label: 'Notifications', sub: 'Alerts & doctor checks' },
]

const MAX_SESSION_ITEMS = 30

export function buildPaletteItems(
  sessions: SessionEntry[],
  repos: RepoWorktrees[],
  handlers: {
    goTo: (s: Section) => void
    openSession: (s: SessionEntry) => void
    viewSessionsForRepo: (r: RepoWorktrees) => void
  }
): PaletteItem[] {
  const sectionItems: PaletteItem[] = SECTION_ITEMS.map(s => ({
    id: `section-${s.id}`,
    group: 'Go to',
    title: s.label,
    sub: s.sub,
    action: () => handlers.goTo(s.id),
  }))

  const sessionItems: PaletteItem[] = [...sessions]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_SESSION_ITEMS)
    .map(s => ({
      id: `session-${s.sessionId}`,
      group: 'Sessions' as const,
      title: s.display,
      sub: s.projectName,
      action: () => handlers.openSession(s),
    }))

  const repoItems: PaletteItem[] = repos.map(r => ({
    id: `repo-${r.repoPath}`,
    group: 'Repos',
    title: r.repoName,
    sub: `${r.worktrees.length} worktree${r.worktrees.length === 1 ? '' : 's'}`,
    action: () => handlers.viewSessionsForRepo(r),
  }))

  return [...sectionItems, ...sessionItems, ...repoItems]
}

function highlightMatch(text: string, idx: number[]) {
  if (!idx.length) return text
  const nodes: React.ReactNode[] = []
  let last = 0
  idx.forEach((i, k) => {
    if (i > last) nodes.push(text.slice(last, i))
    nodes.push(
      <mark key={k} className="bg-transparent text-indigo-400 font-semibold">
        {text[i]}
      </mark>
    )
    last = i + 1
  })
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export default function CommandPalette({ open, onClose, items }: {
  open: boolean
  onClose: () => void
  items: PaletteItem[]
}) {
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSel(0)
    inputRef.current?.focus()
  }, [open])

  const scored = useMemo(
    () => items.map(item => ({ item, m: fuzzyMatch(query, item.title) })).filter(x => x.m.ok),
    [items, query]
  )

  useEffect(() => setSel(0), [query])

  const groups = useMemo(() => {
    const g = new Map<string, typeof scored>()
    for (const x of scored) {
      const list = g.get(x.item.group)
      if (list) list.push(x)
      else g.set(x.item.group, [x])
    }
    return g
  }, [scored])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSel(s => (scored.length ? (s + 1) % scored.length : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSel(s => (scored.length ? (s - 1 + scored.length) % scored.length : 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const chosen = scored[sel]
        if (chosen) {
          onClose()
          chosen.item.action()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, scored, sel, onClose])

  if (!open) return null

  let flatIndex = -1

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] bg-black/55"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        className="w-[560px] max-w-[90vw] bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-[var(--c-border)]">
          <svg
            xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            className="w-4 h-4 flex-shrink-0 text-[var(--c-text-3)]"
          >
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search sessions, repos, sections…"
            className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-[var(--c-text-3)]"
          />
          <span className="text-[10px] font-mono text-[var(--c-text-3)] border border-[var(--c-border)] rounded px-1.5 py-0.5 flex-shrink-0">
            ESC
          </span>
        </div>
        <div className="max-h-[360px] overflow-y-auto p-1.5">
          {scored.length === 0 && (
            <div className="py-8 text-center text-[12px] text-[var(--c-text-3)]">No matches for "{query}"</div>
          )}
          {[...groups.entries()].map(([group, list]) => (
            <div key={group}>
              <div className="px-2.5 pt-2 pb-1 text-[9.5px] font-mono uppercase tracking-wider text-[var(--c-text-3)]">
                {group}
              </div>
              {list.map(({ item, m }) => {
                flatIndex++
                const idx = flatIndex
                return (
                  <button
                    key={item.id}
                    onMouseEnter={() => setSel(idx)}
                    onClick={() => { onClose(); item.action() }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[12.5px] transition-colors ${idx === sel ? 'bg-indigo-400/15 text-indigo-400' : 'text-[var(--c-text-2)] hover:bg-[var(--c-hover)]'}`}
                  >
                    <span className="flex-1 min-w-0 truncate">{highlightMatch(item.title, m.idx)}</span>
                    {item.sub && (
                      <span className="text-[10.5px] text-[var(--c-text-3)] flex-shrink-0 max-w-[40%] truncate">
                        {item.sub}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <div className="flex gap-4 px-3.5 py-2 border-t border-[var(--c-border)] text-[10px] text-[var(--c-text-3)]">
          <span>↑↓ navigate</span><span>↵ select</span><span>esc close</span>
        </div>
      </div>
    </div>
  )
}
