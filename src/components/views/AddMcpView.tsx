import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { capture, captureException } from '../../analytics';
import { TOOL_COLORS } from '../../constants/toolColors';
import type { AiTool, CachedMcp } from '../../types';

interface AddMcpViewProps {
  installedTools: AiTool[];
  onBack: () => void;
  onAdded: () => void;
}

type McpType = 'npx' | 'http' | 'command' | 'docker' | 'local' | 'paste';

const MCP_TYPES: { value: McpType; label: string; description: string }[] = [
  { value: 'npx',     label: 'npx package',    description: 'Install from npm registry via npx' },
  { value: 'http',    label: 'HTTP / SSE',      description: 'Remote server via HTTP or SSE URL' },
  { value: 'command', label: 'Custom command',  description: 'Any command with arguments' },
  { value: 'docker',  label: 'Docker',          description: 'Run in a Docker container' },
  { value: 'local',   label: 'Local script',    description: 'Local binary or script file' },
  { value: 'paste',   label: 'Paste JSON',      description: 'Paste a raw JSON MCP config block' },
];

interface ValidationErrors {
  name?: string;
  command?: string;
  url?: string;
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
      <svg className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <p className="text-[13px] text-red-400 leading-relaxed">{message}</p>
    </div>
  );
}

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

function TypeDropdown({ value, onChange }: { value: McpType; onChange: (t: McpType) => void }) {
  const [open, setOpen] = useState(false);
  const selected = MCP_TYPES.find(t => t.value === value)!;

  return (
    <div>
      <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-2">
        Type
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2 bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg text-[14px] text-[var(--c-text)] hover:bg-[var(--c-hover)] transition-colors"
        >
          <span>{selected.label}</span>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-4 h-4 text-[var(--c-text-3)] transition-transform ${open ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {open && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg shadow-lg z-10 overflow-hidden">
            {MCP_TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => { onChange(t.value); setOpen(false); }}
                className={`w-full flex flex-col px-3 py-2.5 text-left hover:bg-[var(--c-hover)] transition-colors border-b border-[var(--c-border-sub)] last:border-0 ${t.value === value ? 'text-violet-400' : 'text-[var(--c-text)]'}`}
              >
                <span className="text-[13px] font-medium">{t.label}</span>
                <span className="text-[11px] text-[var(--c-text-3)]">{t.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function parsePasteJson(raw: string): { command?: string; args?: string[]; url?: string } | null {
  try {
    const parsed = JSON.parse(raw.trim());
    if (typeof parsed !== 'object' || parsed === null) return null;
    const keys = Object.keys(parsed);
    // Named form: { "voice-mode": { "command": "uvx", "args": [...] } }
    if (
      keys.length === 1 &&
      typeof parsed[keys[0]] === 'object' &&
      parsed[keys[0]] !== null &&
      ('command' in parsed[keys[0]] || 'url' in parsed[keys[0]])
    ) {
      const inner = parsed[keys[0]];
      return { command: inner.command, args: inner.args, url: inner.url };
    }
    // Direct form: { "command": "uvx", "args": [...] }
    if ('command' in parsed || 'url' in parsed) {
      return { command: parsed.command, args: parsed.args, url: parsed.url };
    }
    return null;
  } catch {
    return null;
  }
}

function detectNameFromPaste(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw.trim());
    if (typeof parsed !== 'object' || parsed === null) return null;
    const keys = Object.keys(parsed);
    if (
      keys.length === 1 &&
      typeof parsed[keys[0]] === 'object' &&
      parsed[keys[0]] !== null &&
      ('command' in parsed[keys[0]] || 'url' in parsed[keys[0]])
    ) {
      return keys[0];
    }
    return null;
  } catch {
    return null;
  }
}

function buildMcpPayload(type: McpType, fields: Record<string, string>): {
  command?: string;
  args?: string[];
  url?: string;
} {
  switch (type) {
    case 'npx': {
      const pkg = fields.package?.trim() ?? '';
      return { command: 'npx', args: ['-y', pkg] };
    }
    case 'http':
      return { url: fields.url?.trim() };
    case 'command': {
      const args = fields.args?.trim() ? fields.args.trim().split(/\s+/) : [];
      return { command: fields.command?.trim(), args };
    }
    case 'docker': {
      const image = fields.image?.trim() ?? '';
      const extraArgs = fields.dockerArgs?.trim() ? fields.dockerArgs.trim().split(/\s+/) : [];
      return { command: 'docker', args: ['run', '--rm', '-i', image, ...extraArgs] };
    }
    case 'local': {
      const interpreter = fields.interpreter?.trim();
      const path = fields.path?.trim() ?? '';
      if (interpreter) {
        return { command: interpreter, args: [path] };
      }
      return { command: path, args: [] };
    }
    case 'paste':
      return parsePasteJson(fields.json ?? '') ?? {};
  }
}

function prefillTypeAndFields(cached: CachedMcp): { type: McpType; fields: Record<string, string> } {
  if (cached.url) {
    return { type: 'http', fields: { url: cached.url } };
  }
  if (cached.command === 'npx' && cached.args.includes('-y')) {
    const pkg = cached.args.find(a => !a.startsWith('-')) ?? '';
    return { type: 'npx', fields: { package: pkg } };
  }
  if (cached.command === 'docker') {
    const image = cached.args.find(a => !a.startsWith('-') && a !== 'run' && a !== '--rm' && a !== '-i') ?? '';
    return { type: 'docker', fields: { image } };
  }
  // fallback: custom command
  const args = cached.args.join(' ');
  return { type: 'command', fields: { command: cached.command ?? '', args } };
}

export default function AddMcpView({ installedTools, onBack, onAdded }: AddMcpViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(installedTools.slice(0, 1).map(t => t.id))
  );
  const [mcpType, setMcpType] = useState<McpType>('npx');
  const [name, setName] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [addedCount, setAddedCount] = useState<number | null>(null);
  const [cachedMcps, setCachedMcps] = useState<CachedMcp[]>([]);

  // Load MCPs from cache that aren't currently installed in any tool
  useEffect(() => {
    const currentMcpNames = new Set(installedTools.flatMap(t => t.mcps.map(m => m.name)));
    invoke<CachedMcp[]>('get_all_cached_mcps')
      .then(all => setCachedMcps(all.filter(m => !currentMcpNames.has(m.name))))
      .catch(() => {});
  }, [installedTools]);

  const setField = (key: string, val: string) => setFields(f => ({ ...f, [key]: val }));
  const toolIds = Array.from(selectedIds);

  const handlePasteChange = (raw: string) => {
    setField('json', raw);
    const detected = detectNameFromPaste(raw);
    if (detected && !name) {
      setName(detected);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (toolIds.length === 0) { setError('Select at least one tool'); return; }
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Name is required'); return; }

    const payload = buildMcpPayload(mcpType, fields);

    if (mcpType === 'paste' && !payload.command && !payload.url) {
      setError('Invalid JSON — must include "command" or "url"');
      return;
    }

    setSaving(true);
    setError(null);
    setValidationErrors({});

    try {
      // Validate against first selected tool before writing
      const validation = await invoke<{
        ok: boolean;
        name_error: string | null;
        command_error: string | null;
        url_error: string | null;
      }>('validate_mcp', {
        toolId: toolIds[0],
        name: trimmedName,
        command: payload.command ?? null,
        url: payload.url ?? null,
      });

      if (!validation.ok) {
        setValidationErrors({
          name: validation.name_error ?? undefined,
          command: validation.command_error ?? undefined,
          url: validation.url_error ?? undefined,
        });
        setSaving(false);
        return;
      }

      let count = 0;
      for (const toolId of toolIds) {
        await invoke('add_mcp', {
          toolId,
          name: trimmedName,
          command: payload.command,
          args: payload.args,
          url: payload.url,
        });
        count++;
      }
      capture('mcp_added', { tool_ids: toolIds, mcp_name: trimmedName, mcp_type: mcpType });
      setAddedCount(count);
      await onAdded();
    } catch (e) {
      setError(String(e));
      captureException(e);
    } finally {
      setSaving(false);
    }
  };

  if (addedCount !== null) {
    return (
      <div className="flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-green-400">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <p className="text-[15px] font-semibold text-[var(--c-text)] mb-1">{name}</p>
            <p className="text-[12px] text-[var(--c-text-3)]">Added to {addedCount} tool{addedCount !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onBack} className="px-6 py-2 rounded-lg bg-violet-500/20 text-violet-400 text-[14px] font-medium hover:bg-violet-500/30 transition-colors">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] animate-slide-in-right">
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Previously used MCPs from cache */}
        {cachedMcps.length > 0 && (
          <div>
            <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-2">
              Previously used
            </label>
            <div className="flex flex-wrap gap-1.5">
              {cachedMcps.map(cached => (
                <div key={cached.name} className="flex items-center rounded-md border border-[var(--c-border)] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      const { type, fields: f } = prefillTypeAndFields(cached);
                      setName(cached.name);
                      setMcpType(type);
                      setFields(f);
                      setError(null);
                      setValidationErrors({});
                    }}
                    className="px-2.5 py-1 text-[12px] text-[var(--c-text-2)] hover:text-[var(--c-text)] hover:bg-violet-500/5 transition-colors font-mono"
                  >
                    {cached.name}
                  </button>
                  {cached.sourceUrl && (
                    <a
                      href={cached.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="px-1.5 py-1 border-l border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
                      title={cached.sourceUrl}
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/>
                        <line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Multi-select tools */}
        <ToolMultiSelect tools={installedTools} selected={selectedIds} onChange={setSelectedIds} />

        {/* Type dropdown */}
        <TypeDropdown value={mcpType} onChange={t => { setMcpType(t); setFields({}); setValidationErrors({}); }} />

        {/* Name — always shown (except paste where it's auto-detected) */}
        <div>
          <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">
            Name *
            {mcpType === 'paste' && <span className="normal-case font-normal ml-1 text-[var(--c-text-3)]">(auto-detected from JSON)</span>}
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. github"
            required
            className={`w-full bg-[var(--c-surface)] border rounded-lg px-3 py-2 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none transition-colors ${
              validationErrors.name ? 'border-red-500/50 focus:border-red-400' : 'border-[var(--c-border)] focus:border-violet-400/60'
            }`}
          />
          {validationErrors.name && <ErrorBox message={validationErrors.name} />}
        </div>

        {/* Type-specific fields */}
        {mcpType === 'npx' && (
          <div>
            <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">Package *</label>
            <input
              type="text"
              value={fields.package ?? ''}
              onChange={e => setField('package', e.target.value)}
              placeholder="@modelcontextprotocol/server-github"
              required
              className={`w-full bg-[var(--c-surface)] border rounded-lg px-3 py-2 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none transition-colors font-mono text-[13px] ${
                validationErrors.command ? 'border-red-500/50 focus:border-red-400' : 'border-[var(--c-border)] focus:border-violet-400/60'
              }`}
            />
            {fields.package && (
              <p className="mt-1.5 text-[11px] text-[var(--c-text-3)] font-mono">npx -y {fields.package}</p>
            )}
            {validationErrors.command && <ErrorBox message={validationErrors.command} />}
          </div>
        )}

        {mcpType === 'http' && (
          <div>
            <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">URL *</label>
            <input
              type="url"
              value={fields.url ?? ''}
              onChange={e => setField('url', e.target.value)}
              placeholder="https://mcp.example.com/sse"
              required
              className={`w-full bg-[var(--c-surface)] border rounded-lg px-3 py-2 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none transition-colors font-mono text-[13px] ${
                validationErrors.url ? 'border-red-500/50 focus:border-red-400' : 'border-[var(--c-border)] focus:border-violet-400/60'
              }`}
            />
            {validationErrors.url && <ErrorBox message={validationErrors.url} />}
          </div>
        )}

        {mcpType === 'command' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">Command *</label>
              <input
                type="text"
                value={fields.command ?? ''}
                onChange={e => setField('command', e.target.value)}
                placeholder="uvx"
                required
                className={`w-full bg-[var(--c-surface)] border rounded-lg px-3 py-2 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none transition-colors font-mono text-[13px] ${
                  validationErrors.command ? 'border-red-500/50 focus:border-red-400' : 'border-[var(--c-border)] focus:border-violet-400/60'
                }`}
              />
              {validationErrors.command && <ErrorBox message={validationErrors.command} />}
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">Args</label>
              <input
                type="text"
                value={fields.args ?? ''}
                onChange={e => setField('args', e.target.value)}
                placeholder="voice-mode"
                className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg px-3 py-2 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none focus:border-violet-400/60 transition-colors font-mono text-[13px]"
              />
            </div>
            {(fields.command || fields.args) && (
              <p className="text-[11px] text-[var(--c-text-3)] font-mono">{fields.command} {fields.args}</p>
            )}
          </div>
        )}

        {mcpType === 'docker' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">Docker image *</label>
              <input
                type="text"
                value={fields.image ?? ''}
                onChange={e => setField('image', e.target.value)}
                placeholder="ghcr.io/user/mcp-server:latest"
                required
                className={`w-full bg-[var(--c-surface)] border rounded-lg px-3 py-2 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none transition-colors font-mono text-[13px] ${
                  validationErrors.command ? 'border-red-500/50 focus:border-red-400' : 'border-[var(--c-border)] focus:border-violet-400/60'
                }`}
              />
              {validationErrors.command && <ErrorBox message={validationErrors.command} />}
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">Extra args</label>
              <input
                type="text"
                value={fields.dockerArgs ?? ''}
                onChange={e => setField('dockerArgs', e.target.value)}
                placeholder="-e API_KEY=... --network host"
                className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg px-3 py-2 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none focus:border-violet-400/60 transition-colors font-mono text-[13px]"
              />
            </div>
            {fields.image && (
              <p className="text-[11px] text-[var(--c-text-3)] font-mono">docker run --rm -i {fields.image} {fields.dockerArgs}</p>
            )}
          </div>
        )}

        {mcpType === 'local' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">Script path *</label>
              <input
                type="text"
                value={fields.path ?? ''}
                onChange={e => setField('path', e.target.value)}
                placeholder="~/scripts/mcp-server.py"
                required
                className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg px-3 py-2 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none focus:border-violet-400/60 transition-colors font-mono text-[13px]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">Interpreter</label>
              <input
                type="text"
                value={fields.interpreter ?? ''}
                onChange={e => setField('interpreter', e.target.value)}
                placeholder="python3  (leave blank if script is executable)"
                className={`w-full bg-[var(--c-surface)] border rounded-lg px-3 py-2 text-[14px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none transition-colors font-mono text-[13px] ${
                  validationErrors.command ? 'border-red-500/50 focus:border-red-400' : 'border-[var(--c-border)] focus:border-violet-400/60'
                }`}
              />
              {validationErrors.command && <ErrorBox message={validationErrors.command} />}
            </div>
            {fields.path && (
              <p className="text-[11px] text-[var(--c-text-3)] font-mono">
                {fields.interpreter ? `${fields.interpreter} ${fields.path}` : fields.path}
              </p>
            )}
          </div>
        )}

        {mcpType === 'paste' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[12px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider mb-1.5">JSON config *</label>
              <textarea
                value={fields.json ?? ''}
                onChange={e => handlePasteChange(e.target.value)}
                placeholder={`{\n  "command": "uvx",\n  "args": ["voice-mode"]\n}\n\nor with a key:\n{\n  "voice-mode": {\n    "command": "uvx",\n    "args": ["voice-mode"]\n  }\n}`}
                rows={8}
                required
                spellCheck={false}
                className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg px-3 py-2 text-[13px] text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none focus:border-violet-400/60 transition-colors font-mono resize-none"
              />
              <p className="mt-1 text-[11px] text-[var(--c-text-3)]">
                If the JSON has a single named key (e.g. <span className="font-mono">"voice-mode": {'{'}...{'}'}</span>), the name is auto-detected.
              </p>
            </div>
            {(() => {
              const parsed = parsePasteJson(fields.json ?? '');
              return parsed && (parsed.command || parsed.url) ? (
                <p className="text-[11px] text-[var(--c-text-3)] font-mono">
                  {parsed.url ? parsed.url : `${parsed.command}${parsed.args?.length ? ' ' + parsed.args.join(' ') : ''}`}
                </p>
              ) : null;
            })()}
            {validationErrors.command && <ErrorBox message={validationErrors.command} />}
            {validationErrors.url && <ErrorBox message={validationErrors.url} />}
          </div>
        )}

        {error && <ErrorBox message={error} />}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onBack} className="flex-1 py-2 rounded-lg border border-[var(--c-border)] text-[14px] text-[var(--c-text-2)] hover:bg-[var(--c-hover)] transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || selectedIds.size === 0}
            className="flex-1 py-2 rounded-lg bg-violet-500/20 text-violet-400 text-[14px] font-medium hover:bg-violet-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Adding…' : 'Add MCP'}
          </button>
        </div>
      </form>
    </div>
  );
}
