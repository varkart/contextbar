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
  command: string;
  args: string[];
  description?: string;
  active: boolean;
  hasSecrets: boolean;
  secretKeyNames: string[];
}
