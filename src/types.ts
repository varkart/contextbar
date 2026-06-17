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
  /** True when a SKILL.md exists; full content fetched on demand via get_skill_full_description. */
  hasFullDescription: boolean;
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

export interface NpmInstallState {
  package: string | null
  installedVersion: string | null
  isNpx: boolean
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
