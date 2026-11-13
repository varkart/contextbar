import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { Agent } from './types'

export type KbKind = 'todo' | 'note'

export interface KbItem {
  id: string
  kind: KbKind
  title: string
  body: string
  tags: string[]
  shared: boolean
  created: number
  updated: number
  done?: number | null
  source?: string | null
  path: string
}

export interface KbHistoryEvent {
  ts: number
  kind: KbKind
  action: 'created' | 'edited' | 'done' | 'reopened' | 'deleted' | 'restored' | 'shared' | 'unshared'
  id: string
  title: string
}

export interface KbPatch {
  title?: string
  body?: string
  tags?: string[]
  shared?: boolean
}

export const KB_SKILL_NAME = 'context-bar'

/** Expanded-window tab and note selection; the popover sets these before
 *  opening the window, and the window listens for the storage event. */
export const KB_TAB_KEY = 'contextbar:kb:tab'
export const KB_NOTE_KEY = 'contextbar:kb:note'
/** Window teaching card about sharing; cleared to show it again. */
export const KB_GUIDE_DISMISSED_KEY = 'contextbar:kb:sharing-guide-dismissed'
/** Menu bar tip (and the tile's "New" pill). */
export const KB_POPOVER_TIP_KEY = 'contextbar:kb:popover-tip-dismissed'

export function openKbInWindow(tab: 'todos' | 'notes' | 'history', noteId?: string) {
  localStorage.setItem(KB_TAB_KEY, tab)
  if (noteId) localStorage.setItem(KB_NOTE_KEY, noteId)
  return invoke('open_expanded_window', { section: 'kb' }).catch(() => {})
}

/** Multi-line todo text: first line is the title, the rest its details. */
export function splitTodoText(text: string): { title: string; body: string } {
  const [first, ...rest] = text.trim().split('\n')
  return { title: first.trim(), body: rest.join('\n').trim() }
}

/** Minutes east of UTC, so new ids carry the local date. */
const tzOffset = () => -new Date().getTimezoneOffset()

export const kbApi = {
  list: () => invoke<KbItem[]>('kb_list'),
  history: (limit?: number) => invoke<KbHistoryEvent[]>('kb_history', { limit }),
  create: (kind: KbKind, title: string, body = '', tags: string[] = []) =>
    invoke<KbItem>('kb_create', { kind, title, body, tags, tzOffset: tzOffset() }),
  update: (kind: KbKind, id: string, patch: KbPatch) => invoke<KbItem>('kb_update', { kind, id, patch }),
  createTodo: (text: string, tags: string[] = []) => {
    const { title, body } = splitTodoText(text)
    return invoke<KbItem>('kb_create', { kind: 'todo', title, body, tags, tzOffset: tzOffset() })
  },
  setDone: (id: string, done: boolean) => invoke<KbItem>('kb_set_done', { id, done }),
  remove: (kind: KbKind, id: string) => invoke<void>('kb_delete', { kind, id }),
  undelete: (kind: KbKind, id: string) => invoke<KbItem>('kb_undelete', { kind, id }),
  installSkill: (agentIds: string[]) => invoke<string[]>('kb_install_skill', { agentIds }),
  /** Share or unshare many items at once (one index rewrite). */
  setShared: (items: KbItem[], shared: boolean) =>
    invoke<KbItem[]>('kb_set_shared', { items: items.map(i => ({ kind: i.kind, id: i.id })), shared }),
}

// ── Filtering, sorting, paging ──────────────────────────────────────────────

export type KbSort = 'newest' | 'oldest' | 'edited' | 'az'
export type KbShareFilter = 'all' | 'shared' | 'private'

export interface KbQuery {
  q: string
  share: KbShareFilter
  /** '' = any tag. */
  tag: string
  sort: KbSort
}

export const KB_SORT_LABELS: Record<KbSort, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  edited: 'Recently edited',
  az: 'A–Z',
}

function sortTitle(i: KbItem): string {
  return (i.kind === 'note' ? noteTitle(i) : i.title).toLowerCase()
}

/** Search (title, body, tags), share state, tag, then sort. */
export function queryKb(items: KbItem[], query: KbQuery): KbItem[] {
  const q = query.q.trim().toLowerCase()
  const out = items.filter(i =>
    (query.share === 'all' || (query.share === 'shared') === i.shared)
    && (!query.tag || i.tags.includes(query.tag))
    && (!q || i.title.toLowerCase().includes(q) || i.body.toLowerCase().includes(q) || i.tags.some(t => t.includes(q))))
  const by: Record<KbSort, (a: KbItem, b: KbItem) => number> = {
    newest: (a, b) => b.created - a.created,
    oldest: (a, b) => a.created - b.created,
    edited: (a, b) => b.updated - a.updated,
    az: (a, b) => sortTitle(a).localeCompare(sortTitle(b)),
  }
  return out.sort(by[query.sort])
}

/** Tags in use, for the filter menu. */
export function allTags(items: KbItem[]): string[] {
  return [...new Set(items.flatMap(i => i.tags))].sort()
}

/** Filter/sort state per list ('popover:todos', 'window:notes', ...).
 *  Share, tag and sort persist; the search text does not. */
export function useKbQuery(key: string, defaultSort: KbSort) {
  const storageKey = `contextbar:kb:query:${key}`
  const [query, setQueryState] = useState<KbQuery>(() => {
    const base: KbQuery = { q: '', share: 'all', tag: '', sort: defaultSort }
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
      return {
        ...base,
        ...(saved.share in { all: 1, shared: 1, private: 1 } ? { share: saved.share } : {}),
        ...(typeof saved.tag === 'string' ? { tag: saved.tag } : {}),
        ...(saved.sort in KB_SORT_LABELS ? { sort: saved.sort } : {}),
      }
    } catch { return base }
  })
  const setQuery = useCallback((patch: Partial<KbQuery>) => {
    setQueryState(prev => {
      const next = { ...prev, ...patch }
      localStorage.setItem(storageKey, JSON.stringify({ share: next.share, tag: next.tag, sort: next.sort }))
      return next
    })
  }, [storageKey])
  return [query, setQuery] as const
}

/** First `pageSize * pages` items, with "show more" that resets when the
 *  list's query changes. */
export function usePaged<T>(list: T[], pageSize: number, resetKey: unknown) {
  const [pages, setPages] = useState(1)
  const [lastKey, setLastKey] = useState(resetKey)
  if (lastKey !== resetKey) { setLastKey(resetKey); setPages(1) }
  const shown = list.slice(0, pageSize * pages)
  return { shown, remaining: list.length - shown.length, more: () => setPages(p => p + 1) }
}

/** Markdown previews must open links in the browser, never navigate the webview. */
export function openLinkFromClick(e: { target: EventTarget; preventDefault: () => void }) {
  const a = (e.target as HTMLElement).closest?.('a')
  if (!a) return
  e.preventDefault()
  const href = a.getAttribute('href') ?? ''
  if (/^https?:\/\//i.test(href)) invoke('open_url', { url: href }).catch(() => {})
}

/** Items from ~/.context-bar/kb, refreshed whenever the folder changes. */
export function useKb() {
  const [items, setItems] = useState<KbItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    return kbApi.list()
      .then(list => { setItems(Array.isArray(list) ? list : []); setError(null) })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()
    const unlisten = listen('kb-changed', () => { refresh() }).catch(() => () => {})
    window.addEventListener('focus', refresh)
    return () => {
      unlisten.then(fn => fn())
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  /** Apply a returned item locally so the UI doesn't wait for the watcher. */
  const upsert = useCallback((item: KbItem) => {
    setItems(prev => {
      const i = prev.findIndex(x => x.id === item.id && x.kind === item.kind)
      if (i < 0) return [item, ...prev]
      const next = prev.slice()
      next[i] = item
      return next
    })
  }, [])

  const drop = useCallback((kind: KbKind, id: string) => {
    setItems(prev => prev.filter(x => !(x.id === id && x.kind === kind)))
  }, [])

  return { items, loading, error, refresh, upsert, drop }
}

export function openTodos(items: KbItem[]): KbItem[] {
  return items.filter(i => i.kind === 'todo' && !i.done).sort((a, b) => b.created - a.created)
}

export function doneTodos(items: KbItem[]): KbItem[] {
  return items.filter(i => i.kind === 'todo' && !!i.done).sort((a, b) => (b.done ?? 0) - (a.done ?? 0))
}

export function notes(items: KbItem[]): KbItem[] {
  return items.filter(i => i.kind === 'note').sort((a, b) => b.updated - a.updated)
}

/** Body lines worth showing in a one-line preview: no blanks, rules or code fences. */
function contentLines(body: string): string[] {
  return body.split('\n').map(l => l.trim())
    .filter(l => l && !/^([-*_])(\s*\1){2,}$/.test(l) && !/^(```|~~~)/.test(l))
}

/** One markdown line as inline markdown: block markers become symbols
 *  (heading/quote dropped, bullets •, checklists ☐/☑, numbers escaped). */
export function inlineLine(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s?/, '')
    .replace(/^[-*+]\s+\[[xX]\]\s+/, '☑ ')
    .replace(/^[-*+]\s+\[ \]\s+/, '☐ ')
    .replace(/^[-*+]\s+/, '• ')
    .replace(/^(\d+)\.\s+/, '$1\\. ')
}

/** Inline markdown reduced to plain text (for titles and toasts). */
export function plainInline(s: string): string {
  return s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/\\([\\`*_{}[\]()#+\-.!~>|])/g, '$1')
}

export function noteTitle(n: KbItem): string {
  if (n.title.trim()) return n.title.trim()
  const first = contentLines(n.body)[0]
  return first ? plainInline(inlineLine(first)).slice(0, 80) : 'Untitled note'
}

/** Second content line (first when titled), as inline markdown to render. */
export function notePreview(n: KbItem): string {
  const lines = contentLines(n.body)
  const rest = n.title.trim() ? lines : lines.slice(1)
  return rest[0] ? inlineLine(rest[0]) : 'Empty'
}

/** Agents that have the context-bar skill installed. */
export function agentsWithKbSkill(agents: Agent[]): Agent[] {
  return agents.filter(a => a.installed && a.skills.some(s => s.name === KB_SKILL_NAME))
}

export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function duration(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000))
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h`
  return `${Math.round(h / 24)}d`
}

export function dayLabel(ts: number, now = new Date()): string {
  const d = new Date(ts)
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((start(now) - start(d)) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

export function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
