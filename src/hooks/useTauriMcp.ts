import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AiTool } from '../types';

export function useTauriMcp() {
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const installMcp = useCallback(async (tool: AiTool, mcpPackage: string) => {
    setInstalling(true);
    setInstallError(null);
    try {
      await invoke('install_mcp_npm', { toolId: tool.id, packageName: mcpPackage });
      return true;
    } catch (err) {
      setInstallError(String(err));
      return false;
    } finally {
      setInstalling(false);
    }
  }, []);

  return { installMcp, installing, installError, setInstallError };
}
