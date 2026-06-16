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
      const p = await invoke<ToolPermissions>('get_permissions', { toolId });
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
    <button
      onClick={onOpen}
      className="flex items-center gap-1 px-2 w-full text-left hover:opacity-80 transition-opacity group"
      aria-label="Open permissions"
    >
      <span className="text-[var(--c-text-3)]/70">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className="w-2.5 h-2.5">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </span>
      <span className="text-[13px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider">Permissions</span>
      {totalCount > 0 && (
        <span className="text-[13px] text-[var(--c-text-3)]/60">{totalCount}</span>
      )}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className="w-3 h-3 text-[var(--c-text-3)] ml-auto flex-shrink-0">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </button>
  );
}
