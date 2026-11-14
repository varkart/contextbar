import { useMemo, useState } from 'react'
import AutoTextarea from './AutoTextarea'
import InlineMarkdown from './InlineMarkdown'
import KbFilterBar from './KbFilterBar'
import Markdown from './Markdown'
import KbSharePill from './KbSharePill'
import type { Agent } from '../types'
import {
  KB_GUIDE_DISMISSED_KEY, KB_POPOVER_TIP_KEY, ago, allTags, openLinkFromClick, liveQuery, queryKb, useKbQuery, usePaged, doneTodos, kbApi, noteTitle, notePreview, notes as notesOf, openKbInWindow, openTodos, useKb,
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
            if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); setKind(k => (k === 'todo' ? 'note' : 'todo')) }
          }}
          title="Enter saves · Shift+Enter adds a line · Tab switches Todo/Note · Shift+Tab leaves"
          placeholder={kind === 'todo' ? 'Add a todo… (Enter)' : 'Jot a note… (Enter)'}
          aria-label={kind === 'todo' ? 'Add a todo' : 'Jot a note'}
          className="flex-1 min-w-0 bg-transparent text-[12.5px] leading-[18px] py-0.5 outline-none placeholder:text-[var(--c-text-3)]"
        />
      </div>
      {error && <p className="text-[11px] text-rose-400 mt-1">{error}</p>}
    </div>
  )
}

const POPOVER_PAGE = 20

const toggle = (onChange: (i: KbItem) => void) => (item: KbItem) =>
  kbApi.update(item.kind, item.id, { shared: !item.shared }).then(onChange).catch(() => {})

/** Expanded body: rendered markdown, tags, and a way to edit in the window. */
function Expanded({ item, onEdit }: { item: KbItem; onEdit: () => void }) {
  return (
    <div className="pl-6 pr-1 pb-2">
      {item.body.trim() ? (
        <div onClick={openLinkFromClick} className="kb-note-preview kb-pop-md max-h-56 overflow-y-auto rounded-md bg-[var(--c-surface)] border border-[var(--c-border-sub)] px-2.5 py-1.5">
          <Markdown>{item.body}</Markdown>
        </div>
      ) : (
        <p className="text-[11.5px] text-[var(--c-text-3)]">{item.kind === 'todo' ? 'No details.' : 'Empty note.'}</p>
      )}
      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
        {item.tags.map(t => <span key={t} className="text-[10px] px-1.5 py-px rounded bg-[var(--c-surface-2)] text-[var(--c-text-3)]">{t}</span>)}
        <button onClick={onEdit} className="ml-auto text-[11px] text-[var(--c-accent)] hover:underline">Edit in window ⤢</button>
      </div>
    </div>
  )
}

function TodoItem({ t, agents, onChange }: { t: KbItem; agents: Agent[]; onChange: (i: KbItem) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-[var(--c-border)]/50">
      <div className="group flex items-center gap-2.5 py-1.5">
        <button
          onClick={() => kbApi.setDone(t.id, true).then(onChange).catch(() => {})}
          aria-label={`Mark done: ${t.title}`}
          className="w-3.5 h-3.5 shrink-0 rounded border border-[var(--c-text-3)] hover:border-emerald-400 hover:bg-emerald-500/10"
        />
        <button
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="flex-1 min-w-0 flex items-center gap-1 text-left"
          title={open ? 'Collapse' : 'Expand'}
        >
          <span className="truncate text-[13px]">{t.title}</span>
          {t.body.trim() && <span className="shrink-0 text-[11px] text-[var(--c-text-3)]" aria-label="Has details">≡</span>}
        </button>
        <KbSharePill compact item={t} agents={agents} onToggle={toggle(onChange)} />
        <span className="text-[10.5px] text-[var(--c-text-3)] tabular-nums shrink-0">{ago(t.created)}</span>
      </div>
      {open && <Expanded item={t} onEdit={() => openKbInWindow('todos')} />}
    </div>
  )
}

function NoteItem({ n, agents, onChange }: { n: KbItem; agents: Agent[]; onChange: (i: KbItem) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-[var(--c-border)]/50">
      <div className="group flex items-start gap-2 py-1.5">
        <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex-1 min-w-0 text-left px-1 rounded hover:bg-[var(--c-surface-2)]">
          <div className="truncate text-[13px] font-medium">{noteTitle(n)}</div>
          {!open && (
            <div className="truncate text-[11px] text-[var(--c-text-3)]">
              Edited {ago(n.updated)} · <InlineMarkdown>{notePreview(n)}</InlineMarkdown>
            </div>
          )}
        </button>
        <span className="pt-0.5"><KbSharePill compact item={n} agents={agents} onToggle={toggle(onChange)} /></span>
      </div>
      {open && <Expanded item={n} onEdit={() => openKbInWindow('notes', n.id)} />}
    </div>
  )
}

/** Popover view: todos and notes with search, filters, sort, paging,
 *  expandable rows and sharing. */
export default function KbPopoverView({ agents = [] }: { agents?: Agent[] }) {
  const { items, loading, upsert } = useKb()
  const [seg, setSeg] = useState<'todos' | 'notes'>('todos')
  const [text, setText] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [tip, setTip] = useState(() => !localStorage.getItem(KB_POPOVER_TIP_KEY))
  const dismissTip = () => { localStorage.setItem(KB_POPOVER_TIP_KEY, '1'); setTip(false) }
  const open = openTodos(items)
  const done = doneTodos(items)
  const noteList = notesOf(items)

  const [todoQuery, setTodoQuery] = useKbQuery('popover:todos', 'newest')
  const [noteQuery, setNoteQuery] = useKbQuery('popover:notes', 'edited')
  const setQuery = seg === 'todos' ? setTodoQuery : setNoteQuery
  const base = seg === 'todos' ? open : noteList
  const tags = useMemo(() => allTags(base), [base])
  const savedQuery = seg === 'todos' ? todoQuery : noteQuery
  const query = useMemo(() => liveQuery(savedQuery, tags), [savedQuery, tags])
  const matched = useMemo(() => queryKb(base, query), [base, query])
  const page = usePaged(matched, POPOVER_PAGE, `${seg}:${JSON.stringify(query)}`)

  const add = () => {
    const v = text.trim()
    if (!v) return
    const op = seg === 'todos' ? kbApi.createTodo(v) : kbApi.create('note', '', v)
    op.then(item => { upsert(item); setText(''); setAddError(null) }).catch(e => setAddError(String(e)))
  }

  const bulkShare = (list: KbItem[], shared: boolean) => {
    kbApi.setShared(list, shared).then(out => out.forEach(upsert)).catch(e => setAddError(String(e)))
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
      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-1 *:shrink-0">
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
        {addError && <p className="text-[11px] text-rose-400 mb-1">{addError}</p>}
        {base.length > 0 && (
          <KbFilterBar
            compact query={query} setQuery={setQuery} tags={tags}
            sorts={seg === 'todos' ? ['newest', 'oldest', 'edited', 'az'] : ['edited', 'newest', 'oldest', 'az']}
            matched={matched} total={base.length} onBulkShare={bulkShare} agents={agents}
          />
        )}
        {!loading && base.length === 0 && (
          <p className="text-[12px] text-[var(--c-text-3)] py-2">{seg === 'todos' ? 'All done. Nothing open.' : 'No notes yet.'}</p>
        )}
        {base.length > 0 && matched.length === 0 && <p className="text-[12px] text-[var(--c-text-3)] py-2">Nothing matches.</p>}
        {seg === 'todos'
          ? page.shown.map(t => <TodoItem key={t.id} t={t} agents={agents} onChange={upsert} />)
          : page.shown.map(n => <NoteItem key={n.id} n={n} agents={agents} onChange={upsert} />)}
        {page.remaining > 0 && (
          <button onClick={page.more} className="mt-1.5 self-start text-[11px] text-[var(--c-accent)] hover:underline">
            Show {Math.min(page.remaining, POPOVER_PAGE)} more ({page.remaining} hidden)
          </button>
        )}
        {seg === 'todos' && done.length > 0 && (
          <button
            onClick={() => openKbInWindow('todos')}
            className="mt-2 self-start text-[10.5px] font-mono uppercase tracking-wider text-[var(--c-text-3)] hover:text-[var(--c-text-2)]"
          >
            ▶ Archived ({done.length}) · last {ago(done[0].done!)}
          </button>
        )}
      </div>
      <div className="border-t border-[var(--c-border)] px-3 py-2 flex items-center justify-between text-[11px] text-[var(--c-text-3)] flex-shrink-0">
        <span>{seg === 'todos' ? `${open.length} open · ${done.length} archived` : `${noteList.length} notes`}</span>
        <button onClick={() => openKbInWindow(seg)} className="text-[var(--c-accent)] hover:underline">Open in window ⤢</button>
      </div>
    </div>
  )
}
