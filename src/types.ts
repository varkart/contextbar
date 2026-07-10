export interface Agent {
  id: string;
  name: string;
  version?: string;
  installed: boolean;
  installPath?: string;
  skills: Skill[];
  mcps: McpServer[];
  error?: string;
  supportsSkills: boolean;
  supportsMcps: boolean;
  /** Absolute paths of config files this agent reads/writes — used by restore UI. */
  configFiles?: string[];
  /** Parse errors from reading config files. Non-empty → read-only mode: toggles disabled, banner shown. */
  configErrors?: string[];
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
  /** URL from the `source:` frontmatter field, if present. */
  sourceUrl?: string;
  /** FNV-1a hex hash of SKILL.md content — used to detect variants across tools. */
  contentHash?: string;
  /** Which tool this skill belongs to — populated by the aggregated skills view. */
  agentId?: string;
  /** Which tool name this skill belongs to — populated by the aggregated skills view. */
  agentName?: string;
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
  /** Tools disabled per-server via "disabledTools" key (agy/Gemini mcp_config.json). */
  disabledTools?: string[];
}

export interface CachedMcp {
  name: string;
  command: string | null;
  args: string[];
  url: string | null;
  /** Validated GitHub/homepage URL, or npmjs.com fallback. Null until background enrichment completes. */
  sourceUrl: string | null;
  cachedAt: number;
  updatedAt: number;
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

// ── Session History ──────────────────────────────────────────────────────────

export interface SessionEntry {
  sessionId: string
  display: string
  timestamp: number
  project: string
  projectName: string
  totalTokens: number
  model?: string
  durationMinutes?: number
  isLive: boolean
  errorCount: number
}

export interface ContentBlock {
  blockType: string
  text?: string
  toolName?: string
  toolInput?: string
  toolResult?: string
  isError: boolean
}

export interface HistoryMessage {
  role: string
  content: ContentBlock[]
  timestamp?: number
  model?: string
  usage?: TokenUsage
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export interface SessionDetail {
  sessionId: string
  messages: HistoryMessage[]
  totalTokens: TokenUsage
  model?: string
  durationMs?: number
  project: string
  projectName: string
  timestamp: number
}

export interface HistoryStats {
  totalSessions: number
  totalTokens: number
  liveSessionId?: string
}

// ── Worktrees ─────────────────────────────────────────────────────────────────

export interface WorktreeInfo {
  path: string
  branch?: string
  isPrimary: boolean
  isDetached: boolean
  isDirty: boolean
  ahead: number
  behind: number
  isMerged: boolean
  /** Unix seconds of the last commit in this worktree. */
  lastCommitTs?: number
  lastCommitSubject?: string
}

export interface RepoWorktrees {
  repoName: string
  repoPath: string
  baseBranch: string
  worktrees: WorktreeInfo[]
}
