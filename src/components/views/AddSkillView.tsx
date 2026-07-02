import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { capture, captureException } from '../../analytics';
import { AGENT_COLORS } from '../../constants/agentColors';
import type { Agent } from '../../types';

interface AddSkillViewProps {
  installedAgents: Agent[];
  onBack: () => void;
  onCreated: () => void;
}

type SourceType = 'template' | 'url' | 'local';


function AgentMultiSelect({
  tools,
  selected,
  onChange,
}: {
  tools: Agent[];
  selected: Set<string>;
  onChange: (ids: Set<string>) => void;
}) {
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  return (
    <div>
      <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-2">
        Install to
      </label>
      <div className="flex flex-wrap gap-2">
        {tools.map(tool => {
          const colors = AGENT_COLORS[tool.id] ?? { bg: 'bg-zinc-500/10', text: 'text-zinc-500' };
          const active = selected.has(tool.id);
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => toggle(tool.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors text-[13px] font-medium ${
                active
                  ? `${colors.bg} ${colors.text} border-transparent ring-1 ring-current ring-opacity-30`
                  : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] hover:bg-[var(--c-hover)]'
              }`}
            >
              <span className={`inline-flex items-center justify-center w-[16px] h-[16px] rounded text-[10px] font-bold ${colors.bg} ${colors.text}`}>
                {tool.name[0].toUpperCase()}
              </span>
              {tool.name}
              {active && (
                <svg className="w-3 h-3 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SuccessState({ paths, name, onReveal, onDone }: { paths: string[]; name: string; onReveal: () => void; onDone: () => void }) {
  return (
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
        <p className="text-[12px] text-[var(--c-text-3)]">Added to {paths.length} agent{paths.length !== 1 ? 's' : ''}</p>
      </div>
      <p className="text-[13px] text-[var(--c-text-3)] leading-relaxed max-w-[260px]">
        Edit the file to customise content, then it will appear in Skills.
      </p>
      <div className="flex gap-2 w-full max-w-[240px]">
        <button onClick={onReveal} className="flex-1 py-2 rounded-lg border border-[var(--c-border)] text-[14px] text-[var(--c-text-2)] hover:bg-[var(--c-hover)] transition-colors">
          Reveal in Finder
        </button>
        <button onClick={onDone} className="flex-1 py-2 rounded-lg bg-indigo-500/20 text-indigo-400 text-[14px] font-medium hover:bg-indigo-500/30 transition-colors">
          Done
        </button>
      </div>
    </div>
  );
}

export default function AddSkillView({ installedAgents, onBack, onCreated }: AddSkillViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(installedAgents.slice(0, 1).map(t => t.id))
  );
  const [sourceType, setSourceType] = useState<SourceType>('template');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [searchDepth, setSearchDepth] = useState(2);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPaths, setCreatedPaths] = useState<string[] | null>(null);

  const agentIds = Array.from(selectedIds);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (agentIds.length === 0) { setError('Select at least one agent'); return; }

    setSaving(true);
    setError(null);
    try {
      let paths: string[];
      if (sourceType === 'template') {
        const trimmedName = name.trim();
        if (!trimmedName) { setError('Name is required'); setSaving(false); return; }
        paths = await invoke<string[]>('create_skill', {
          agentIds,
          name: trimmedName,
          description: description.trim() || undefined,
        });
        capture('skill_created', { tool_ids: agentIds, skill_name: trimmedName });
      } else if (sourceType === 'url') {
        const trimmedUrl = url.trim();
        if (!trimmedUrl) { setError('URL is required'); setSaving(false); return; }
        paths = await invoke<string[]>('install_skill_from_url', {
          agentIds,
          url: trimmedUrl,
          name: name.trim() || undefined,
          maxDepth: searchDepth,
        });
        capture('skill_installed_url', { tool_ids: agentIds });
      } else {
        const trimmedPath = localPath.trim();
        if (!trimmedPath) { setError('Path is required'); setSaving(false); return; }
        paths = await invoke<string[]>('install_skill_from_path', {
          agentIds,
          srcPath: trimmedPath,
          name: name.trim() || undefined,
        });
        capture('skill_installed_path', { tool_ids: agentIds });
      }
      setCreatedPaths(paths);
      await onCreated();
    } catch (e) {
      setError(String(e));
      captureException(e);
    } finally {
      setSaving(false);
    }
  };

  const handleReveal = async () => {
    if (!createdPaths?.[0]) return;
    await invoke('reveal_in_finder', { path: createdPaths[0] }).catch(() => {});
  };

  const sourceLabel = sourceType === 'template' ? 'Template' : sourceType === 'url' ? 'URL' : 'Local';

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
      {createdPaths ? (
        <SuccessState
          paths={createdPaths}
          name={name || url || localPath}
          onReveal={handleReveal}
          onDone={onBack}
        />
      ) : (
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Multi-select tools */}
          <AgentMultiSelect tools={installedAgents} selected={selectedIds} onChange={setSelectedIds} />

          {/* Source type */}
          <div>
            <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-2">
              Source
            </label>
            <div className="flex gap-1 bg-[var(--c-surface)] rounded-lg p-1">
              {(['template', 'url', 'local'] as SourceType[]).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setSourceType(s); setError(null); }}
                  className={`flex-1 py-1 rounded text-[13px] font-medium capitalize transition-colors ${
                    sourceType === s
                      ? 'bg-[var(--c-bg)] text-[var(--c-text)] shadow-sm'
                      : 'text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'
                  }`}
                >
                  {s === 'local' ? 'Local' : s === 'url' ? 'URL' : 'Template'}
                </button>
              ))}
            </div>
          </div>

          {/* Source-specific fields */}
          {sourceType === 'template' && (
            <div className="space-y-3">
              <div>
                <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">Name *</label>
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
                <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What does this skill do?"
                  className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg px-3 py-2 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none focus:border-indigo-400/60 transition-colors"
                />
              </div>
              <p className="text-[12px] text-[var(--c-text-3)]">
                Creates a blank <span className="font-mono">.md</span> template — edit it in your editor to add content.
              </p>
            </div>
          )}

          {sourceType === 'url' && (
            <div className="space-y-3">
              <div>
                <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">URL *</label>
                <input
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo or raw .md URL"
                  required
                  className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg px-3 py-2 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none focus:border-indigo-400/60 transition-colors font-mono text-[13px]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">Name override</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Auto-detected from URL"
                  className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg px-3 py-2 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none focus:border-indigo-400/60 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">Search depth</label>
                <div className="flex gap-1">
                  {[2, 3, 4, 5].map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSearchDepth(d)}
                      className={`flex-1 py-1.5 rounded text-[13px] font-medium transition-colors border ${
                        searchDepth === d
                          ? 'bg-indigo-500/15 text-indigo-400 border-indigo-400/30'
                          : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] hover:bg-[var(--c-hover)]'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-[var(--c-text-3)] mt-1">How many directory levels to scan for SKILL.md files.</p>
              </div>
              <p className="text-[12px] text-[var(--c-text-3)]">
                Paste a GitHub repo URL or a direct link to a <span className="font-mono">.md</span> file. For repos with multiple skills, all are installed — name override becomes a prefix (e.g. <span className="font-mono">matt</span> → <span className="font-mono">matt-qa</span>, <span className="font-mono">matt-implement</span>).
              </p>
            </div>
          )}

          {sourceType === 'local' && (
            <div className="space-y-3">
              <div>
                <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">File or directory path *</label>
                <input
                  type="text"
                  value={localPath}
                  onChange={e => setLocalPath(e.target.value)}
                  placeholder="~/Downloads/my-skill.md"
                  required
                  className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg px-3 py-2 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none focus:border-indigo-400/60 transition-colors font-mono text-[13px]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">Name override</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Auto-detected from filename"
                  className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg px-3 py-2 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none focus:border-indigo-400/60 transition-colors"
                />
              </div>
              <p className="text-[12px] text-[var(--c-text-3)]">
                Accepts a <span className="font-mono">.md</span> file or a directory containing <span className="font-mono">SKILL.md</span>.
              </p>
            </div>
          )}

          {error && <p className="text-[13px] text-red-400 leading-relaxed">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onBack} className="flex-1 py-2 rounded-lg border border-[var(--c-border)] text-[14px] text-[var(--c-text-2)] hover:bg-[var(--c-hover)] transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || selectedIds.size === 0}
              className="flex-1 py-2 rounded-lg bg-indigo-500/20 text-indigo-400 text-[14px] font-medium hover:bg-indigo-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Installing…' : `Add ${sourceLabel}`}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
