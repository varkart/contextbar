export interface AiTool {
  id: string;
  name: string;
  version?: string;
  installed: boolean;
  installPath?: string;
  skills: Skill[];
  mcps: McpServer[];
  error?: string;
}

export interface Skill {
  name: string;
  path: string;
  description?: string;
  active: boolean;
  /** Which [[skill_sources]] entry produced this skill. */
  sourceId: string;
}

export interface McpServer {
  name: string;
  command: string;     // empty string for HTTP-only MCPs
  args: string[];
  url?: string;        // set for HTTP MCPs
  description?: string;
  active: boolean;
  hasSecrets: boolean;
  secretKeyNames: string[];
  extensionName?: string; // set for extension-dir MCPs (e.g. Gemini extensions)
  /** Which [[mcp_sources]] entry produced this server. Used to route toggle commands. */
  sourceId: string;
}

export interface ToolPermissions {
  allow: string[];
  deny: string[];
}

export type PermissionSection = 'allow' | 'deny';

export interface Notification {
  id: number;
  tsMs: number;
  level: 'info' | 'warn' | 'error';
  title: string;
  body: string;
}

export interface McpTool {
  name: string
  description?: string
  inputSchema?: unknown
}

export interface FileEntry {
  name: string
  path: string
  isDir: boolean
  children: FileEntry[]
  extension?: string
}
