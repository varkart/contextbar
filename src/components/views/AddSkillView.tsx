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

type SourceType = 'template' | 'url' | 'local' | 'github';

// Tools whose skill path matches what `npx skills add` writes.
// cursor → ~/.cursor/skills/ (CLI) vs ~/.cursor/skills-cursor/ (our manifest).
// windsurf → ~/.codeium/windsurf/skills/ (CLI) but no skill source in our manifest.
const SKILLS_CLI_SUPPORTED = new Set(['claude', 'gemini']);

function ToolMultiSelect({
  tools,
  selected,
  onChange,
}: {
  tools: AiTool[];
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
          const colors = TOOL_COLORS[tool.id] ?? { bg: 'bg-zinc-500/10', text: 'text-zinc-500' };
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
        <p className="text-[12px] text-[var(--c-text-3)]">Added to {paths.length} tool{paths.length !== 1 ? 's' : ''}</p>
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

export default function AddSkillView({ installedTools, onBack, onCreated }: AddSkillViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(installedTools.slice(0, 1).map(t => t.id))
  );
  const [sourceType, setSourceType] = useState<SourceType>('template');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [githubSource, setGithubSource] = useState('');
  const [skillFilter, setSkillFilter] = useState('');
  const [githubOutput, setGithubOutput] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPaths, setCreatedPaths] = useState<string[] | null>(null);

  const toolIds = Array.from(selectedIds);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (toolIds.length === 0) { setError('Select at least one tool'); return; }

    setSaving(true);
    setError(null);
    try {
      let paths: string[];
      if (sourceType === 'template') {
        const trimmedName = name.trim();
        if (!trimmedName) { setError('Name is required'); setSaving(false); return; }
        paths = await invoke<string[]>('create_skill', {
          toolIds,
          name: trimmedName,
          description: description.trim() || undefined,
        });
        capture('skill_created', { tool_ids: toolIds, skill_name: trimmedName });
      } else if (sourceType === 'url') {
        const trimmedUrl = url.trim();
        if (!trimmedUrl) { setError('URL is required'); setSaving(false); return; }
        paths = await invoke<string[]>('install_skill_from_url', {
          toolIds,
          url: trimmedUrl,
          name: name.trim() || undefined,
        });
        capture('skill_installed_url', { tool_ids: toolIds });
      } else if (sourceType === 'github') {
        const trimmedSource = githubSource.trim();
        if (!trimmedSource) { setError('Source is required'); setSaving(false); return; }
        const unsupported = toolIds.filter(id => !SKILLS_CLI_SUPPORTED.has(id));
        if (unsupported.length > 0) {
          setError(`skills CLI path mismatch for: ${unsupported.join(', ')} — only Claude Code and Gemini are supported`);
          setSaving(false);
          return;
        }
        const output = await invoke<string>('install_skill_from_github', {
          toolIds,
          source: trimmedSource,
          skillFilter: skillFilter.trim() || null,
        });
        capture('skill_installed_github', { tool_ids: toolIds });
        setGithubOutput(output || 'Installed successfully');
        await onCreated();
        return;
      } else {
        const trimmedPath = localPath.trim();
        if (!trimmedPath) { setError('Path is required'); setSaving(false); return; }
        paths = await invoke<string[]>('install_skill_from_path', {
          toolIds,
          srcPath: trimmedPath,
          name: name.trim() || undefined,
        });
        capture('skill_installed_path', { tool_ids: toolIds });
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
    await invoke('open_path', { path: createdPaths[0] }).catch(() => {});
  };

  const sourceLabel = sourceType === 'template' ? 'Template' : sourceType === 'url' ? 'URL' : sourceType === 'github' ? 'GitHub' : 'Local';

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--c-border)] flex-shrink-0">
        <button onClick={onBack} className="text-[var(--c-text-2)] hover:text-[var(--c-text)] transition-colors p-0.5 -ml-0.5 rounded" aria-label="Back">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="text-[13px] text-[var(--c-text-3)]">Skills</span>
        <span className="text-[12px] text-[var(--c-text-3)]">›</span>
        <span className="text-[15px] font-semibold text-[var(--c-text)] tracking-[-0.01em]">Add Skill</span>
      </div>

      {githubOutput ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-green-400">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <p className="text-[15px] font-semibold text-[var(--c-text)] mb-1">Skills installed</p>
            <p className="text-[12px] text-[var(--c-text-3)]">via npx skills add</p>
          </div>
          {githubOutput && (
            <pre className="w-full text-left text-[11px] text-[var(--c-text-3)] font-mono bg-[var(--c-surface)] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-32">
              {githubOutput}
            </pre>
          )}
          <button onClick={onBack} className="w-full max-w-[240px] py-2 rounded-lg bg-indigo-500/20 text-indigo-400 text-[14px] font-medium hover:bg-indigo-500/30 transition-colors">
            Done
          </button>
        </div>
      ) : createdPaths ? (
        <SuccessState
          paths={createdPaths}
          name={name || url || localPath}
          onReveal={handleReveal}
          onDone={onBack}
        />
      ) : (
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Multi-select tools */}
          <ToolMultiSelect tools={installedTools} selected={selectedIds} onChange={setSelectedIds} />

          {/* Source type */}
          <div>
            <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-2">
              Source
            </label>
            <div className="flex gap-1 bg-[var(--c-surface)] rounded-lg p-1">
              {(['template', 'url', 'local', 'github'] as SourceType[]).map(s => (
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
                  {s === 'local' ? 'Local' : s === 'url' ? 'URL' : s === 'github' ? 'GitHub' : 'Template'}
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
              <p className="text-[12px] text-[var(--c-text-3)]">
                Paste a GitHub repo URL or a direct link to a <span className="font-mono">.md</span> file. GitHub repo URLs automatically resolve to <span className="font-mono">SKILL.md</span>.
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

          {sourceType === 'github' && (
            <div className="space-y-3">
              <div>
                <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">Source *</label>
                <input
                  type="text"
                  value={githubSource}
                  onChange={e => setGithubSource(e.target.value)}
                  placeholder="owner/repo or https://github.com/owner/repo"
                  required
                  className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg px-3 py-2 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none focus:border-indigo-400/60 transition-colors font-mono text-[13px]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">Skill filter <span className="normal-case font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={skillFilter}
                  onChange={e => setSkillFilter(e.target.value)}
                  placeholder="exact-skill-name — leave empty to install all"
                  className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg px-3 py-2 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none focus:border-indigo-400/60 transition-colors"
                />
              </div>
              <p className="text-[12px] text-[var(--c-text-3)] leading-relaxed">
                Runs <span className="font-mono">npx skills add</span> — requires Node.js. Supported: Claude Code, Gemini CLI. Leave filter empty to install all skills from the repo.
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
