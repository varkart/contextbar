import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface AuditEvent {
  id: number
  ts_ms: number
  event_type: string
  tool_id: string
  item_name: string
  detail: string | null
}

// TODO: replace with a backend endpoint (e.g. Cloudflare Worker → GitHub Issues API)
// that keeps your PAT server-side and works for users without repo access.
const GITHUB_ISSUES_URL = 'https://github.com/varkart/llmmanager/issues/new'

function formatLogLine(e: AuditEvent): string {
  const t = new Date(e.ts_ms).toISOString().slice(11, 19)
  const parts = [`${t}`, e.event_type.replace(/_/g, ' '), e.tool_id, e.item_name]
  if (e.detail) parts.push(e.detail)
  return parts.join(' | ')
}

export default function FeedbackView({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [includeLogs, setIncludeLogs] = useState(true)
  const [version, setVersion] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    invoke<string>('get_version').then(v => setVersion(v)).catch(() => {})
    textareaRef.current?.focus()
  }, [])

  const canSubmit = description.trim().length > 0 && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      let logLines: string[] = []
      if (includeLogs) {
        const events = await invoke<AuditEvent[]>('get_audit_log', { limit: 15 }).catch(() => [])
        logLines = events.map(formatLogLine)
      }

      const firstLine = description.trim().split('\n')[0].slice(0, 80)
      const title = `Feedback: ${firstLine}`

      const bodyParts: string[] = [
        `**From:** ${name.trim() || 'Anonymous'}`,
        '',
        '**Feedback:**',
        description.trim(),
        '',
        '---',
        `**App:** LLM Manager${version ? ` v${version}` : ''}`,
        '**Platform:** macOS',
      ]
      if (logLines.length > 0) {
        bodyParts.push('', '**Recent Activity:**', '```', ...logLines, '```')
      }

      const url = `${GITHUB_ISSUES_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(bodyParts.join('\n'))}&labels=feedback`
      await invoke('open_url', { url })
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col h-full bg-[var(--c-bg)]">
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className="w-5 h-5 text-emerald-400">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="text-[14px] font-semibold text-[var(--c-text)]">Feedback sent</p>
          <p className="text-[12px] text-[var(--c-text-3)] leading-[1.5]">
            A pre-filled GitHub issue opened in your browser. Submit it there to send.
          </p>
          <button
            onClick={onBack}
            className="mt-2 text-[13px] text-[var(--c-text-3)] hover:text-[var(--c-text)] transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)]">
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">

        {/* Name */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider">
            Name <span className="font-normal normal-case">(optional)</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-[8px] px-3 py-2 text-[13px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none focus:ring-1 focus:ring-[var(--c-text-3)]/30 transition"
          />
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-[11px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider">
            Feedback <span className="text-red-400">*</span>
          </label>
          <textarea
            ref={textareaRef}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe the issue or share your thoughts…"
            rows={6}
            className="w-full flex-1 resize-none bg-[var(--c-surface)] border border-[var(--c-border)] rounded-[8px] px-3 py-2 text-[13px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none focus:ring-1 focus:ring-[var(--c-text-3)]/30 transition leading-[1.5]"
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
            }}
          />
        </div>

        {/* Include logs toggle */}
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <button
            role="switch"
            aria-checked={includeLogs}
            onClick={() => setIncludeLogs(v => !v)}
            className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${includeLogs ? 'bg-indigo-500' : 'bg-[var(--c-border)]'}`}
          >
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${includeLogs ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
          <div className="flex flex-col">
            <span className="text-[12px] text-[var(--c-text-2)]">Include recent activity log</span>
            <span className="text-[10.5px] text-[var(--c-text-3)]">Last 15 events — helps diagnose issues</span>
          </div>
        </label>

      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-[var(--c-border)] flex-shrink-0">
        <span className="text-[10.5px] text-[var(--c-text-3)]">
          Opens a pre-filled GitHub issue
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="text-[12px] text-[var(--c-text-3)] hover:text-[var(--c-text)] transition-colors px-2 py-1"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="text-[12px] font-semibold bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-[6px] transition-colors"
          >
            {submitting ? 'Opening…' : 'Send Feedback'}
          </button>
        </div>
      </div>
    </div>
  )
}
