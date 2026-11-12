import { useState } from 'react'
import AutoTextarea from './AutoTextarea'
import {
  KB_GUIDE_DISMISSED_KEY, KB_POPOVER_TIP_KEY, ago, doneTodos, kbApi, noteTitle, notePreview, notes as notesOf, openKbInWindow, openTodos, useKb,
  type KbItem, type KbKind,
} from '../kb'

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#f59e0b"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="4" y="4" width="16" height="16" rx="3" /><polyline points="8 12 11 15 16 9" />
    </svg>
  )
}

/** Home tile: open todo count, last completion and note count. */
export function KbTile({ items, loading, onClick }: { items: KbItem[]; loading: boolean; onClick: () => void }) {
  const open = openTodos(items).length
  const lastDone = doneTodos(items)[0]
  const noteCount = notesOf(items).length
  const sub = [lastDone?.done ? `Last done ${ago(lastDone.done)}` : null, `${noteCount} note${noteCount === 1 ? '' : 's'}`]
    .filter(Boolean).join(' · ')
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-[10px] bg-[var(--c-surface)] border border-[var(--c-border-sub)] transition-[border-color,box-shadow] duration-200 hover:border-amber-500/30 hover:shadow-[0_4px_16px_rgba(245,158,11,.08)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
    >
      <div className="flex items-center gap-3 px-3.5 py-3">
        <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-[9px] bg-amber-500/10">
          <CheckIcon />
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="flex items-center gap-1.5">
            <span className="text-[19px] font-bold leading-none tracking-[-0.02em] text-amber-400">Todos &amp; Notes</span>
            {!localStorage.getItem(KB_POPOVER_TIP_KEY) && (
              <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">New</span>
            )}
          </span>
          <span className="text-[10.5px] text-[var(--c-text-3)] leading-[1.3] truncate">{sub}</span>
        </div>
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
          {loading
            ? <div className="w-10 h-4 rounded bg-[var(--c-skeleton)] animate-pulse" />
            : <span className="text-[13px] font-bold text-[var(--c-text)] tabular-nums">{open} open</span>}
        </div>
      </div>
    </button>
  )
}

/** Bottom bar on the home view. Tab switches between Todo and Note. */
export function QuickAdd({ onAdded }: { onAdded: (item: KbItem) => void }) {
  const [kind, setKind] = useState<KbKind>('todo')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    const v = text.trim()
    if (!v) return
    const op = kind === 'todo' ? kbApi.createTodo(v) : kbApi.create('note', '', v)
    op.then(item => { onAdded(item); setText(''); setError(null) }).catch(e => setError(String(e)))
  }

  const segBtn = (k: KbKind, label: string) => (
    <button
      type="button"
      onClick={() => setKind(k)}
      aria-pressed={kind === k}
      className={`text-[11px] px-2 py-1 ${kind === k ? 'bg-[var(--c-accent)]/20 text-[var(--c-accent)]' : 'text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="border-t border-[var(--c-border)] px-3 py-2 flex-shrink-0">
      <div className="flex items-start gap-2">
        <div className="flex rounded-md border border-[var(--c-border)] overflow-hidden flex-shrink-0">
          {segBtn('todo', 'Todo')}
          {segBtn('note', 'Note')}
        </div>
        <AutoTextarea
          value={text}
          onChange={e => setText(e.target.value)}
          onSubmit={submit}
          maxRows={4}
          onKeyDown={e => {
            if (e.key === 'Tab') { e.preventDefault(); setKind(k => (k === 'todo' ? 'note' : 'todo')) }
          }}
          title="Enter saves · Shift+Enter adds a line · Tab switches Todo/Note"
          placeholder={kind === 'todo' ? 'Add a todo… (Enter)' : 'Jot a note… (Enter)'}
          aria-label={kind === 'todo' ? 'Add a todo' : 'Jot a note'}
          className="flex-1 min-w-0 bg-transparent text-[12.5px] leading-[18px] py-0.5 outline-none placeholder:text-[var(--c-text-3)]"
        />
      </div>
      {error && <p className="text-[11px] text-rose-400 mt-1">{error}</p>}
    </div>
  )
}

/** Popover view: open todos (add, complete) and notes (open in window). */
export default function KbPopoverView() {
  const { items, loading, upsert } = useKb()
  const [seg, setSeg] = useState<'todos' | 'notes'>('todos')
  const [text, setText] = useState('')
  const [tip, setTip] = useState(() => !localStorage.getItem(KB_POPOVER_TIP_KEY))
  const dismissTip = () => { localStorage.setItem(KB_POPOVER_TIP_KEY, '1'); setTip(false) }
  const open = openTodos(items)
  const done = doneTodos(items)
  const noteList = notesOf(items)

  const add = () => {
    const v = text.trim()
    if (!v) return
    const op = seg === 'todos' ? kbApi.createTodo(v) : kbApi.create('note', '', v)
    op.then(item => { upsert(item); setText('') }).catch(() => {})
  }

  const segBtn = (id: 'todos' | 'notes', label: string) => (
    <button
      onClick={() => setSeg(id)}
      aria-pressed={seg === id}
      className={`text-[11.5px] px-2.5 py-1 ${seg === id ? 'bg-[var(--c-accent)]/20 text-[var(--c-accent)]' : 'text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
        {tip && (
          <div role="note" className="mb-2 rounded-lg border border-[var(--c-accent)]/30 bg-[var(--c-accent)]/[0.07] p-2.5 text-[11.5px]">
            <div className="flex items-start gap-2">
              <span className="flex-1 text-[var(--c-text-2)] leading-snug">
                <b className="text-[var(--c-text)] font-semibold">Share notes with all your agents.</b>{' '}
                Click Share on a note or todo and every agent reads it through the context-bar skill.
              </span>
              <button onClick={dismissTip} aria-label="Dismiss tip" className="text-[var(--c-text-3)] hover:text-[var(--c-text)]">✕</button>
            </div>
            <button
              onClick={() => { localStorage.removeItem(KB_GUIDE_DISMISSED_KEY); dismissTip(); openKbInWindow('notes') }}
              className="mt-1.5 text-[var(--c-accent)] font-medium hover:underline"
            >
              Learn how ⤢
            </button>
          </div>
        )}
        <div className="flex rounded-md border border-[var(--c-border)] overflow-hidden self-start mb-2">
          {segBtn('todos', `Todos ${open.length}`)}
          {segBtn('notes', `Notes ${noteList.length}`)}
        </div>
        <AutoTextarea
          value={text}
          onChange={e => setText(e.target.value)}
          onSubmit={add}
          title="Enter saves · Shift+Enter adds a line"
          placeholder={seg === 'todos' ? 'Add a todo… (Enter)' : 'Jot a note… (Enter)'}
          aria-label={seg === 'todos' ? 'Add a todo' : 'Jot a note'}
          className="mb-1.5 px-2.5 py-1.5 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] text-[12.5px] leading-[18px] outline-none focus:border-[var(--c-accent)]"
        />
        {seg === 'todos' ? (
          <>
            {!loading && open.length === 0 && <p className="text-[12px] text-[var(--c-text-3)] py-2">All done. Nothing open.</p>}
            {open.map(t => (
              <div key={t.id} className="flex items-center gap-2.5 py-1.5 border-b border-[var(--c-border)]/50">
                <button
                  onClick={() => kbApi.setDone(t.id, true).then(upsert).catch(() => {})}
                  aria-label={`Mark done: ${t.title}`}
                  className="w-3.5 h-3.5 shrink-0 rounded border border-[var(--c-text-3)] hover:border-emerald-400 hover:bg-emerald-500/10"
                />
                <span className="flex-1 min-w-0 flex items-center gap-1" title={t.body || undefined}>
                  <span className="truncate text-[13px]">{t.title}</span>
                  {t.body.trim() && <span className="shrink-0 text-[11px] text-[var(--c-text-3)]" aria-label="Has details">≡</span>}
                </span>
                {t.shared && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Shared with agents" />}
                <span className="text-[10.5px] text-[var(--c-text-3)] tabular-nums shrink-0">{ago(t.created)}</span>
              </div>
            ))}
            {done.length > 0 && (
              <button
                onClick={() => openKbInWindow('todos')}
                className="mt-2 self-start text-[10.5px] font-mono uppercase tracking-wider text-[var(--c-text-3)] hover:text-[var(--c-text-2)]"
              >
                ▶ Archived ({done.length}) · last {ago(done[0].done!)}
              </button>
            )}
          </>
        ) : (
          <>
            {!loading && noteList.length === 0 && <p className="text-[12px] text-[var(--c-text-3)] py-2">No notes yet.</p>}
            {noteList.map(n => (
              <button
                key={n.id}
                onClick={() => openKbInWindow('notes', n.id)}
                className="text-left py-1.5 border-b border-[var(--c-border)]/50 hover:bg-[var(--c-surface-2)] rounded px-1"
              >
                <div className="truncate text-[13px] font-medium">{noteTitle(n)}</div>
                <div className="truncate text-[11px] text-[var(--c-text-3)]">Edited {ago(n.updated)} · {notePreview(n)}</div>
              </button>
            ))}
          </>
        )}
      </div>
      <div className="border-t border-[var(--c-border)] px-3 py-2 flex items-center justify-between text-[11px] text-[var(--c-text-3)] flex-shrink-0">
        <span>{seg === 'todos' ? `${open.length} open · ${done.length} archived` : `${noteList.length} notes`}</span>
        <button onClick={() => openKbInWindow(seg)} className="text-[var(--c-accent)] hover:underline">Open in window ⤢</button>
      </div>
    </div>
  )
}
