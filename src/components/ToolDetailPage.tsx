import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AiTool, Skill, McpServer } from '../types';
import ToolDetails from './ToolDetails';
import { capture, captureException } from '../analytics';

const TOOL_COLORS: Record<string, { bg: string; text: string }> = {
  claude:   { bg: 'bg-orange-500/10',   text: 'text-orange-500'  },
  cursor:   { bg: 'bg-sky-500/10',      text: 'text-sky-500'     },
  gemini:   { bg: 'bg-blue-500/10',     text: 'text-blue-500'    },
  copilot:  { bg: 'bg-zinc-500/15',     text: 'text-zinc-500'    },
  windsurf: { bg: 'bg-teal-500/10',     text: 'text-teal-500'    },
  chatgpt:  { bg: 'bg-emerald-500/10',  text: 'text-emerald-500' },
  aider:    { bg: 'bg-lime-500/10',     text: 'text-lime-500'    },
  continue: { bg: 'bg-violet-500/10',   text: 'text-violet-500'  },
  amazonq:  { bg: 'bg-amber-500/10',    text: 'text-amber-500'   },
  zed:      { bg: 'bg-purple-500/10',   text: 'text-purple-500'  },
};

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

  const handleToggleSkill = useCallback(async (skill: Skill, active: boolean) => {
    setTogglingSkill(skill.name);
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
      capture('skill_toggle_failed', {
        tool_id: tool.id,
        skill_name: skill.name,
        intended_active: active,
        error: String(e),
      });
      captureException(e);
    } finally {
      setTogglingSkill(undefined);
    }
  }, [tool.id, onToolUpdated]);

  const handleToggleMcp = useCallback(async (mcp: McpServer, active: boolean) => {
    setTogglingMcp(mcp.name);
    try {
      await invoke('set_mcp_active', { toolId: tool.id, mcpName: mcp.name, active });
      capture('mcp_toggled', { tool_id: tool.id, mcp_name: mcp.name, active });
      onToolUpdated();
    } catch (e) {
      capture('mcp_toggle_failed', {
        tool_id: tool.id,
        mcp_name: mcp.name,
        intended_active: active,
        error: String(e),
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

        <span className="text-[11px] text-[var(--c-text-3)]">aicontextbar</span>
        <span className="text-[10px] text-[var(--c-text-3)]">›</span>

        <span className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded text-[9px] font-bold flex-shrink-0 ${colors.bg} ${colors.text}`}>
          {tool.name[0].toUpperCase()}
        </span>

        <span className="text-[13px] font-semibold text-[var(--c-text)] tracking-[-0.01em] truncate">
          {tool.name}
        </span>

        {(tool.skills.length > 0 || tool.mcps.length > 0) && (
          <span className="ml-auto text-[10px] text-[var(--c-text-3)] tabular-nums flex-shrink-0">
            {[
              tool.skills.length > 0 && `${tool.skills.length} skills`,
              tool.mcps.length > 0 && `${tool.mcps.length} mcp`,
            ].filter(Boolean).join('  ')}
          </span>
        )}
      </div>

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
