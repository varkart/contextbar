import { useState } from 'react';
import React from 'react';
import type { AiTool } from '../../types';
import ToolDot from '../ToolDot';

interface MainViewProps {
  loading: boolean;
  installedTools: AiTool[];
  onOpenLlmsList: () => void;
  onOpenSkillsPage: () => void;
  onOpenMcpsPage: () => void;
}

// ── Animated icons ────────────────────────────────────────────

function NeuronIcon() {
  const delays = [0, 0.3, 0.6, 0.15, 0.45, 0.75];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gridTemplateRows: 'repeat(2,1fr)', gap: 4 }}>
      {delays.map((d, i) => (
        <div
          key={i}
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#10b981', opacity: 0.18,
            animation: `neuron-pulse 2.4s ease-in-out ${d}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function ScrollIcon() {
  const delays = [0, 0.7, 1.4];
  return (
    <div style={{ position: 'relative', width: 22, height: 30 }}>
      <div style={{
        position: 'absolute', inset: 0,
        border: '1.5px solid rgba(99,102,241,.35)',
        borderRadius: 4,
        background: 'rgba(99,102,241,.06)',
      }} />
      <div style={{
        position: 'absolute', top: 8, left: 5, right: 5,
        display: 'flex', flexDirection: 'column', gap: 5,
      }}>
        {delays.map((d, i) => (
          <div
            key={i}
            style={{
              height: 2, borderRadius: 2,
              background: '#6366f1',
              transformOrigin: 'left center',
              width: i === 2 ? '70%' : '100%',
              animation: `line-fill 3s ease-in-out ${d}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function NetworkIcon() {
  return (
    <div style={{ position: 'relative', width: 36, height: 20 }}>
      {/* left node */}
      <div style={{
        position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
        width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6', opacity: 0.9,
      }} />
      {/* left ping */}
      <div style={{
        position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
        width: 8, height: 8, borderRadius: '50%',
        border: '1.5px solid #8b5cf6',
        animation: 'node-ping 1.8s ease-out 0s infinite',
      }} />
      {/* track */}
      <div style={{
        position: 'absolute', left: 10, right: 10, top: '50%', transform: 'translateY(-50%)',
        height: 1.5, background: 'rgba(139,92,246,.18)', borderRadius: 2,
      }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 2,
          background: 'linear-gradient(90deg,transparent 0%,#8b5cf6 40%,#8b5cf6 60%,transparent 100%)',
          animation: 'conn-travel 1.8s ease-in-out infinite',
          opacity: 0,
        }} />
      </div>
      {/* right node */}
      <div style={{
        position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
        width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6', opacity: 0.6,
      }} />
      {/* right ping */}
      <div style={{
        position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
        width: 8, height: 8, borderRadius: '50%',
        border: '1.5px solid #8b5cf6',
        animation: 'node-ping 1.8s ease-out 0.9s infinite',
      }} />
    </div>
  );
}

// ── Row expand bullets ────────────────────────────────────────

interface Bullet { text: string }
interface RowConfig {
  key: 'default' | 'skills' | 'mcps';
  label: string;
  subdesc: string | null;
  expandHdr: string;
  bullets: Bullet[];
  accent: string;         // tailwind text color
  accentBorder: string;   // hover border
  accentShadow: string;   // hover shadow
  accentBg: string;       // icon bg
  icon: () => React.ReactElement;
  countLabel: (n: number) => string;
  activeCount: (tools: AiTool[]) => number;
  totalCount: (tools: AiTool[]) => number;
}

const ROWS: RowConfig[] = [
  {
    key: 'default',
    label: 'Coding Agents',
    subdesc: null,
    expandHdr: 'Detected AI coding tools',
    bullets: [
      { text: 'Claude Code, Cursor, Windsurf, Copilot, Gemini CLI and more' },
      { text: 'Auto-detected from config dirs — no setup required' },
    ],
    accent: 'text-emerald-400',
    accentBorder: 'hover:border-emerald-500/30',
    accentShadow: 'hover:shadow-[0_4px_16px_rgba(16,185,129,.08)]',
    accentBg: 'bg-emerald-500/10',
    icon: NeuronIcon,
    countLabel: (n) => `${n} agent${n === 1 ? '' : 's'}`,
    totalCount: (tools) => tools.length,
    activeCount: (tools) => tools.filter(t => t.installed).length,
  },
  {
    key: 'skills',
    label: 'Skills',
    subdesc: 'Context files that guide how agents respond',
    expandHdr: 'How skills work',
    bullets: [
      { text: 'Used to extend AI agent capabilities with specialized knowledge and workflows' },
      { text: 'Provide domain expertise, repeatable workflows' },
    ],
    accent: 'text-indigo-400',
    accentBorder: 'hover:border-indigo-500/30',
    accentShadow: 'hover:shadow-[0_4px_16px_rgba(99,102,241,.08)]',
    accentBg: 'bg-indigo-500/10',
    icon: ScrollIcon,
    countLabel: (n) => `${n} skill${n === 1 ? '' : 's'}`,
    totalCount: (tools) => tools.reduce((s, t) => s + t.skills.length, 0),
    activeCount: (tools) => tools.reduce((s, t) => s + t.skills.filter(sk => sk.active).length, 0),
  },
  {
    key: 'mcps',
    label: 'MCPs',
    subdesc: 'Connect agents to external tools',
    expandHdr: 'Tools agents can call mid-task',
    bullets: [
      { text: 'File access, APIs, databases, GitHub, shell commands' },
      { text: 'Edit servers here — no JSON files to touch' },
    ],
    accent: 'text-violet-400',
    accentBorder: 'hover:border-violet-500/30',
    accentShadow: 'hover:shadow-[0_4px_16px_rgba(139,92,246,.08)]',
    accentBg: 'bg-violet-500/10',
    icon: NetworkIcon,
    countLabel: (n) => `${n} server${n === 1 ? '' : 's'}`,
    totalCount: (tools) => tools.reduce((s, t) => s + t.mcps.length, 0),
    activeCount: (tools) => tools.reduce((s, t) => s + t.mcps.filter(m => m.active).length, 0),
  },
];

// ── Tool dots ─────────────────────────────────────────────────

function ToolDots({ tools }: { tools: AiTool[] }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {tools.map(t => (
        <ToolDot key={t.id} toolId={t.id} toolName={t.name} size="md" />
      ))}
    </div>
  );
}

// ── Tile row ──────────────────────────────────────────────────

function TileRow({
  row,
  tools,
  loading,
  onClick,
}: {
  row: RowConfig;
  tools: AiTool[];
  loading: boolean;
  onClick: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const total = row.totalCount(tools);
  const active = row.activeCount(tools);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      onBlur={() => setExpanded(false)}
      className={`w-full text-left rounded-[10px] bg-[var(--c-surface)] border border-[var(--c-border-sub)] overflow-hidden transition-[border-color,box-shadow] duration-200 ${row.accentBorder} ${row.accentShadow} focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/10`}
    >
      {/* always-visible top bar */}
      <div className="flex items-center gap-3 px-3.5 py-3">
        {/* icon */}
        <div className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-[9px] ${row.accentBg}`}>
          <row.icon />
        </div>
        {/* text */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className={`text-[19px] font-bold leading-none tracking-[-0.02em] ${row.accent}`}>
            {row.label}
          </span>
          {row.subdesc && (
            <span className="text-[10.5px] text-[var(--c-text-3)] leading-[1.3]">
              {row.subdesc}
            </span>
          )}
        </div>
        {/* counts */}
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
          {loading ? (
            <div className="w-10 h-4 rounded bg-[var(--c-skeleton)] animate-pulse" />
          ) : (
            <>
              <span className="text-[13px] font-bold text-[var(--c-text)] tabular-nums">
                {row.countLabel(total)}
              </span>
              <span className="text-[10px] text-[var(--c-text-3)] tabular-nums">
                {active} active
              </span>
            </>
          )}
        </div>
      </div>

      {/* expand area */}
      <div
        style={{
          maxHeight: expanded ? 200 : 0,
          overflow: 'hidden',
          transition: 'max-height .3s cubic-bezier(.22,1,.36,1)',
        }}
      >
        <div className="px-3.5 pb-3 pl-[66px] flex flex-col gap-1">
          <span className={`text-[10px] font-semibold uppercase tracking-[.05em] mb-0.5 ${row.accent}`}>
            {row.expandHdr}
          </span>
          {row.bullets.map((b, i) => (
            <div key={i} className="flex gap-[5px]">
              <span
                className="w-[3px] h-[3px] rounded-full bg-[var(--c-text-3)] flex-shrink-0 mt-[5px]"
                aria-hidden="true"
              />
              <span className="text-[10px] text-[var(--c-text-2)] leading-[1.4]">{b.text}</span>
            </div>
          ))}
        </div>
      </div>
    </button>
  );
}

// ── Main view ─────────────────────────────────────────────────

export default function MainView({
  loading,
  installedTools,
  onOpenLlmsList,
  onOpenSkillsPage,
  onOpenMcpsPage,
}: MainViewProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 p-3">
        {/* detected tools row */}
        <div className="flex items-center gap-2 px-0.5">
          <span className="text-[10px] text-[var(--c-text-3)] uppercase tracking-wider flex-shrink-0">Detected</span>
          {loading ? (
            <div className="flex gap-1.5">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-[22px] h-[22px] rounded bg-[var(--c-skeleton)] animate-pulse" />
              ))}
            </div>
          ) : installedTools.length > 0 ? (
            <ToolDots tools={installedTools} />
          ) : (
            <span className="text-[12px] text-[var(--c-text-3)]">No tools detected</span>
          )}
        </div>

        {/* tile rows */}
        <div className="flex flex-col gap-1.5">
          {ROWS.map(row => (
            <TileRow
              key={row.key}
              row={row}
              tools={installedTools}
              loading={loading}
              onClick={() =>
                row.key === 'skills' ? onOpenSkillsPage()
                : row.key === 'mcps' ? onOpenMcpsPage()
                : onOpenLlmsList()
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
