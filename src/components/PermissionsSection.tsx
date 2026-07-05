import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ToolPermissions } from '../types';

interface PermissionsSectionProps {
  toolId: string;
  refreshKey?: number;
  onOpen?: () => void;
}

export default function PermissionsSection({ toolId, refreshKey, onOpen }: PermissionsSectionProps) {
  const [perms, setPerms] = useState<ToolPermissions | null>(null);
  const [supported, setSupported] = useState(true);

  const load = useCallback(async () => {
    try {
      const p = await invoke<ToolPermissions>('get_permissions', { agentId: toolId });
      setPerms(p);
      setSupported(true);
    } catch (e) {
      const msg = String(e);
      if (msg.includes('no permissions section')) {
        setSupported(false);
      }
    }
  }, [toolId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (!supported || !perms) return null;

  const totalCount = perms.allow.length + perms.deny.length;

  return (
    <div className="flex items-center px-2">
      <button
        onClick={onOpen}
        className="flex items-center gap-1 flex-1 text-left hover:opacity-80 transition-opacity"
        aria-label="Open permissions"
      >
        <span className="text-[var(--c-text-3)]/70">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="w-2.5 h-2.5 rotate-90">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
        <span className="text-[13px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider">Permissions</span>
        {totalCount > 0 && (
          <span className="text-[13px] text-[var(--c-text-3)]/60">{totalCount}</span>
        )}
      </button>
      <button
        onClick={onOpen}
        aria-label="Open permissions page"
        className="text-[var(--c-text-3)]/50 hover:text-[var(--c-text-3)] transition-colors p-0.5"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="w-3 h-3">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </button>
    </div>
  );
}
