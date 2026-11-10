import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Agent } from '../types'
import {
  ago, agentsWithKbSkill, dayLabel, doneTodos, duration, kbApi, noteTitle, notePreview, notes as notesOf,
  openTodos, timeLabel, useKb, type KbHistoryEvent, type KbItem, type KbKind,
} from '../kb'

export type KbTab = 'todos' | 'notes' | 'history'

/** Shared with the popover: it sets these before opening this window. */
export const KB_TAB_KEY = 'contextbar:kb:tab'
export const KB_NOTE_KEY = 'contextbar:kb:note'

function readTab(): KbTab {
  const t = localStorage.getItem(KB_TAB_KEY)
  return t === 'notes' || t === 'history' ? t : 'todos'
}

interface Undo { message: string; run: () => Promise<unknown> }

export default function KbSection({ agents, repoNames, showToast }: {
  agents: Agent[]
  repoNames: string[]
  showToast: (type: 'success' | 'error', message: string) => void
}) {
  const { items, loading, error, upsert, drop } = useKb()
  const [tab, setTabState] = useState<KbTab>(readTab)
  const [undo, setUndo] = useState<Undo | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const setTab = useCallback((t: KbTab) => {
    localStorage.setItem(KB_TAB_KEY, t)
    setTabState(t)
  }, [])

  // The popover writes the tab key before focusing this window.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === KB_TAB_KEY) setTabState(readTab()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const offerUndo = useCallback((u: Undo) => {
    clearTimeout(undoTimer.current)
    setUndo(u)
    undoTimer.current = setTimeout(() => setUndo(null), 5000)
  }, [])

  const fail = useCallback((e: unknown) => showToast('error', String(e)), [showToast])

  const open = useMemo(() => openTodos(items), [items])
  const done = useMemo(() => doneTodos(items), [items])
  const noteList = useMemo(() => notesOf(items), [items])
  const shared = items.filter(i => i.shared && !(i.kind === 'todo' && i.done)).length

  const tagSuggestions = useMemo(() => {
    const ids = agents.filter(a => a.installed).map(a => `agent:${a.id}`)
    return ['global', ...repoNames.map(r => `repo:${r.toLowerCase()}`), ...ids]
  }, [agents, repoNames])

  const complete = useCallback((t: KbItem, isDone: boolean) => {
    kbApi.setDone(t.id, isDone).then(item => {
      upsert(item)
      if (isDone) offerUndo({ message: `Done: ${t.title}`, run: () => kbApi.setDone(t.id, false).then(upsert) })
    }).catch(fail)
  }, [upsert, offerUndo, fail])

  const remove = useCallback((item: KbItem) => {
    kbApi.remove(item.kind, item.id).then(() => {
      drop(item.kind, item.id)
      offerUndo({
        message: `Deleted ${item.kind === 'todo' ? item.title : noteTitle(item)}`,
        run: () => kbApi.undelete(item.kind, item.id).then(upsert),
      })
    }).catch(fail)
  }, [drop, upsert, offerUndo, fail])

  const patch = useCallback((item: KbItem, p: Parameters<typeof kbApi.update>[2]) => {
    return kbApi.update(item.kind, item.id, p).then(upsert).catch(fail)
  }, [upsert, fail])

  const tabBtn = (id: KbTab, label: string, count?: number) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className={`text-[13px] px-3 py-1.5 border-b-2 -mb-px transition-colors ${tab === id ? 'border-[var(--c-accent)] text-[var(--c-text)] font-medium' : 'border-transparent text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
    >
      {label}{count !== undefined && <span className="ml-1.5 text-[11.5px] text-[var(--c-text-3)] tabular-nums">{count}</span>}
    </button>
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <div className="px-6 pt-5 pb-2 flex-shrink-0">
        <h2 className="text-[17px] font-semibold tracking-tight">Notes &amp; Todos</h2>
        <p className="text-[13px] text-[var(--c-text-3)] mt-0.5">
          Saved as markdown in ~/.context-bar/kb. Share an item to let your agents read it.
        </p>
      </div>
      <SkillBanner agents={agents} sharedCount={shared} showToast={showToast} />
      <div className="px-6 flex gap-1 border-b border-[var(--c-border)] flex-shrink-0">
        {tabBtn('todos', 'Todos', open.length)}
        {tabBtn('notes', 'Notes', noteList.length)}
        {tabBtn('history', 'History')}
      </div>
      {error && <p className="px-6 pt-3 text-[13px] text-rose-400">{error}</p>}
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === 'todos' && (
          <TodosTab
            open={open} done={done} loading={loading} tagSuggestions={tagSuggestions}
            onAdd={(title, tags) => kbApi.create('todo', title, '', tags).then(upsert).catch(fail)}
            onComplete={complete} onRemove={remove} onPatch={patch}
          />
        )}
        {tab === 'notes' && (
          <NotesTab
            notes={noteList} tagSuggestions={tagSuggestions}
            onCreate={() => kbApi.create('note', '', '').then(n => { upsert(n); return n }).catch(e => { fail(e); return null })}
            onRemove={remove} onPatch={patch}
          />
        )}
        {tab === 'history' && <HistoryTab refreshKey={items} />}
      </div>
      {undo && (
        <div role="status" className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg px-3.5 py-2 text-[13px] shadow-xl animate-toast-in">
          <span className="text-[var(--c-text-2)] max-w-[360px] truncate">{undo.message}</span>
          <button
            className="text-[var(--c-accent)] font-medium hover:underline"
            onClick={() => { const u = undo; setUndo(null); u.run().catch(fail) }}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  )
}

// ── Agent skill banner ───────────────────────────────────────────────────────

function SkillBanner({ agents, sharedCount, showToast }: {
  agents: Agent[]
  sharedCount: number
  showToast: (type: 'success' | 'error', message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const withSkill = agentsWithKbSkill(agents)
  const candidates = agents.filter(a => a.installed && a.supportsSkills)
  const missing = candidates.filter(a => !withSkill.some(w => w.id === a.id))

  const install = () => {
    setBusy(true)
    kbApi.installSkill(missing.map(a => a.id))
      .then(paths => showToast('success', `Installed the context-bar skill for ${paths.length} agent${paths.length === 1 ? '' : 's'}`))
      .catch(e => showToast('error', String(e)))
      .finally(() => setBusy(false))
  }

  if (sharedCount === 0 && withSkill.length === 0) return null
  return (
    <div className="mx-6 mb-3 flex items-center gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 px-3.5 py-2 text-[12.5px]">
      <span className="flex-1 text-[var(--c-text-2)]">
        {sharedCount} item{sharedCount === 1 ? '' : 's'} shared.{' '}
        {withSkill.length === 0
          ? 'Agents need the context-bar skill to read them.'
          : `Readable by ${withSkill.map(a => a.name).join(', ')} via the context-bar skill.`}
      </span>
      {missing.length > 0 && (
        <button
          onClick={install}
          disabled={busy}
          title={`Adds a context-bar skill to: ${missing.map(a => a.name).join(', ')}`}
          className="shrink-0 px-2.5 py-1 rounded-md bg-[var(--c-accent)]/15 text-[var(--c-accent)] font-medium hover:bg-[var(--c-accent)]/25 disabled:opacity-50"
        >
          {busy ? 'Installing…' : withSkill.length === 0 ? 'Install skill' : `Add to ${missing.length} more`}
        </button>
      )}
    </div>
  )
}

// ── Shared bits ──────────────────────────────────────────────────────────────

function ShareToggle({ item, onPatch }: { item: KbItem; onPatch: (i: KbItem, p: { shared: boolean }) => unknown }) {
  return (
    <button
      onClick={() => onPatch(item, { shared: !item.shared })}
      aria-pressed={item.shared}
      title={item.shared ? 'Shared with agents. Click to make private.' : 'Private. Click to share with agents.'}
      className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full border transition-colors ${item.shared ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-[var(--c-border)] text-[var(--c-text-3)] opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-[var(--c-text-2)]'}`}
    >
      {item.shared ? 'Shared' : 'Share'}
    </button>
  )
}

function TagEditor({ tags, suggestions, onChange, compact }: {
  tags: string[]
  suggestions: string[]
  onChange: (tags: string[]) => void
  compact?: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState('')
  const listId = useMemo(() => `kb-tags-${Math.random().toString(36).slice(2)}`, [])
  const commit = () => {
    const t = value.trim().toLowerCase()
    if (t && !tags.includes(t)) onChange([...tags, t])
    setValue('')
    setAdding(false)
  }
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {tags.map(t => (
        <span key={t} className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-[var(--c-surface-2)] text-[var(--c-text-2)]">
          {t}
          <button onClick={() => onChange(tags.filter(x => x !== t))} aria-label={`Remove tag ${t}`} className="text-[var(--c-text-3)] hover:text-[var(--c-text)]">×</button>
        </span>
      ))}
      {adding ? (
        <>
          <input
            autoFocus list={listId} value={value} onChange={e => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setValue(''); setAdding(false) } }}
            placeholder="global, repo:name, agent:id"
            className="text-[11px] w-40 px-1.5 py-0.5 rounded border border-[var(--c-border)] bg-transparent outline-none focus:border-[var(--c-accent)]"
          />
          <datalist id={listId}>{suggestions.filter(s => !tags.includes(s)).map(s => <option key={s} value={s} />)}</datalist>
        </>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className={`text-[11px] px-1.5 py-0.5 rounded text-[var(--c-text-3)] hover:text-[var(--c-text-2)] ${compact ? 'opacity-0 group-hover:opacity-100 focus:opacity-100' : ''}`}
        >
          + tag
        </button>
      )}
    </span>
  )
}

// ── Todos ────────────────────────────────────────────────────────────────────

function TodosTab({ open, done, loading, tagSuggestions, onAdd, onComplete, onRemove, onPatch }: {
  open: KbItem[]
  done: KbItem[]
  loading: boolean
  tagSuggestions: string[]
  onAdd: (title: string, tags: string[]) => unknown
  onComplete: (t: KbItem, done: boolean) => void
  onRemove: (t: KbItem) => void
  onPatch: (t: KbItem, p: Parameters<typeof kbApi.update>[2]) => unknown
}) {
  const [text, setText] = useState('')
  const [archOpen, setArchOpen] = useState(false)
  const add = () => {
    const t = text.trim()
    if (!t) return
    onAdd(t, [])
    setText('')
  }
  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      <input
        autoFocus value={text} onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') add() }}
        placeholder="Add a todo and press Enter"
        className="w-full mb-3 px-3 py-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] text-[14px] outline-none focus:border-[var(--c-accent)]"
      />
      {!loading && open.length === 0 && <p className="text-[13px] text-[var(--c-text-3)] py-3">All done. Nothing open.</p>}
      {open.map(t => (
        <TodoRow key={t.id} todo={t} tagSuggestions={tagSuggestions} onComplete={onComplete} onRemove={onRemove} onPatch={onPatch} />
      ))}
      <button
        onClick={() => setArchOpen(o => !o)}
        className="mt-4 flex items-center gap-1.5 text-[12px] font-mono uppercase tracking-wider text-[var(--c-text-3)] hover:text-[var(--c-text-2)]"
        aria-expanded={archOpen}
      >
        <span className={`inline-block transition-transform ${archOpen ? 'rotate-90' : ''}`}>▶</span>
        Archived ({done.length})
      </button>
      {archOpen && (done.length === 0
        ? <p className="text-[13px] text-[var(--c-text-3)] py-2">Nothing archived yet.</p>
        : done.map(t => (
          <div key={t.id} className="group flex items-center gap-3 py-2 border-b border-[var(--c-border)]/50">
            <span className="w-4 h-4 rounded border border-emerald-500/50 bg-emerald-500/15 text-emerald-400 text-[10px] flex items-center justify-center">✓</span>
            <span className="flex-1 min-w-0 truncate text-[13.5px] text-[var(--c-text-3)] line-through">{t.title}</span>
            <span className="text-[11.5px] text-[var(--c-text-3)] tabular-nums" title={new Date(t.done!).toLocaleString()}>
              Done {dayLabel(t.done!)} {timeLabel(t.done!)} · open {duration(t.done! - t.created)}
            </span>
            <button onClick={() => onComplete(t, false)} className="text-[12px] text-[var(--c-accent)] hover:underline">Restore</button>
            <button onClick={() => onRemove(t)} aria-label="Delete" className="text-[12px] text-[var(--c-text-3)] hover:text-rose-400 opacity-0 group-hover:opacity-100">Delete</button>
          </div>
        )))}
    </div>
  )
}

function TodoRow({ todo, tagSuggestions, onComplete, onRemove, onPatch }: {
  todo: KbItem
  tagSuggestions: string[]
  onComplete: (t: KbItem, done: boolean) => void
  onRemove: (t: KbItem) => void
  onPatch: (t: KbItem, p: Parameters<typeof kbApi.update>[2]) => unknown
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(todo.title)
  const save = () => {
    setEditing(false)
    const t = draft.trim()
    if (t && t !== todo.title) onPatch(todo, { title: t })
    else setDraft(todo.title)
  }
  return (
    <div className="group flex items-center gap-3 py-2 border-b border-[var(--c-border)]/50">
      <button
        onClick={() => onComplete(todo, true)}
        aria-label="Mark done"
        className="w-4 h-4 shrink-0 rounded border border-[var(--c-text-3)] hover:border-emerald-400 hover:bg-emerald-500/10 transition-colors"
      />
      {editing ? (
        <input
          autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(todo.title); setEditing(false) } }}
          className="flex-1 min-w-0 text-[14px] bg-transparent outline-none border-b border-[var(--c-accent)]"
        />
      ) : (
        <span onDoubleClick={() => setEditing(true)} className="flex-1 min-w-0 truncate text-[14px]" title={todo.body || 'Double-click to edit'}>
          {todo.title}
        </span>
      )}
      {todo.source && <span className="text-[11px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400" title="Added by an agent">{todo.source.replace(/^agent:/, '')}</span>}
      <TagEditor compact tags={todo.tags} suggestions={tagSuggestions} onChange={tags => onPatch(todo, { tags })} />
      <ShareToggle item={todo} onPatch={onPatch} />
      <span className="text-[11.5px] text-[var(--c-text-3)] tabular-nums shrink-0" title={`Created ${new Date(todo.created).toLocaleString()}`}>{ago(todo.created)}</span>
      <button onClick={() => onRemove(todo)} aria-label="Delete" className="text-[12px] text-[var(--c-text-3)] hover:text-rose-400 opacity-0 group-hover:opacity-100 focus:opacity-100">✕</button>
    </div>
  )
}

// ── Notes ────────────────────────────────────────────────────────────────────

const AUTOSAVE_MS = 600

function NotesTab({ notes, tagSuggestions, onCreate, onRemove, onPatch }: {
  notes: KbItem[]
  tagSuggestions: string[]
  onCreate: () => Promise<KbItem | null>
  onRemove: (n: KbItem) => void
  onPatch: (n: KbItem, p: Parameters<typeof kbApi.update>[2]) => Promise<unknown>
}) {
  const [activeId, setActiveId] = useState<string | null>(() => localStorage.getItem(KB_NOTE_KEY))
  const active = notes.find(n => n.id === activeId) ?? notes[0] ?? null

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === KB_NOTE_KEY) setActiveId(e.newValue) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const select = (id: string) => { localStorage.setItem(KB_NOTE_KEY, id); setActiveId(id) }

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="w-64 shrink-0 border-r border-[var(--c-border)] flex flex-col overflow-hidden">
        <button
          onClick={() => onCreate().then(n => { if (n) select(n.id) })}
          className="m-3 px-3 py-1.5 rounded-lg border border-dashed border-[var(--c-border)] text-[13px] text-[var(--c-text-2)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"
        >
          + New note
        </button>
        <div className="flex-1 overflow-y-auto">
          {notes.length === 0 && <p className="px-4 text-[13px] text-[var(--c-text-3)]">No notes yet.</p>}
          {notes.map(n => (
            <button
              key={n.id}
              onClick={() => select(n.id)}
              className={`w-full text-left px-4 py-2.5 border-b border-[var(--c-border)]/40 ${active?.id === n.id ? 'bg-[var(--c-accent)]/10' : 'hover:bg-[var(--c-surface-2)]'}`}
            >
              <div className="flex items-center gap-1.5">
                <span className="flex-1 truncate text-[13.5px] font-medium">{noteTitle(n)}</span>
                {n.shared && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Shared with agents" />}
              </div>
              <div className="truncate text-[12px] text-[var(--c-text-3)]">{ago(n.updated)} · {notePreview(n)}</div>
            </button>
          ))}
        </div>
      </div>
      {active
        ? <NoteEditor key={active.id} note={active} tagSuggestions={tagSuggestions} onRemove={onRemove} onPatch={onPatch} />
        : <div className="flex-1 flex items-center justify-center text-[13px] text-[var(--c-text-3)]">Select or create a note.</div>}
    </div>
  )
}

function NoteEditor({ note, tagSuggestions, onRemove, onPatch }: {
  note: KbItem
  tagSuggestions: string[]
  onRemove: (n: KbItem) => void
  onPatch: (n: KbItem, p: Parameters<typeof kbApi.update>[2]) => Promise<unknown>
}) {
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [status, setStatus] = useState<'saved' | 'dirty' | 'saving'>('saved')
  const pending = useRef<{ title: string; body: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const noteRef = useRef(note)
  noteRef.current = note

  // Pick up outside edits (another window, an editor) while not typing.
  useEffect(() => {
    if (status !== 'saved') return
    setTitle(note.title)
    setBody(note.body)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.title, note.body])

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const p = pending.current
    if (!p) return
    pending.current = null
    setStatus('saving')
    onPatch(noteRef.current, p).finally(() => setStatus(s => (s === 'saving' ? 'saved' : s)))
  }, [onPatch])

  useEffect(() => () => flush(), [flush])

  const edit = (next: { title: string; body: string }) => {
    setTitle(next.title)
    setBody(next.body)
    pending.current = next
    setStatus('dirty')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, AUTOSAVE_MS)
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden px-6 py-4">
      <input
        value={title} onChange={e => edit({ title: e.target.value, body })} onBlur={flush}
        placeholder="Title"
        className="text-[18px] font-semibold bg-transparent outline-none mb-1"
      />
      <div className="flex items-center gap-3 flex-wrap text-[11.5px] text-[var(--c-text-3)] mb-3">
        <span>Created {dayLabel(note.created)} {timeLabel(note.created)}</span>
        <span>Edited {ago(note.updated)}</span>
        <span className={status === 'saved' ? 'text-emerald-400/80' : ''}>{status === 'saved' ? 'Saved' : 'Saving…'}</span>
        <TagEditor tags={note.tags} suggestions={tagSuggestions} onChange={tags => onPatch(note, { tags })} />
        <span className="ml-auto flex items-center gap-3">
          <span className="group"><ShareToggle item={note} onPatch={onPatch} /></span>
          <button onClick={() => { pending.current = null; onRemove(note) }} className="text-rose-400/80 hover:text-rose-400">Delete</button>
        </span>
      </div>
      <textarea
        value={body} onChange={e => edit({ title, body: e.target.value })} onBlur={flush}
        placeholder="Write something… Markdown is fine; agents read it as-is."
        className="flex-1 resize-none bg-transparent outline-none text-[14px] leading-relaxed font-mono"
      />
    </div>
  )
}

// ── History ──────────────────────────────────────────────────────────────────

const ACTION_LABEL: Record<KbHistoryEvent['action'], [string, string]> = {
  created: ['bg-[var(--c-accent)]', 'Added'],
  edited: ['bg-zinc-400', 'Edited'],
  done: ['bg-emerald-400', 'Completed'],
  reopened: ['bg-amber-400', 'Restored'],
  deleted: ['bg-rose-400', 'Deleted'],
  restored: ['bg-amber-400', 'Undeleted'],
  shared: ['bg-emerald-400', 'Shared'],
  unshared: ['bg-zinc-400', 'Made private'],
}

function HistoryTab({ refreshKey }: { refreshKey: unknown }) {
  const [events, setEvents] = useState<KbHistoryEvent[]>([])
  const [filter, setFilter] = useState<'all' | KbKind>('all')

  useEffect(() => {
    kbApi.history(1000).then(setEvents).catch(() => setEvents([]))
  }, [refreshKey])

  const shown = events.filter(e => filter === 'all' || e.kind === filter)
  let lastDay = ''
  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      <div className="flex gap-2 mb-3">
        {([['all', 'All'], ['todo', 'Todos'], ['note', 'Notes']] as const).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`text-[12px] px-3 py-1 rounded-full border transition-colors ${filter === k ? 'border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
          >
            {l}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="text-[13px] text-[var(--c-text-3)]">No activity yet.</p>}
      {shown.map((e, i) => {
        const day = dayLabel(e.ts)
        const header = day !== lastDay
        lastDay = day
        const [dot, label] = ACTION_LABEL[e.action] ?? ['bg-zinc-400', e.action]
        return (
          <div key={`${e.ts}-${e.id}-${i}`}>
            {header && <div className="text-[11.5px] font-mono uppercase tracking-wider text-[var(--c-text-3)] mt-3 mb-1">{day}</div>}
            <div className="flex items-center gap-3 py-1 text-[13px]">
              <span className="w-16 shrink-0 text-[12px] text-[var(--c-text-3)] tabular-nums">{timeLabel(e.ts)}</span>
              <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
              <span className="min-w-0 truncate text-[var(--c-text-2)]">
                {label} {e.kind} <b className="text-[var(--c-text)] font-medium">{e.title}</b>
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
