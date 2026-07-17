import { useState, useEffect, useRef, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { SessionEntry, SessionDetail as SessionDetailType, SessionMeta, HistoryMessage, ContentBlock } from '../../types'
import SessionStats from './SessionStats'
import MessageBubble from './MessageBubble'
import ToolCallGroup from './ToolCallGroup'
import AgentBadge from './AgentBadge'

/** Runs of this many or more sequential tool-only messages collapse into one
 *  group. Codex/agy push one message per tool step (no batching like Claude),
 *  so a session with a long tool-heavy stretch becomes a wall of repeated
 *  avatar rows without this. */
const COLLAPSE_THRESHOLD = 3

export function isToolOnlyMessage(m: HistoryMessage): boolean {
  return m.role === 'assistant' && m.content.length > 0 && m.content.every(b => b.blockType === 'tool_use')
}

type RenderUnit =
  | { kind: 'message'; message: HistoryMessage; key: number }
  | { kind: 'toolGroup'; blocks: ContentBlock[]; key: number }

/** Collapse consecutive tool-only messages into one group; everything else
 *  (text turns, user turns, short tool runs) renders as before. */
export function groupMessages(messages: HistoryMessage[]): RenderUnit[] {
  const units: RenderUnit[] = []
  let i = 0
  while (i < messages.length) {
    if (isToolOnlyMessage(messages[i])) {
      let j = i
      while (j < messages.length && isToolOnlyMessage(messages[j])) j++
      const run = messages.slice(i, j)
      if (run.length >= COLLAPSE_THRESHOLD) {
        units.push({ kind: 'toolGroup', blocks: run.flatMap(m => m.content), key: i })
      } else {
        run.forEach((m, k) => units.push({ kind: 'message', message: m, key: i + k }))
      }
      i = j
    } else {
      units.push({ kind: 'message', message: messages[i], key: i })
      i++
    }
  }
  return units
}

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
          className="text-[9px] px-1.5 py-px rounded-full bg-[var(--c-accent)]/10 text-[var(--c-accent)] flex items-center gap-1"
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
        className="w-16 bg-transparent text-[10px] text-[var(--c-text-2)] placeholder:text-[var(--c-text-3)] outline-none border-b border-transparent focus:border-[var(--c-accent)]/40"
      />
    </div>
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
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
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
      // Terminal launch failed — fall back to copying the command
      handleCopy()
    }
  }

  const handleCopy = async () => {
    const cmd = `cd "${session.project}" && claude --resume ${session.sessionId}`
    try {
      await navigator.clipboard.writeText(cmd)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard may require focus
    }
  }

  const toolCount = detail?.messages.reduce(
    (acc, m) => acc + m.content.filter(b => b.blockType === 'tool_use').length,
    0
  ) ?? 0

  const renderUnits = useMemo(() => groupMessages(detail?.messages ?? []), [detail])

  const ts = new Date(session.timestamp)
  const dateStr = ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const timeStr = ts.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex flex-col h-full">
      {/* Header info */}
      <div className="px-3 pt-2 pb-1 flex-shrink-0 border-b border-[var(--c-border)]">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {session.isLive && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            )}
            <AgentBadge agent={session.agent} className="flex-shrink-0" />
            <span className="text-[11px] text-[var(--c-text-3)] truncate">
              {session.projectName}
            </span>
            <span className="text-[10px] text-[var(--c-text-3)] opacity-50 flex-shrink-0">·</span>
            <span className="text-[10px] text-[var(--c-text-3)] flex-shrink-0">{dateStr} {timeStr}</span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleResume}
              title="Resume this session in Terminal"
              className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors ${opened ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] hover:border-[var(--c-accent)]/40'}`}
            >
              {opened ? '✓ Opened' : '▶ Resume'}
            </button>
            <button
              onClick={handleCopy}
              title="Copy resume command"
              className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors ${copied ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] hover:border-[var(--c-accent)]/40'}`}
            >
              {copied ? '✓' : '⧉'}
            </button>
          </div>
        </div>

        {detail && (
          <SessionStats
            usage={detail.totalTokens}
            messageCount={detail.messages.length}
            toolCount={toolCount}
            durationMs={detail.durationMs}
          />
        )}
      </div>

      {/* First prompt */}
      <div className="px-3 py-2 flex-shrink-0 border-b border-[var(--c-border)]">
        <p className="text-[11px] text-[var(--c-text-3)] line-clamp-2 italic">"{session.display}"</p>
        <TagEditor sessionId={session.sessionId} />
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {loading && (
          <div className="flex items-center justify-center h-20">
            <div className="w-4 h-4 border-2 border-[var(--c-accent)]/40 border-t-[var(--c-accent)] rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <div className="text-[11px] text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        {renderUnits.map(unit =>
          unit.kind === 'toolGroup'
            ? <ToolCallGroup key={unit.key} blocks={unit.blocks} />
            : <MessageBubble key={unit.key} message={unit.message} />
        )}
        {detail && detail.messages.length === 0 && (
          <p className="text-[11px] text-[var(--c-text-3)] text-center py-6">No messages found</p>
        )}
      </div>
    </div>
  )
}
