import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { capture, captureException } from '../../analytics';
import { TOOL_COLORS } from '../../constants/toolColors';
import type { AiTool } from '../../types';

interface AddMcpViewProps {
  installedTools: AiTool[];
  onBack: () => void;
  onAdded: () => void;
}

export default function AddMcpView({ installedTools, onBack, onAdded }: AddMcpViewProps) {
  const [selectedToolId, setSelectedToolId] = useState<string>(installedTools[0]?.id ?? '');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [argsStr, setArgsStr] = useState('');
  const [url, setUrl] = useState('');
  const [isHttp, setIsHttp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !selectedToolId) return;

    setSaving(true);
    setError(null);
    try {
      if (isHttp) {
        await invoke('add_mcp', { toolId: selectedToolId, name: trimmedName, url: url.trim() || undefined });
      } else {
        const args = argsStr.trim() ? argsStr.trim().split(/\s+/) : [];
        await invoke('add_mcp', { toolId: selectedToolId, name: trimmedName, command: command.trim() || undefined, args });
      }
      capture('mcp_added', { tool_id: selectedToolId, mcp_name: trimmedName });
      await onAdded();
      onBack();
    } catch (e) {
      setError(String(e));
      captureException(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--c-border)] flex-shrink-0">
        <button
          onClick={onBack}
          className="text-[var(--c-text-2)] hover:text-[var(--c-text)] transition-colors p-0.5 -ml-0.5 rounded"
          aria-label="Back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="w-3.5 h-3.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="text-[13px] text-[var(--c-text-3)]">MCPs</span>
        <span className="text-[12px] text-[var(--c-text-3)]">›</span>
        <span className="text-[15px] font-semibold text-[var(--c-text)] tracking-[-0.01em]">Add MCP</span>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Tool selector */}
        <div>
          <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-2">
            Tool
          </label>
          <div className="flex flex-wrap gap-2">
            {installedTools.map(tool => {
              const colors = TOOL_COLORS[tool.id] ?? { bg: 'bg-zinc-500/10', text: 'text-zinc-500' };
              const selected = tool.id === selectedToolId;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => setSelectedToolId(tool.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors text-[13px] font-medium ${
                    selected
                      ? `${colors.bg} ${colors.text} border-transparent`
                      : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] hover:bg-[var(--c-hover)]'
                  }`}
                >
                  <span className={`inline-flex items-center justify-center w-[16px] h-[16px] rounded text-[10px] font-bold ${selected ? colors.bg : 'bg-[var(--c-surface)]'} ${colors.text}`}>
                    {tool.name[0].toUpperCase()}
                  </span>
                  {tool.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Type toggle */}
        <div>
          <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-2">
            Type
          </label>
          <div className="flex gap-1 bg-[var(--c-surface)] rounded-lg p-1 w-fit">
            <button
              type="button"
              onClick={() => setIsHttp(false)}
              className={`px-3 py-1 rounded text-[13px] font-medium transition-colors ${!isHttp ? 'bg-[var(--c-bg)] text-[var(--c-text)] shadow-sm' : 'text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
            >
              stdio
            </button>
            <button
              type="button"
              onClick={() => setIsHttp(true)}
              className={`px-3 py-1 rounded text-[13px] font-medium transition-colors ${isHttp ? 'bg-[var(--c-bg)] text-[var(--c-text)] shadow-sm' : 'text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'}`}
            >
              HTTP
            </button>
          </div>
        </div>

        {/* Fields */}
        <div className="space-y-2">
          <div>
            <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. github"
              required
              className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg px-3 py-2 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none focus:border-violet-400/60 transition-colors"
            />
          </div>

          {isHttp ? (
            <div>
              <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">
                URL
              </label>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://mcp.example.com"
                className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg px-3 py-2 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none focus:border-violet-400/60 transition-colors"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">
                  Command
                </label>
                <input
                  type="text"
                  value={command}
                  onChange={e => setCommand(e.target.value)}
                  placeholder="e.g. npx"
                  className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg px-3 py-2 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none focus:border-violet-400/60 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">
                  Args
                </label>
                <input
                  type="text"
                  value={argsStr}
                  onChange={e => setArgsStr(e.target.value)}
                  placeholder="-y @modelcontextprotocol/server-github"
                  className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg px-3 py-2 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none focus:border-violet-400/60 transition-colors font-mono text-[13px]"
                />
              </div>
            </>
          )}
        </div>

        {error && (
          <p className="text-[13px] text-red-400 leading-relaxed">{error}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 py-2 rounded-lg border border-[var(--c-border)] text-[14px] text-[var(--c-text-2)] hover:bg-[var(--c-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim() || !selectedToolId}
            className="flex-1 py-2 rounded-lg bg-violet-500/20 text-violet-400 text-[14px] font-medium hover:bg-violet-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Adding…' : 'Add MCP'}
          </button>
        </div>
      </form>
    </div>
  );
}
