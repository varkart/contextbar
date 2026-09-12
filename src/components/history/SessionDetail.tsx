import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { SessionEntry, SessionDetail as SessionDetailType, SessionMeta } from '../../types'
import { formatTokens } from './SessionStats'
import AgentBadge from './AgentBadge'
import FindInPage from '../FindInPage'
import { buildTurns, transcriptToText } from './transcript/model'
import TurnRow from './transcript/TurnRow'
import TranscriptToolbar, { type RoleFilter } from './transcript/TranscriptToolbar'

/** Inline tag chips with add/remove, persisted via set_session_tags. */
function TagEditor({ sessionId }: { sessionId: string }) {
  const [tags, setTags] = useState<string[]>([])
  const [draft, setDraft] = useState('')

  useEffect(() => {
    setDraft('')
    invoke<SessionMeta[]>('get_session_meta')
      .then(rows => setTags(rows.find(m => m.sessionId === sessionId)?.tags ?? []))
      .catch(() => setTags([]))
  }, [sessionId])

  const save = (next: string[]) => {
    setTags(next)
    invoke('set_session_tags', { sessionId, tags: next }).catch(() => {})
  }

  const addDraft = () => {
    const t = draft.trim()
    if (!t) return
    setDraft('')
    if (tags.some(x => x.toLowerCase() === t.toLowerCase())) return
    save([...tags, t])
  }

  return (
    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
      {tags.map(t => (
        <span
          key={t}
          className="text-[9.5px] px-1.5 py-px rounded-full bg-[var(--c-accent)]/10 text-[var(--c-accent)] flex items-center gap-1"
        >
          {t}
          <button
            onClick={() => save(tags.filter(x => x !== t))}
            title={`Remove tag ${t}`}
            className="opacity-60 hover:opacity-100"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') addDraft() }}
        onBlur={addDraft}
        placeholder="+ tag"
        className="w-16 bg-transparent text-[12px] text-[var(--c-text-2)] placeholder:text-[var(--c-text-3)] outline-none border-b border-transparent focus:border-[var(--c-accent)]/40"
      />
    </div>
  )
}

/** Inline custom session name — click to edit, persisted via set_session_name.
 *  Shows the agent's own title (inheritedTitle) until the user sets one. */
function NameEditor({ sessionId, fallback, inheritedTitle }: { sessionId: string; fallback: string; inheritedTitle?: string | null }) {
  const [name, setName] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    setEditing(false)
    invoke<SessionMeta[]>('get_session_meta')
      .then(rows => setName(rows.find(m => m.sessionId === sessionId)?.customName ?? null))
      .catch(() => setName(null))
  }, [sessionId])

  const save = (raw: string) => {
    const clean = raw.trim() || null
    setEditing(false)
    if (clean === name) return
    setName(clean)
    invoke('set_session_name', { sessionId, name: clean })
      .then(() => window.dispatchEvent(new CustomEvent('session-meta-changed')))
      .catch(() => {})
  }

  if (editing) {
    return (
      <input
        type="text"
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') save(draft)
          if (e.key === 'Escape') setEditing(false)
        }}
        onBlur={() => save(draft)}
        placeholder={fallback}
        maxLength={80}
        className="w-full bg-[var(--c-surface-2)] border border-[var(--c-accent)]/40 rounded px-1.5 py-0.5 text-[14px] font-medium text-[var(--c-text)] outline-none"
      />
    )
  }

  const shown = name ?? inheritedTitle
  return (
    <button
      onClick={() => { setDraft(name ?? inheritedTitle ?? ''); setEditing(true) }}
      title={shown ? 'Rename session' : 'Name this session'}
      className="group/name flex items-center gap-1.5 min-w-0 max-w-full text-left"
    >
      {shown ? (
        <>
          <span className="text-[14px] font-semibold text-[var(--c-text)] truncate">{shown}</span>
          <span className="text-[12px] text-[var(--c-text-3)] opacity-50 group-hover/name:opacity-100 group-hover/name:text-[var(--c-accent)] transition-all flex-shrink-0">✎ rename</span>
        </>
      ) : (
        <span className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-dashed border-[var(--c-accent)]/40 text-[13px] text-[var(--c-accent)] hover:bg-[var(--c-accent)]/10 transition-colors">
          ✎ Name this session
        </span>
      )}
    </button>
  )
}

interface SessionDetailProps {
  session: SessionEntry
}

export default function SessionDetail({ session }: SessionDetailProps) {
  const [detail, setDetail] = useState<SessionDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copiedPath, setCopiedPath] = useState(false)
  const [copiedAll, setCopiedAll] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [findOpen, setFindOpen] = useState(false)

  // Transcript toolbar state
  const [q, setQ] = useState('')
  const [role, setRole] = useState<RoleFilter>('all')
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [eventsOnly, setEventsOnly] = useState(false)
  const [stepsExpanded, setStepsExpanded] = useState(false)

  const turnRefs = useRef<(HTMLDivElement | null)[]>([])
  const [promptPos, setPromptPos] = useState(0)
  const promptPosRef = useRef(0)
  // While a programmatic jump's smooth-scroll is animating, the scroll
  // handler must not recompute the indicator from the moving scrollTop —
  // that's what made "2 / 44" snap back to "1 / 44".
  const suppressSyncUntil = useRef(0)

  // ⌘F opens find-in-page, scoped to this session's transcript only.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.metaKey || e.shiftKey || e.altKey || e.ctrlKey) return
      if (e.key.toLowerCase() !== 'f') return
      e.preventDefault()
      setFindOpen(true)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => { setFindOpen(false) }, [session.sessionId])

  useEffect(() => {
    setLoading(true)
    setError(null)
    setQ('')
    setRole('all')
    setErrorsOnly(false)
    setEventsOnly(false)
    setStepsExpanded(false)
    setPromptPos(0)
    promptPosRef.current = 0
    invoke<SessionDetailType>('get_session', { sessionId: session.sessionId, agent: session.agent })
      .then(d => {
        setDetail(d)
        setLoading(false)
      })
      .catch(e => {
        setError(String(e))
        setLoading(false)
      })
  }, [session.sessionId])

  const [opened, setOpened] = useState(false)

  const handleResume = async () => {
    try {
      await invoke('resume_in_terminal', { project: session.project, sessionId: session.sessionId, agent: session.agent })
      setOpened(true)
      setTimeout(() => setOpened(false), 1500)
    } catch {
      handleCopy()
    }
  }

  const handleCopy = async () => {
    try {
      const cmd = await invoke<string>('get_resume_command', { project: session.project, sessionId: session.sessionId, agent: session.agent })
      await navigator.clipboard.writeText(cmd)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard may require focus
    }
  }

  const flash = (set: (b: boolean) => void) => { set(true); setTimeout(() => set(false), 1300) }
  const copyPath = () => navigator.clipboard.writeText(session.project).then(() => flash(setCopiedPath), () => {})

  const toolCount = detail?.messages.reduce(
    (acc, m) => acc + m.content.filter(b => b.blockType === 'tool_use').length,
    0
  ) ?? 0

  const turns = useMemo(() => buildTurns(detail?.messages ?? []), [detail])
  const copyAll = () =>
    navigator.clipboard.writeText(transcriptToText(turns)).then(() => flash(setCopiedAll), () => {})

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase()
    return turns.map(t =>
      (role === 'all' || t.role === role)
      && (!errorsOnly || t.hasError)
      && (!eventsOnly || t.hasEvent)
      && (!term || t.haystack.includes(term)),
    )
  }, [turns, q, role, errorsOnly, eventsOnly])

  const visibleUserIdx = useMemo(
    () => turns.map((t, i) => (t.role === 'user' && visible[i] ? i : -1)).filter(i => i >= 0),
    [turns, visible],
  )

  const scrollToTurn = useCallback((i: number) => {
    const el = turnRefs.current[i]
    const box = scrollRef.current
    if (!el || !box) return
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
    box.scrollTo({ top: Math.max(0, top - 8), behavior: 'smooth' })
  }, [])

  const setPrompt = useCallback((p: number) => {
    promptPosRef.current = p
    setPromptPos(p)
  }, [])

  const jumpPrompt = useCallback((dir: number) => {
    if (!visibleUserIdx.length) return
    const next = Math.max(0, Math.min(visibleUserIdx.length - 1, promptPosRef.current + dir))
    suppressSyncUntil.current = performance.now() + 700
    setPrompt(next)
    scrollToTurn(visibleUserIdx[next])
  }, [visibleUserIdx, scrollToTurn, setPrompt])

  const jumpTop = useCallback(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), [])
  const jumpBottom = useCallback(
    () => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }),
    [],
  )
  const toggleSteps = useCallback(() => {
    setStepsExpanded(prev => {
      const next = !prev
      scrollRef.current
        ?.querySelectorAll<HTMLDetailsElement>('.turn:not(.hidden) details.work')
        .forEach(d => { d.open = next })
      return next
    })
  }, [])

  // Keep the "prompt N / M" indicator in step with the scroll position.
  // Rect-based (not offsetTop, whose frame depends on offsetParent) and
  // paused while a jump animates.
  const syncPromptPos = useCallback(() => {
    const box = scrollRef.current
    if (!box || !visibleUserIdx.length) return
    if (performance.now() < suppressSyncUntil.current) return
    const boxTop = box.getBoundingClientRect().top
    let pos = 0
    visibleUserIdx.forEach((idx, k) => {
      const el = turnRefs.current[idx]
      if (el && el.getBoundingClientRect().top - boxTop <= 60) pos = k
    })
    setPrompt(pos)
  }, [visibleUserIdx, setPrompt])

  // Whole-window keys for jump nav (ignored while typing in a field).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag ?? '')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '[') { e.preventDefault(); jumpPrompt(-1) }
      else if (e.key === ']') { e.preventDefault(); jumpPrompt(1) }
      else if (e.key === 'g') { e.preventDefault(); jumpTop() }
      else if (e.key === 'G') { e.preventDefault(); jumpBottom() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [jumpPrompt, jumpTop, jumpBottom])

  const ts = new Date(session.timestamp)
  const dateStr = ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const timeStr = ts.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const relTime = (() => {
    const d = Date.now() - session.timestamp
    const m = Math.floor(d / 60_000), h = Math.floor(d / 3_600_000), days = Math.floor(d / 86_400_000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    if (h < 24) return `${h}h ago`
    if (days === 1) return 'yesterday'
    if (days < 7) return `${days}d ago`
    return dateStr
  })()
  const tokenTotal = detail
    ? detail.totalTokens.inputTokens + detail.totalTokens.outputTokens
      + detail.totalTokens.cacheReadTokens + detail.totalTokens.cacheCreationTokens
    : 0
  const durationStr = detail?.durationMs
    ? detail.durationMs < 60_000 ? `${Math.round(detail.durationMs / 1000)}s` : `${Math.round(detail.durationMs / 60_000)}m`
    : ''

  const promptLabel = visibleUserIdx.length
    ? `${Math.min(promptPos + 1, visibleUserIdx.length)} / ${visibleUserIdx.length}`
    : '– / –'

  const nothingVisible = !loading && !error && turns.length > 0 && visible.every(v => !v)

  return (
    <div className="flex flex-col h-full">
      <FindInPage open={findOpen} onClose={() => setFindOpen(false)} container={scrollRef.current} />
      {/* Header — title anchor, one identity line, one stat line, folded prompt */}
      <div className="px-3 pt-2 pb-2 flex-shrink-0 border-b border-[var(--c-border)]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <NameEditor sessionId={session.sessionId} fallback={session.display} inheritedTitle={session.title} />
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleResume}
              title="Resume this session in Terminal"
              aria-label="Resume this session in Terminal"
              className={`text-[12px] w-6 h-6 flex items-center justify-center rounded-md border transition-colors ${opened ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] hover:border-[var(--c-accent)]/40'}`}
            >
              {opened ? '✓' : '▶'}
            </button>
            <button
              onClick={handleCopy}
              title="Copy resume command"
              aria-label="Copy resume command"
              className={`text-[12px] w-6 h-6 flex items-center justify-center rounded-md border transition-colors ${copied ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] hover:border-[var(--c-accent)]/40'}`}
            >
              {copied ? '✓' : '⧉'}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[var(--c-text-3)] flex-wrap">
          {session.isLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />}
          <AgentBadge agent={session.agent} className="flex-shrink-0" />
          <button
            onClick={copyPath}
            title={`${session.project} — click to copy`}
            className="max-w-[240px] truncate hover:text-[var(--c-text-2)] transition-colors"
          >
            {session.projectName}{copiedPath ? ' ✓' : ''}
          </button>
          <span className="opacity-40">·</span>
          <span title={`${dateStr} ${timeStr}`}>{relTime}</span>
          {tokenTotal > 0 && (
            <>
              <span className="opacity-40">·</span>
              <span className="text-[10px] font-semibold px-1.5 rounded-full bg-emerald-500/15 text-emerald-400">{formatTokens(tokenTotal)} tok</span>
            </>
          )}
          {detail && (
            <>
              <span className="opacity-40">·</span>
              <span>{detail.messages.length} msgs · {toolCount} tools{durationStr && ` · ${durationStr}`}</span>
            </>
          )}
        </div>

        <TagEditor sessionId={session.sessionId} />

        <details className="mt-1 group/prompt">
          <summary className="list-none cursor-pointer text-[11px] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors [&::-webkit-details-marker]:hidden">
            <span className="inline-block group-open/prompt:rotate-90 transition-transform text-[8px] mr-1">▶</span>
            opened with: <span className="italic">“{session.display.slice(0, 72)}{session.display.length > 72 ? '…' : ''}”</span>
          </summary>
          <p className="text-[11.5px] text-[var(--c-text-3)] mt-1 leading-relaxed not-italic">{session.display}</p>
        </details>
      </div>

      {!loading && !error && turns.length > 0 && (
        <TranscriptToolbar
          q={q} setQ={setQ}
          role={role} setRole={setRole}
          errorsOnly={errorsOnly} setErrorsOnly={setErrorsOnly}
          eventsOnly={eventsOnly} setEventsOnly={setEventsOnly}
          stepsExpanded={stepsExpanded}
          onToggleSteps={toggleSteps}
          onJumpTop={jumpTop}
          onJumpBottom={jumpBottom}
          onPrevPrompt={() => jumpPrompt(-1)}
          onNextPrompt={() => jumpPrompt(1)}
          promptPos={promptLabel}
        />
      )}

      {/* Conversation — wrapped in its own border so "copy the whole thing"
          reads as one action on this box, not a filter-bar chip. */}
      <div className="relative flex-1 min-h-0 flex flex-col m-2 mt-1.5">
        {!loading && !error && turns.length > 0 && (
          <button
            onClick={copyAll}
            title="Copy the whole conversation as text"
            aria-label="Copy the whole conversation as text"
            className={`absolute -top-2.5 right-3 z-10 text-[10.5px] px-2 py-0.5 rounded-md border bg-[var(--c-bg)] transition-colors whitespace-nowrap ${copiedAll ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] hover:border-[var(--c-accent)]/40'}`}
          >
            {copiedAll ? '✓ Copied' : '⧉ Copy conversation'}
          </button>
        )}
        <div className="relative flex-1 min-h-0 flex flex-col border border-[var(--c-border)] rounded-lg overflow-hidden">
          <div ref={scrollRef} onScroll={syncPromptPos} className="relative flex-1 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center h-20">
                <div className="w-4 h-4 border-2 border-[var(--c-accent)]/40 border-t-[var(--c-accent)] rounded-full animate-spin" />
              </div>
            )}
            {error && (
              <div className="m-3 text-[13px] text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            {turns.map((turn, i) => (
              <TurnRow
                key={i}
                ref={el => { turnRefs.current[i] = el }}
                turn={turn}
                isLast={i === turns.length - 1}
                hidden={!visible[i]}
              />
            ))}
            {nothingVisible && (
              <p className="text-[13px] text-[var(--c-text-3)] text-center py-6">No turns match the filters</p>
            )}
            {detail && turns.length === 0 && !loading && (
              <p className="text-[13px] text-[var(--c-text-3)] text-center py-6">No messages found</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
