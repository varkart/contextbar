import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { SessionEntry, SessionDetail as SessionDetailType } from '../../types'
import SessionStats from './SessionStats'
import MessageBubble from './MessageBubble'

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
    invoke<SessionDetailType>('get_session', { sessionId: session.sessionId })
      .then(d => {
        setDetail(d)
        setLoading(false)
      })
      .catch(e => {
        setError(String(e))
        setLoading(false)
      })
  }, [session.sessionId])

  const handleResume = async () => {
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
            <span className="text-[11px] text-[var(--c-text-3)] truncate">
              {session.projectName}
            </span>
            <span className="text-[10px] text-[var(--c-text-3)] opacity-50 flex-shrink-0">·</span>
            <span className="text-[10px] text-[var(--c-text-3)] flex-shrink-0">{dateStr} {timeStr}</span>
          </div>
          <button
            onClick={handleResume}
            className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-md border transition-colors ${copied ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400' : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] hover:border-[var(--c-accent)]/40'}`}
          >
            {copied ? '✓ Copied' : '⏎ Resume'}
          </button>
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
        {detail?.messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        {detail && detail.messages.length === 0 && (
          <p className="text-[11px] text-[var(--c-text-3)] text-center py-6">No messages found</p>
        )}
      </div>
    </div>
  )
}
