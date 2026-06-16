import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ToolPermissions, PermissionSection } from '../types';
import { capture, captureException } from '../analytics';

interface PermissionsSectionProps {
  toolId: string;
  /** Re-render trigger from parent (e.g. after external config change). */
  refreshKey?: number;
}

export default function PermissionsSection({ toolId, refreshKey }: PermissionsSectionProps) {
  const [sectionOpen, setSectionOpen] = useState(true);
  const [perms, setPerms] = useState<ToolPermissions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [removingRule, setRemovingRule] = useState<string | null>(null);
  const [newRule, setNewRule] = useState('');
  const [addSection, setAddSection] = useState<PermissionSection>('allow');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await invoke<ToolPermissions>('get_permissions', { toolId });
      setPerms(p);
      setError(null);
      setSupported(true);
    } catch (e) {
      const msg = String(e);
      if (msg.includes('no permissions section')) {
        setSupported(false);
      } else {
        setError(msg);
      }
    }
  }, [toolId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const removeRule = useCallback(async (rule: string, section: PermissionSection) => {
    setRemovingRule(rule);
    try {
      await invoke('remove_permission_rule', { toolId, rule, section });
      capture('permission_rule_removed', { tool_id: toolId, section });
      await load();
    } catch (e) {
      const msg = String(e);
      setError(`Failed to remove rule: ${msg}`);
      captureException(e);
    } finally {
      setRemovingRule(null);
    }
  }, [toolId, load]);

  const addRule = useCallback(async () => {
    const rule = newRule.trim();
    if (!rule) return;
    setAdding(true);
    try {
      await invoke('add_permission_rule', { toolId, rule, section: addSection });
      capture('permission_rule_added', { tool_id: toolId, section: addSection });
      setNewRule('');
      await load();
    } catch (e) {
      const msg = String(e);
      setError(`Failed to add rule: ${msg}`);
      captureException(e);
    } finally {
      setAdding(false);
    }
  }, [toolId, newRule, addSection, load]);

  if (!supported) return null;
  if (!perms && !error) return null; // still loading

  const totalCount = (perms?.allow.length ?? 0) + (perms?.deny.length ?? 0);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setSectionOpen(v => !v)}
        className="flex items-center gap-1 px-2 w-full text-left hover:opacity-80 transition-opacity"
        aria-expanded={sectionOpen}
      >
        <span className="text-[var(--c-text-3)]/70">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`w-2.5 h-2.5 transition-transform duration-150 ${sectionOpen ? 'rotate-90' : 'rotate-0'}`}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
        <span className="text-[13px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider">Permissions</span>
        {totalCount > 0 && (
          <span className="text-[13px] text-[var(--c-text-3)]/60">{totalCount}</span>
        )}
      </button>

      {sectionOpen && (
        <>
          {error && (
            <p className="px-2 text-[13px] text-red-400/80">{error}</p>
          )}

          {perms && (
            <div className="space-y-3 px-2">
              <RuleList
                label="Allow"
                rules={perms.allow}
                section="allow"
                removingRule={removingRule}
                onRemove={removeRule}
                labelClass="text-emerald-500/80"
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
            </div>
          )}

          {/* Add rule */}
          <div className="px-2 pt-1">
        <div className="flex gap-1.5">
          <select
            value={addSection}
            onChange={e => setAddSection(e.target.value as PermissionSection)}
            className="text-[12px] rounded-md border border-[var(--c-border)] bg-[var(--c-bg-sub)] text-[var(--c-text-2)] px-1.5 py-1 focus:outline-none"
          >
            <option value="allow">Allow</option>
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
        </>
      )}
    </div>
  );
}

interface RuleListProps {
  label: string;
  rules: string[];
  section: PermissionSection;
  removingRule: string | null;
  onRemove: (rule: string, section: PermissionSection) => void;
  labelClass: string;
}

function RuleList({ label, rules, section, removingRule, onRemove, labelClass }: RuleListProps) {
  if (rules.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className={`text-[11px] font-semibold uppercase tracking-wider ${labelClass}`}>{label}</p>
      <div className="space-y-1">
        {rules.map(rule => (
          <div
            key={rule}
            className="group flex items-start gap-1.5 text-[12px] font-mono text-[var(--c-text-2)] bg-[var(--c-bg-sub)] rounded-md px-2.5 py-1.5"
          >
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
  );
}
