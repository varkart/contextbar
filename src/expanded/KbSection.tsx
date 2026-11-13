import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { Agent } from '../types'
import AutoTextarea from '../components/AutoTextarea'
import Markdown from '../components/Markdown'
import AgentDot from '../components/AgentDot'
import { NOTE_SHORTCUTS, NOTE_SYNTAX, markdownKey, sameSaved, type Edit } from '../noteEditing'
import {
  KB_GUIDE_DISMISSED_KEY, KB_NOTE_KEY, KB_TAB_KEY, ago, agentsWithKbSkill, dayLabel, doneTodos, duration, kbApi, noteTitle, notePreview, notes as notesOf,
  openTodos, timeLabel, useKb, type KbHistoryEvent, type KbItem, type KbKind,
} from '../kb'

export type KbTab = 'todos' | 'notes' | 'history'


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
      <AgentSharing agents={agents} sharedCount={shared} showToast={showToast} />
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
            onAdd={(text, tags) => kbApi.createTodo(text, tags).then(upsert).catch(fail)}
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

// ── Agent sharing: teaching card + compact banner ───────────────────────────

const GUIDE_KEY = KB_GUIDE_DISMISSED_KEY

/**
 * First visit: a card explaining how notes reach agents (write → share →
 * the context-bar skill reads them), with per-agent install status. Once
 * dismissed it shrinks to a one-line banner; "How sharing works" reopens it.
 */
function AgentSharing({ agents, sharedCount, showToast }: {
  agents: Agent[]
  sharedCount: number
  showToast: (type: 'success' | 'error', message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [guideOpen, setGuideOpen] = useState(() => !localStorage.getItem(GUIDE_KEY))
  // "Learn how" in the menu bar clears the key to reopen the card here.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === GUIDE_KEY && e.newValue === null) setGuideOpen(true) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
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

  const installButton = missing.length > 0 && (
    <button
      onClick={install}
      disabled={busy}
      title={`Adds a context-bar skill to: ${missing.map(a => a.name).join(', ')}`}
      className="shrink-0 px-2.5 py-1 rounded-md bg-[var(--c-accent)]/15 text-[var(--c-accent)] font-medium hover:bg-[var(--c-accent)]/25 disabled:opacity-50"
    >
      {busy ? 'Installing…' : withSkill.length === 0 ? `Install for ${missing.length} agent${missing.length === 1 ? '' : 's'}` : `Add to ${missing.length} more`}
    </button>
  )

  if (guideOpen) {
    const dismiss = () => { localStorage.setItem(GUIDE_KEY, '1'); setGuideOpen(false) }
    const steps: [string, string][] = [
      ['Write it once', 'Preferences, conventions, reminders: "Use pnpm, not npm", "Never push to main".'],
      ['Click Share', 'Items stay private until you do. Tag global, repo:<name> or agent:<id> to scope who uses it.'],
      ['Agents read it', 'The context-bar skill points every agent to your shared items, so you stop repeating yourself.'],
    ]
    return (
      <section aria-label="How sharing with agents works" className="mx-6 mb-3 rounded-xl border border-[var(--c-accent)]/30 bg-[var(--c-accent)]/[0.06] p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-1">
            <div className="text-[10.5px] font-mono uppercase tracking-wider text-[var(--c-accent)] mb-0.5">New · context-bar skill</div>
            <h3 className="text-[15px] font-semibold">One set of notes for all your agents</h3>
          </div>
          <button onClick={dismiss} aria-label="Dismiss" className="text-[var(--c-text-3)] hover:text-[var(--c-text)]">✕</button>
        </div>
        <ol className="grid grid-cols-3 gap-3 mb-3">
          {steps.map(([title, body], i) => (
            <li key={title} className="rounded-lg bg-[var(--c-surface)] border border-[var(--c-border)] p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-5 h-5 rounded-full bg-[var(--c-accent)]/20 text-[var(--c-accent)] text-[11px] font-semibold flex items-center justify-center">{i + 1}</span>
                <span className="text-[13px] font-medium">{title}</span>
              </div>
              <p className="text-[12px] text-[var(--c-text-3)] leading-snug">{body}</p>
            </li>
          ))}
        </ol>
        <div className="flex items-center gap-3 flex-wrap text-[12px]">
          {candidates.length === 0 ? (
            <span className="text-[var(--c-text-3)]">No agents with skill support detected yet.</span>
          ) : (
            <span className="flex items-center gap-2 flex-wrap flex-1">
              {candidates.map(a => {
                const has = withSkill.some(w => w.id === a.id)
                return (
                  <span key={a.id} className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${has ? 'border-emerald-500/40 text-emerald-400' : 'border-[var(--c-border)] text-[var(--c-text-3)]'}`}>
                    <AgentDot toolId={a.id} toolName={a.name} />
                    {a.name}{has ? ' ✓' : ''}
                  </span>
                )
              })}
            </span>
          )}
          {installButton}
          <button onClick={dismiss} className="text-[var(--c-text-3)] hover:text-[var(--c-text-2)]">Got it</button>
        </div>
      </section>
    )
  }

  return (
    <div className="mx-6 mb-3 flex items-center gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface-2)]/40 px-3.5 py-2 text-[12.5px]">
      <span className="flex-1 text-[var(--c-text-2)]">
        {sharedCount} item{sharedCount === 1 ? '' : 's'} shared.{' '}
        {withSkill.length === 0
          ? 'Agents need the context-bar skill to read them.'
          : `Readable by ${withSkill.map(a => a.name).join(', ')} via the context-bar skill.`}
      </span>
      <button onClick={() => setGuideOpen(true)} className="shrink-0 text-[var(--c-text-3)] hover:text-[var(--c-text-2)] underline-offset-2 hover:underline">
        How sharing works
      </button>
      {installButton}
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
  // Enter/Escape close the input; a blur fired as it unmounts must not
  // commit again (or commit a cancelled tag).
  const closed = useRef(false)
  const open = () => { closed.current = false; setAdding(true) }
  const commit = () => {
    if (closed.current) return
    closed.current = true
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
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { e.preventDefault(); closed.current = true; setValue(''); setAdding(false) } }}
            placeholder="global, repo:name, agent:id"
            className="text-[11px] w-40 px-1.5 py-0.5 rounded border border-[var(--c-border)] bg-transparent outline-none focus:border-[var(--c-accent)]"
          />
          <datalist id={listId}>{suggestions.filter(s => !tags.includes(s)).map(s => <option key={s} value={s} />)}</datalist>
        </>
      ) : (
        <button
          onClick={open}
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
      <AutoTextarea
        autoFocus value={text} onChange={e => setText(e.target.value)} onSubmit={add}
        placeholder="Add a todo and press Enter"
        title="Enter saves · Shift+Enter adds a line (extra lines become details)"
        className="w-full mb-3 px-3 py-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] text-[14px] leading-5 outline-none focus:border-[var(--c-accent)]"
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
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState(todo.title)
  const hasDetails = !!todo.body.trim()
  const closed = useRef(false)
  const startEdit = () => { closed.current = false; setDraft(todo.title); setEditing(true) }
  const save = () => {
    if (closed.current) return
    closed.current = true
    setEditing(false)
    const t = draft.trim()
    if (t && t !== todo.title) onPatch(todo, { title: t })
    else setDraft(todo.title)
  }
  return (
    <div className="border-b border-[var(--c-border)]/50">
    <div className="group flex items-center gap-3 py-2">
      <button
        onClick={() => onComplete(todo, true)}
        aria-label="Mark done"
        className="w-4 h-4 shrink-0 rounded border border-[var(--c-text-3)] hover:border-emerald-400 hover:bg-emerald-500/10 transition-colors"
      />
      {editing ? (
        <input
          autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { e.preventDefault(); closed.current = true; setDraft(todo.title); setEditing(false) } }}
          className="flex-1 min-w-0 text-[14px] bg-transparent outline-none border-b border-[var(--c-accent)]"
        />
      ) : (
        <span className="flex-1 min-w-0 flex items-center gap-1.5">
          <span
            onClick={e => { if (e.detail === 1) setExpanded(x => !x) }}
            onDoubleClick={startEdit}
            className="min-w-0 truncate text-[14px] cursor-default"
            title="Click for details · double-click to rename"
          >
            {todo.title}
          </span>
          <button
            onClick={() => setExpanded(x => !x)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide details' : hasDetails ? 'Show details' : 'Add details'}
            title={hasDetails ? 'Has details' : 'Add details'}
            className={`shrink-0 text-[12px] leading-none px-1 rounded hover:text-[var(--c-text)] ${hasDetails ? 'text-[var(--c-text-3)]' : 'text-[var(--c-text-3)] opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
          >
            {hasDetails ? '≡' : '+'}
          </button>
        </span>
      )}
      {todo.source && <span className="text-[11px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400" title="Added by an agent">{todo.source.replace(/^agent:/, '')}</span>}
      <TagEditor compact tags={todo.tags} suggestions={tagSuggestions} onChange={tags => onPatch(todo, { tags })} />
      <ShareToggle item={todo} onPatch={onPatch} />
      <span className="text-[11.5px] text-[var(--c-text-3)] tabular-nums shrink-0" title={`Created ${new Date(todo.created).toLocaleString()}`}>{ago(todo.created)}</span>
      <button onClick={() => onRemove(todo)} aria-label="Delete" className="text-[12px] text-[var(--c-text-3)] hover:text-rose-400 opacity-0 group-hover:opacity-100 focus:opacity-100">✕</button>
    </div>
    {expanded && <TodoDetails todo={todo} onPatch={onPatch} />}
    </div>
  )
}

/** Markdown details under a todo: rendered, double-click (or Add details)
 *  to edit with the note shortcuts; autosaves like notes. */
function TodoDetails({ todo, onPatch }: {
  todo: KbItem
  onPatch: (t: KbItem, p: Parameters<typeof kbApi.update>[2]) => unknown
}) {
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(todo.body)
  const [dirty, setDirty] = useState(false)
  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const area = useRef<HTMLTextAreaElement>(null)
  const todoRef = useRef(todo)
  todoRef.current = todo

  useEffect(() => {
    if (dirty) return
    setBody(b => (sameSaved(b, todo.body) ? b : todo.body))
  }, [todo.body, dirty])

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const p = pending.current
    if (p === null) return
    pending.current = null
    Promise.resolve(onPatch(todoRef.current, { body: p })).finally(() => setDirty(false))
  }, [onPatch])

  useEffect(() => () => flush(), [flush])

  const change = (v: string) => {
    setBody(v)
    pending.current = v
    setDirty(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, AUTOSAVE_MS)
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); return }
    const { selectionStart: a, selectionEnd: b } = e.currentTarget
    const r = markdownKey({ ...e, isComposing: e.nativeEvent.isComposing }, body, a, b)
    if (!r) return
    e.preventDefault()
    change(r.value)
    requestAnimationFrame(() => area.current?.setSelectionRange(r.start, r.end))
  }

  if (editing) {
    return (
      <div className="pl-7 pb-3">
        <textarea
          ref={area} autoFocus value={body}
          onChange={e => change(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => { flush(); setEditing(false) }}
          rows={Math.min(14, Math.max(4, body.split('\n').length + 1))}
          placeholder="Details in markdown: ⌘B bold, ⌘I italic, - [ ] checklist, --- line"
          aria-label="Todo details"
          className="w-full resize-y px-3 py-2 rounded-lg border border-[var(--c-accent)]/60 bg-[var(--c-surface)] text-[13px] leading-relaxed font-mono outline-none"
        />
        <div className="flex items-center gap-2 mt-1 text-[11px] text-[var(--c-text-3)]">
          <span>{dirty ? 'Saving…' : 'Saved'} · Esc to finish</span>
          <span className="ml-auto"><FormatHelp align="right" /></span>
        </div>
      </div>
    )
  }
  return (
    <div className="pl-7 pb-3">
      {body.trim() ? (
        <div
          onDoubleClick={() => setEditing(true)}
          onClick={e => {
            const a = (e.target as HTMLElement).closest('a')
            if (!a) return
            e.preventDefault()
            const href = a.getAttribute('href') ?? ''
            if (/^https?:\/\//i.test(href)) invoke('open_url', { url: href }).catch(() => {})
          }}
          title="Double-click to edit"
          className="kb-note-preview rounded-lg px-3 py-2 bg-[var(--c-surface)] border border-[var(--c-border-sub)]"
        >
          <Markdown>{body}</Markdown>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="text-[12.5px] text-[var(--c-accent)] hover:underline">
          + Add details
        </button>
      )}
      {body.trim() && (
        <button onClick={() => setEditing(true)} className="mt-1 text-[11.5px] text-[var(--c-text-3)] hover:text-[var(--c-text-2)]">
          Edit details
        </button>
      )}
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
          onClick={() => {
            // Reuse an untouched empty note instead of piling up blanks.
            const blank = notes.find(n => !n.title.trim() && !n.body.trim())
            if (blank) select(blank.id)
            else onCreate().then(n => { if (n) select(n.id) })
          }}
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
  // The file keeps no trailing whitespace, so ignore differences in it;
  // otherwise a refresh after autosave would eat the space just typed.
  useEffect(() => {
    if (status !== 'saved') return
    setTitle(t => (t.trim() === note.title ? t : note.title))
    setBody(b => (sameSaved(b, note.body) ? b : note.body))
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

  const [mode, setMode] = useNoteMode()
  // A blank note opens ready to type, even if Preview was last used.
  useEffect(() => {
    if (!note.title.trim() && !note.body.trim()) setMode('edit')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const textarea = useRef<HTMLTextAreaElement>(null)

  // ⌘⇧P flips between edit and preview while a note is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setMode(mode === 'edit' ? 'preview' : 'edit')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, setMode])

  const apply = (r: Edit) => {
    edit({ title, body: r.value })
    requestAnimationFrame(() => textarea.current?.setSelectionRange(r.start, r.end))
  }

  const onBodyKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); return }
    const { selectionStart: a, selectionEnd: b } = e.currentTarget
    const r = markdownKey({ ...e, isComposing: e.nativeEvent.isComposing }, body, a, b)
    if (r) { e.preventDefault(); apply(r) }
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden px-6 py-4">
      <input
        value={title} onChange={e => edit({ title: e.target.value, body })} onBlur={flush}
        onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
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
      <div className="flex items-center gap-2 mb-2">
        <div className="flex rounded-md border border-[var(--c-border)] overflow-hidden text-[11.5px]">
          {(['edit', 'preview'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              title="⌘⇧P toggles"
              className={`px-2.5 py-0.5 capitalize ${mode === m ? 'bg-[var(--c-accent)]/20 text-[var(--c-accent)]' : 'text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
            >
              {m}
            </button>
          ))}
        </div>
        <FormatHelp />
      </div>
      {mode === 'edit' ? (
        <textarea
          ref={textarea}
          autoFocus={!note.body}
          value={body} onChange={e => edit({ title, body: e.target.value })} onBlur={flush}
          onKeyDown={onBodyKey}
          placeholder="Write something… Markdown works: ⌘B bold, ⌘I italic, --- for a line."
          className="flex-1 resize-none bg-transparent outline-none text-[14px] leading-relaxed font-mono"
        />
      ) : (
        <div
          className="flex-1 overflow-y-auto"
          onDoubleClick={() => setMode('edit')}
          onClick={e => {
            // Links must open in the browser, never navigate this window.
            const a = (e.target as HTMLElement).closest('a')
            if (!a) return
            e.preventDefault()
            const href = a.getAttribute('href') ?? ''
            if (/^https?:\/\//i.test(href)) invoke('open_url', { url: href }).catch(() => {})
          }}
          title="Double-click to edit"
        >
          {body.trim()
            ? <div className="kb-note-preview"><Markdown>{body}</Markdown></div>
            : <p className="text-[13px] text-[var(--c-text-3)]">Empty note.</p>}
        </div>
      )}
    </div>
  )
}

const NOTE_MODE_KEY = 'contextbar:kb:note-mode'

function useNoteMode() {
  const [mode, setModeState] = useState<'edit' | 'preview'>(
    () => (localStorage.getItem(NOTE_MODE_KEY) === 'preview' ? 'preview' : 'edit')
  )
  const setMode = useCallback((m: 'edit' | 'preview') => {
    localStorage.setItem(NOTE_MODE_KEY, m)
    setModeState(m)
  }, [])
  return [mode, setMode] as const
}

/** Hover/focus card listing the editor's shortcuts and markdown syntax. */
function FormatHelp({ align = 'left' }: { align?: 'left' | 'right' }) {
  return (
    <span className="relative group">
      <button
        type="button"
        // Keep focus in the editor so hovering/clicking doesn't end editing.
        onMouseDown={e => e.preventDefault()}
        aria-label="Formatting help"
        className="w-6 h-6 rounded-md border border-[var(--c-border)] text-[11px] font-semibold text-[var(--c-text-3)] hover:text-[var(--c-text-2)]"
      >
        Aa
      </button>
      <div
        role="tooltip"
        className={`invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity absolute ${align === 'right' ? 'right-0' : 'left-0'} top-8 z-20 w-72 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] shadow-xl p-3 text-[12px]`}
      >
        <div className="text-[10.5px] font-mono uppercase tracking-wider text-[var(--c-text-3)] mb-1.5">Shortcuts</div>
        {NOTE_SHORTCUTS.map(([k, v]) => (
          <div key={k} className="flex justify-between py-0.5">
            <span className="font-mono text-[var(--c-text-2)]">{v}</span>
            <kbd className="font-mono text-[var(--c-text-3)]">{k}</kbd>
          </div>
        ))}
        <div className="text-[10.5px] font-mono uppercase tracking-wider text-[var(--c-text-3)] mt-2.5 mb-1.5">Type</div>
        {NOTE_SYNTAX.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 py-0.5">
            <span className="font-mono text-[var(--c-text-2)]">{k}</span>
            <span className="text-[var(--c-text-3)] text-right">{v}</span>
          </div>
        ))}
        <p className="mt-2.5 text-[11px] text-[var(--c-text-3)]">Saved as plain markdown, so agents read it exactly as written.</p>
      </div>
    </span>
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
