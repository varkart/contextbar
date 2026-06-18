import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { capture, captureException } from '../../analytics';
import { TOOL_COLORS } from '../../constants/toolColors';
import type { AiTool } from '../../types';

interface AddSkillViewProps {
  installedTools: AiTool[];
  onBack: () => void;
  onCreated: () => void;
}

export default function AddSkillView({ installedTools, onBack, onCreated }: AddSkillViewProps) {
  const toolsWithSkillSupport = installedTools;

  const [selectedToolId, setSelectedToolId] = useState<string>(toolsWithSkillSupport[0]?.id ?? '');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPath, setCreatedPath] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !selectedToolId) return;

    setSaving(true);
    setError(null);
    try {
      const path = await invoke<string>('create_skill', {
        toolId: selectedToolId,
        name: trimmedName,
        description: description.trim() || undefined,
      });
      capture('skill_created', { tool_id: selectedToolId, skill_name: trimmedName });
      setCreatedPath(path);
      await onCreated();
    } catch (e) {
      setError(String(e));
      captureException(e);
    } finally {
      setSaving(false);
    }
  };

  const handleReveal = async () => {
    if (!createdPath) return;
    await invoke('open_path', { path: createdPath }).catch(() => {});
  };

  if (createdPath) {
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
          <span className="text-[13px] text-[var(--c-text-3)]">Skills</span>
          <span className="text-[12px] text-[var(--c-text-3)]">›</span>
          <span className="text-[15px] font-semibold text-[var(--c-text)] tracking-[-0.01em]">Skill Created</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="w-6 h-6 text-green-400">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <p className="text-[15px] font-semibold text-[var(--c-text)] mb-1">{name}</p>
            <p className="text-[12px] text-[var(--c-text-3)] font-mono break-all leading-relaxed max-w-[280px]">{createdPath}</p>
          </div>
          <p className="text-[13px] text-[var(--c-text-3)] leading-relaxed max-w-[260px]">
            Edit the file to add your skill content, then it'll appear in the Skills list.
          </p>
          <div className="flex gap-2 w-full max-w-[240px]">
            <button
              onClick={handleReveal}
              className="flex-1 py-2 rounded-lg border border-[var(--c-border)] text-[14px] text-[var(--c-text-2)] hover:bg-[var(--c-hover)] transition-colors"
            >
              Reveal in Finder
            </button>
            <button
              onClick={onBack}
              className="flex-1 py-2 rounded-lg bg-indigo-500/20 text-indigo-400 text-[14px] font-medium hover:bg-indigo-500/30 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

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
        <span className="text-[13px] text-[var(--c-text-3)]">Skills</span>
        <span className="text-[12px] text-[var(--c-text-3)]">›</span>
        <span className="text-[15px] font-semibold text-[var(--c-text)] tracking-[-0.01em]">Add Skill</span>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Tool selector */}
        <div>
          <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-2">
            Tool
          </label>
          <div className="flex flex-wrap gap-2">
            {toolsWithSkillSupport.map(tool => {
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

        {/* Fields */}
        <div className="space-y-3">
          <div>
            <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. code-review"
              required
              className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg px-3 py-2 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none focus:border-indigo-400/60 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">
              Description <span className="normal-case font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this skill do?"
              className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg px-3 py-2 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none focus:border-indigo-400/60 transition-colors"
            />
          </div>
        </div>

        <p className="text-[12px] text-[var(--c-text-3)] leading-relaxed">
          Creates a <span className="font-mono">.md</span> template in the tool's skills folder. Open it in your editor to add content.
        </p>

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
            className="flex-1 py-2 rounded-lg bg-indigo-500/20 text-indigo-400 text-[14px] font-medium hover:bg-indigo-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Creating…' : 'Create Skill'}
          </button>
        </div>
      </form>
    </div>
  );
}
