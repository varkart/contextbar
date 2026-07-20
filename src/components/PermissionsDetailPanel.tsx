import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { ToolPermissions, PermissionSection } from '../types'
import { capture, captureException } from '../analytics'

interface PermissionsDetailPanelProps {
  toolId: string
  toolName?: string
  onBack: () => void
}

function RuleList({
  label, rules, section, removingRule, onRemove, labelClass,
}: {
  label: string
  rules: string[]
  section: PermissionSection
  removingRule: string | null
  onRemove: (rule: string, section: PermissionSection) => void
  labelClass: string
}) {
  if (rules.length === 0) return null
  return (
    <div className="space-y-1">
      <p className={`text-[11px] font-semibold uppercase tracking-wider ${labelClass}`}>{label}</p>
      <div className="space-y-1">
        {rules.map(rule => (
          <div key={rule} className="group flex items-start gap-1.5 text-[12px] font-mono text-[var(--c-text-2)] bg-[var(--c-bg-sub)] rounded-md px-2.5 py-1.5">
            <span className="flex-1 break-all leading-relaxed">{rule}</span>
            <button
              onClick={() => onRemove(rule, section)}
              disabled={removingRule === rule}
              className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--c-text-3)]/60 hover:text-red-400 transition-all mt-0.5"
              aria-label={`Remove ${rule}`}
            >
              {removingRule === rule ? '…' : '×'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PermissionsDetailPanel({ toolId, toolName, onBack }: PermissionsDetailPanelProps) {
  const [perms, setPerms] = useState<ToolPermissions | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [removingRule, setRemovingRule] = useState<string | null>(null)
  const [newRule, setNewRule] = useState('')
  const [addSection, setAddSection] = useState<PermissionSection>('allow')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      const p = await invoke<ToolPermissions>('get_permissions', { agentId: toolId })
      setPerms(p)
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }, [toolId])

  useEffect(() => { load() }, [load])

  const removeRule = useCallback(async (rule: string, section: PermissionSection) => {
    setRemovingRule(rule)
    try {
      await invoke('remove_permission_rule', { agentId: toolId, rule, section })
      capture('permission_rule_removed', { tool_id: toolId, section })
      await load()
    } catch (e) {
      setError(`Failed to remove rule: ${String(e)}`)
      captureException(e)
    } finally {
      setRemovingRule(null)
    }
  }, [toolId, load])

  const addRule = useCallback(async () => {
    const rule = newRule.trim()
    if (!rule) return
    setAdding(true)
    try {
      await invoke('add_permission_rule', { agentId: toolId, rule, section: addSection })
      capture('permission_rule_added', { tool_id: toolId, section: addSection })
      setNewRule('')
      await load()
    } catch (e) {
      setError(`Failed to add rule: ${String(e)}`)
      captureException(e)
    } finally {
      setAdding(false)
    }
  }, [toolId, newRule, addSection, load])

  const totalCount = (perms?.allow.length ?? 0) + (perms?.deny.length ?? 0) + (perms?.ask?.length ?? 0)

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--c-border)] flex-shrink-0">
        <button
          onClick={onBack}
          className="text-[var(--c-text-2)] hover:text-[var(--c-text)] transition-colors p-0.5 -ml-0.5 rounded"
          aria-label="Back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="w-3.5 h-3.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        {toolName && (
          <>
            <button onClick={onBack} className="text-[13px] text-[var(--c-text-3)] truncate max-w-[80px] hover:text-[var(--c-text-2)] transition-colors">
              {toolName}
            </button>
            <span className="text-[12px] text-[var(--c-text-3)]">›</span>
          </>
        )}
        <span className="text-[15px] font-semibold text-[var(--c-text)] tracking-[-0.01em]">
          Permissions
        </span>
        {totalCount > 0 && (
          <span className="ml-auto text-[12px] text-[var(--c-text-3)] tabular-nums flex-shrink-0">{totalCount}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-3 mt-2 px-3 py-1.5 rounded text-[12px] text-red-400 bg-red-500/10 flex items-center justify-between gap-2">
            <span className="truncate">{error}</span>
            <button onClick={() => setError(null)} className="flex-shrink-0 hover:text-red-300">✕</button>
          </div>
        )}

        <div className="px-4 py-3 space-y-3">
          {perms ? (
            <>
              <RuleList
                label="Allow"
                rules={perms.allow}
                section="allow"
                removingRule={removingRule}
                onRemove={removeRule}
                labelClass="text-emerald-500/80"
              />
              <RuleList
                label="Ask"
                rules={perms.ask ?? []}
                section="ask"
                removingRule={removingRule}
                onRemove={removeRule}
                labelClass="text-amber-400/80"
              />
              <RuleList
                label="Deny"
                rules={perms.deny}
                section="deny"
                removingRule={removingRule}
                onRemove={removeRule}
                labelClass="text-red-400/80"
              />
              {totalCount === 0 && (
                <p className="text-[13px] text-[var(--c-text-3)]/50 italic">No custom rules</p>
              )}
            </>
          ) : !error ? (
            <div className="animate-pulse space-y-2 pt-2">
              {[1, 2, 3].map(i => <div key={i} className="h-8 bg-[var(--c-skeleton)] rounded-md" />)}
            </div>
          ) : null}

          {/* Add rule */}
          <div className="pt-2 border-t border-[var(--c-border)]">
            <p className="text-[11px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-2">Add rule</p>
            <div className="flex gap-1.5">
              <select
                value={addSection}
                onChange={e => setAddSection(e.target.value as PermissionSection)}
                className="text-[12px] rounded-md border border-[var(--c-border)] bg-[var(--c-bg-sub)] text-[var(--c-text-2)] px-1.5 py-1 focus:outline-none"
              >
                <option value="allow">Allow</option>
                <option value="ask">Ask</option>
                <option value="deny">Deny</option>
              </select>
              <input
                type="text"
                value={newRule}
                onChange={e => setNewRule(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addRule()}
                placeholder="Bash(npm:*) or WebSearch"
                className="flex-1 text-[12px] font-mono rounded-md border border-[var(--c-border)] bg-[var(--c-bg-sub)] text-[var(--c-text-2)] px-2 py-1 placeholder-[var(--c-text-3)]/40 focus:outline-none focus:border-[var(--c-accent)]"
              />
              <button
                onClick={addRule}
                disabled={adding || !newRule.trim()}
                className="text-[12px] px-2.5 py-1 rounded-md bg-[var(--c-accent)]/10 text-[var(--c-accent)] disabled:opacity-40 hover:bg-[var(--c-accent)]/20 transition-colors"
              >
                {adding ? '…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
