import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AiTool, Skill, McpServer } from '../types';
import ToolDetails from './ToolDetails';
import { capture, captureException } from '../analytics';
import { TOOL_COLORS } from '../constants/toolColors';

interface ToolDetailPageProps {
  tool: AiTool;
  onBack: () => void;
  onSelectSkill: (skill: Skill) => void;
  onSelectMcp: (mcp: McpServer) => void;
  onToolUpdated: () => void;
}

export default function ToolDetailPage({ tool, onBack, onSelectSkill, onSelectMcp, onToolUpdated }: ToolDetailPageProps) {
  const colors = TOOL_COLORS[tool.id] ?? { bg: 'bg-zinc-500/10', text: 'text-zinc-500' };
  const [togglingSkill, setTogglingSkill] = useState<string | undefined>();
  const [togglingMcp, setTogglingMcp] = useState<string | undefined>();
  const [toggleError, setToggleError] = useState<string | null>(null);

  const handleToggleSkill = useCallback(async (skill: Skill, active: boolean) => {
    setTogglingSkill(skill.name);
    setToggleError(null);
    try {
      await invoke('set_skill_active', {
        toolId: tool.id,
        skillName: skill.name,
        skillPath: skill.path,
        active,
      });
      capture('skill_toggled', { tool_id: tool.id, skill_name: skill.name, active });
      onToolUpdated();
    } catch (e) {
      const msg = String(e);
      setToggleError(`Failed to ${active ? 'enable' : 'disable'} skill: ${msg}`);
      capture('skill_toggle_failed', {
        tool_id: tool.id,
        skill_name: skill.name,
        intended_active: active,
        error: msg,
      });
      captureException(e);
    } finally {
      setTogglingSkill(undefined);
    }
  }, [tool.id, onToolUpdated]);

  const handleToggleMcp = useCallback(async (mcp: McpServer, active: boolean) => {
    setTogglingMcp(mcp.name);
    setToggleError(null);
    try {
      await invoke('set_mcp_active', {
        toolId: tool.id,
        mcpName: mcp.name,
        active,
        extensionName: mcp.extensionName ?? null,
      });
      capture('mcp_toggled', { tool_id: tool.id, mcp_name: mcp.name, active });
      onToolUpdated();
    } catch (e) {
      const msg = String(e);
      setToggleError(`Failed to ${active ? 'enable' : 'disable'} MCP: ${msg}`);
      capture('mcp_toggle_failed', {
        tool_id: tool.id,
        mcp_name: mcp.name,
        intended_active: active,
        error: msg,
      });
      captureException(e);
    } finally {
      setTogglingMcp(undefined);
    }
  }, [tool.id, onToolUpdated]);

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

        <span className="text-[13px] text-[var(--c-text-3)]">aicontextbar</span>
        <span className="text-[12px] text-[var(--c-text-3)]">›</span>

        <span className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded text-[11px] font-bold flex-shrink-0 ${colors.bg} ${colors.text}`}>
          {tool.name[0].toUpperCase()}
        </span>

        <span className="text-[15px] font-semibold text-[var(--c-text)] tracking-[-0.01em] truncate">
          {tool.name}
        </span>

        {(tool.skills.length > 0 || tool.mcps.length > 0) && (
          <span className="ml-auto text-[12px] text-[var(--c-text-3)] tabular-nums flex-shrink-0">
            {[
              tool.skills.length > 0 && `${tool.skills.length} skills`,
              tool.mcps.length > 0 && `${tool.mcps.length} mcp`,
            ].filter(Boolean).join('  ')}
          </span>
        )}
      </div>

      {toggleError && (
        <div
          className="mx-3 mt-2 px-3 py-1.5 rounded text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-center justify-between gap-2 flex-shrink-0"
          role="alert"
        >
          <span className="truncate">{toggleError}</span>
          <button
            onClick={() => setToggleError(null)}
            className="flex-shrink-0 text-red-400 hover:text-red-600 dark:hover:text-red-300"
            aria-label="Dismiss"
          >✕</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <ToolDetails
          tool={tool}
          onSelectSkill={onSelectSkill}
          onSelectMcp={onSelectMcp}
          onToggleSkill={handleToggleSkill}
          togglingSkill={togglingSkill}
          onToggleMcp={handleToggleMcp}
          togglingMcp={togglingMcp}
        />
      </div>
    </div>
  );
}
