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
