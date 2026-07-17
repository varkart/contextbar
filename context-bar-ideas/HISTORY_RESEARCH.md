# Claude Session History — Detailed Research

## How Each Project Discovers, Processes, and Presents Session Data

Research based on 6 open-source projects that read Claude Code session history.

---

## 1. File Discovery & Lookup

### The Claude Code Data Layout

```
~/.claude/                              ← Base dir (override: $CLAUDE_CONFIG_DIR)
├── history.jsonl                       ← Master index: one line per session start
├── projects/
│   ├── -Users-foo-project-a/           ← Encoded project path (/ → -)
│   │   ├── sessions-index.json         ← Optional: Claude-generated session metadata
│   │   ├── {uuid}.jsonl                ← Session conversation file
│   │   └── {uuid}/
│   │       ├── tool-results/           ← Large tool outputs stored separately
│   │       └── subagents/
│   │           └── agent-{id}.jsonl    ← Sub-agent conversation
│   └── -Users-foo-project-b/
│       └── ...
└── .claude.json                        ← App metadata (not session data)
```

### Per-Project Discovery Approach

#### raine/claude-history (Rust)

**Entry point:** `get_claude_projects_root()` in `src/history/mod.rs`

```rust
pub fn get_claude_projects_root() -> Result<PathBuf> {
    let claude_dir = if let Ok(config_dir) = std::env::var("CLAUDE_CONFIG_DIR") {
        PathBuf::from(config_dir)
    } else {
        home_dir.join(".claude")
    };
    Ok(claude_dir.join("projects"))
}
```

**Discovery logic (`src/history/loader.rs`):**
1. Scan `~/.claude/projects/` for subdirectories
2. For each project dir, find all `.jsonl` files (excluding those in `subagents/`)
3. Parse each file in parallel using `rayon`
4. Does NOT use `history.jsonl` — does full directory scan every time

**Path encoding (`src/history/path.rs`):**
```rust
pub fn convert_path_to_project_dir_name(path: &Path) -> String {
    path.to_string_lossy().chars().map(|c| {
        if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' }
    }).collect()
}
```

**Worktree detection:** Recognizes `__worktrees/` and `/.worktrees/` in paths, displays as `project/branch`.

**Empty session filtering:** Skips sessions with no user/assistant messages (system-only).

---

#### jhlee/claude-code-history-viewer (Rust + React, Tauri)

**Entry point:** `scan_projects()` in `src-tauri/src/commands/project.rs`

```rust
pub async fn scan_projects(claude_path: String) -> Result<Vec<ClaudeProject>, String> {
    let projects_path = PathBuf::from(&claude_path).join("projects");
    // WalkDir depth 1, dedup symlinks by canonical path
    // For each dir: count .jsonl files, estimate message count from file size
}
```

**Discovery logic:**
1. `detect_claude_config_dir()` — checks `$CLAUDE_CONFIG_DIR` env var
2. Accepts custom base path from UI settings
3. Uses `WalkDir` at depth 1 on `projects/`
4. Deduplicates symlinks via `canonicalize()`
5. Sorts real directories before symlinks for stable display names
6. Does NOT use `history.jsonl` — scans filesystem directly

**Project name resolution (priority order):**
1. Decode folder name → check if path exists on filesystem
2. Read `cwd` field from newest JSONL entry in the project (most reliable)
3. Fallback to lossy folder name decode

**Message count estimation (fast scan optimization):**
```rust
fn estimate_message_count_from_size(file_size: u64) -> usize {
    // Avoids parsing every file during project listing
    // Uses average bytes-per-message heuristic
}
```

---

#### randlee/claude-history (Go)

**Entry point:** `pkg/paths/paths.go`

```go
func DefaultClaudeDir() string { return filepath.Join(os.UserHomeDir(), ".claude") }
// Override: --claude-dir global flag
```

**Discovery logic:**
1. `ListProjects()` — scan `~/.claude/projects/`, validate encoded names
2. `ListSessionFiles()` — find `*.jsonl` where filename is UUID format (len=36, dashes at 8,13,18,23)
3. `ListAgentFiles()` — recursive scan of `{sessionDir}/subagents/agent-*.jsonl`
4. Uses `sessions-index.json` if present (Claude-generated metadata cache)

**UUID validation:**
```go
// Only .jsonl files whose name is a valid UUID are sessions
// Length must be 36, dashes at positions 8, 13, 18, 23
func isValidSessionUUID(name string) bool { ... }
```

**Git-style prefix matching:** Session IDs support partial matches (e.g., `abc123` instead of full UUID). If ambiguous, lists all matches.

---

#### claude-historian-mcp (TypeScript, MCP server)

**Entry point:** `src/utils.ts`

```typescript
export function getClaudeBasePath(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}
export function getClaudeProjectsPath(): string {
  return join(getClaudeBasePath(), 'projects');
}
```

**Discovery logic (`src/search.ts`):**
1. `findProjectDirectories()` — `readdir` on `projects/`, parallel `stat()` per entry
2. Sort by `mtime` (most recently modified first)
3. Cache with 30s TTL to avoid repeated filesystem scans
4. Expands worktree directories to include parent projects

**Pre-filter optimization:**
```typescript
// Fast keyword check before full JSON parse (~10x faster)
private async fileContainsKeyword(projectDir, file, keyword): Promise<boolean> {
  const content = await readFile(filePath, 'utf-8');
  return content.toLowerCase().includes(keyword.toLowerCase());
}
```

---

#### claude-run (TypeScript, Node.js web server)

**Entry point:** `api/storage.ts`

```typescript
let claudeDir = join(homedir(), ".claude");    // override: --dir flag
let projectsDir = join(claudeDir, "projects");
```

**Discovery logic (unique — uses `history.jsonl` as primary index):**
1. `buildFileIndex()` — scan all `projects/*/` for `.jsonl` files, build `Map<sessionId, filePath>`
2. `loadHistoryCache()` — parse `~/.claude/history.jsonl` line by line
3. `getSessions()` — iterate history entries, resolve each to a file path
4. If entry lacks `sessionId`, uses `findSessionByTimestamp()` — finds closest file by mtime

**Path encoding:**
```typescript
function encodeProjectPath(path: string): string {
  return path.replace(/[/.]/g, '-');  // Only / and . → -
}
```

**Fallback when sessionId missing:**
```typescript
// Match history entry to file by closest modification time
async function findSessionByTimestamp(project, timestamp) {
  const files = await readdir(projectDir);
  // Find .jsonl with mtime closest to entry timestamp
}
```

---

#### claude-conversation-extractor (Python)

**Entry point:** `src/extract_claude_logs.py`

```python
class ClaudeConversationExtractor:
    def __init__(self):
        self.claude_dir = Path.home() / ".claude" / "projects"  # hardcoded
```

**Discovery logic (simplest of all):**
```python
def find_sessions(self, project_path=None):
    search_dir = self.claude_dir / project_path if project_path else self.claude_dir
    for jsonl_file in search_dir.rglob("*.jsonl"):
        sessions.append(jsonl_file)
    return sorted(sessions, key=lambda x: x.stat().st_mtime, reverse=True)
```

No env var support, no `history.jsonl`, no UUID validation — just recursive glob for all `.jsonl` files.

---

### Discovery Comparison Table

| Feature | raine | jhlee/CCHV | randlee | historian | claude-run | extractor |
|---|---|---|---|---|---|---|
| `$CLAUDE_CONFIG_DIR` | ✅ | ✅ | ✅ (flag) | ✅ | ❌ | ❌ |
| Uses `history.jsonl` | ❌ | ❌ | ❌ | ❌ | ✅ (primary) | ❌ |
| Uses `sessions-index.json` | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| UUID validation | ❌ | ❌ | ✅ (strict) | ❌ | ❌ | ❌ |
| Symlink dedup | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Worktree support | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Sub-agent discovery | ✅ | ✅ | ✅ (recursive) | ❌ | ❌ | ❌ |
| File watcher | ❌ | ✅ (Tauri) | ❌ | Cache TTL | ✅ (chokidar) | ❌ |
| Size-based estimation | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Parallel scanning | ✅ (rayon) | ✅ (WalkDir) | ✅ (goroutines) | ✅ (Promise.all) | ✅ (Promise.all) | ❌ |

---

## 2. JSONL Parsing — How Raw Data Becomes Messages

### The JSONL Entry Format (Ground Truth)

Each line in a `{uuid}.jsonl` file is a self-contained JSON object. Key fields discovered from actual session files on this machine:

**Entry types:**
```
permission-mode       → Session config (permissionMode, sessionId)
file-history-snapshot → File state snapshot (snapshot, messageId)
user                  → User message
assistant             → AI response (has model, usage, content blocks)
summary               → Auto-generated conversation summary
```

**User entry structure:**
```json
{
  "type": "user",
  "uuid": "abc123-...",
  "parentUuid": "prev-uuid",
  "sessionId": "session-uuid",
  "timestamp": "2026-07-01T10:00:00.000Z",
  "cwd": "/Users/foo/project",
  "gitBranch": "feature/bar",
  "entrypoint": "cli",
  "isSidechain": false,
  "userType": "external",
  "version": "2.1.187",
  "message": {
    "role": "user",
    "content": "text string or content block array"
  }
}
```

**Assistant entry structure:**
```json
{
  "type": "assistant",
  "uuid": "def456-...",
  "parentUuid": "abc123-...",
  "sessionId": "session-uuid",
  "timestamp": "2026-07-01T10:00:05.000Z",
  "cwd": "/Users/foo/project",
  "gitBranch": "feature/bar",
  "isSidechain": false,
  "requestId": "req-id",
  "message": {
    "role": "assistant",
    "id": "msg_id",
    "type": "message",
    "model": "claude-sonnet-4-6",
    "content": [
      {"type": "text", "text": "Here's my response..."},
      {"type": "tool_use", "id": "toolu_01...", "name": "Read", "input": {"path": "/file.ts"}},
      {"type": "thinking", "thinking": "Let me analyze..."}
    ],
    "usage": {
      "input_tokens": 3,
      "output_tokens": 107,
      "cache_creation_input_tokens": 15625,
      "cache_read_input_tokens": 16046,
      "server_tool_use": {"web_search_requests": 0},
      "service_tier": "standard"
    },
    "stop_reason": "end_turn",
    "stop_details": {"reason": "end_turn"}
  }
}
```

**Content block types within `message.content`:**

| Type | Fields | Description |
|---|---|---|
| `text` | `text` | Plain text or markdown |
| `tool_use` | `id`, `name`, `input` | Tool invocation (Read, Write, Bash, etc.) |
| `tool_result` | `tool_use_id`, `content`, `is_error` | Tool output (may be huge) |
| `thinking` | `thinking` | Extended thinking block |

---

### How Each Project Parses JSONL

#### raine/claude-history

**Parser:** `src/history/parser.rs` (~71K lines including tests)

**Approach:** Stream-parse with deduplication by message ID.

Key logic:
- Tracks `token_usage_by_msg: HashMap<String, TokenUsage>` to deduplicate streaming entries
- Claude Code sometimes emits multiple assistant entries with the same `message.id` (progressive streaming). Only the last one's token count is used.
- Anonymous entries (no message ID) have tokens summed directly.
- Calculates `duration_minutes` from first/last message timestamps.

**What it extracts per session:**
```rust
pub struct Conversation {
    pub path: PathBuf,
    pub timestamp: DateTime<Local>,
    pub preview: String,              // first 3 messages
    pub preview_first: String,        // first 3 messages
    pub preview_last: String,         // last 3 messages
    pub full_text: String,            // all message text concatenated
    pub message_count: usize,
    pub model: Option<String>,        // from first assistant message
    pub total_tokens: u64,            // sum of all usage
    pub duration_minutes: Option<u64>,
    pub summary: Option<String>,      // from summary entry
    pub custom_title: Option<String>,
    pub project_name: Option<String>,
    pub cwd: Option<PathBuf>,
    pub semantic_turns: Vec<String>,  // for semantic search indexing
}
```

**Filtering applied during parse:**
- Skips "warmup" messages (Claude's internal system setup)
- Skips "clear metadata" messages (from `/clear` command)
- Filters `file-history-snapshot` entries entirely
- `skip_next_assistant` flag after clear commands

---

#### jhlee/CCHV

**Parser:** `src-tauri/src/commands/session/load.rs` (~2300 lines)

**Approach:** Full parse into structured `ClaudeMessage` model.

```rust
pub struct ClaudeMessage {
    pub message_type: String,     // user, assistant, summary, etc.
    pub timestamp: Option<String>,
    pub content: Vec<ContentBlock>,
    pub is_sidechain: Option<bool>,
    pub usage: Option<TokenUsage>,
    pub role: Option<String>,
    pub model: Option<String>,
    pub stop_reason: Option<String>,
    pub cost_usd: Option<f64>,       // read directly from JSONL if present
    pub duration_ms: Option<u64>,
    pub message_id: Option<String>,
    pub tool_use_id: Option<String>,
    pub parent_tool_use_id: Option<String>,
}
```

**Content blocks parsed:**
```rust
pub enum ContentBlock {
    Text { text: String },
    ToolUse { id: String, name: String, input: Value },
    ToolResult { tool_use_id: String, content: String, is_error: bool },
    Thinking { thinking: String },
    ServerToolUse { id: String, name: String, input: Value },
}
```

**Noise filtering:**
- `progress`, `queue-operation`, `file-history-snapshot` → skipped for message display
- Still counted for token stats if they have `usage` field
- Sidechain messages optionally excluded from stats

**Subagent handling:** Recognizes nested JSONL files in `{session}/subagents/` and presents them as collapsible tree.

---

#### randlee/claude-history (Go)

**Parser:** `internal/jsonl/scanner.go` + `pkg/models/entry.go`

**Approach:** Streaming scanner with 10MB max line buffer.

```go
type ConversationEntry struct {
    UUID          string
    SessionID     string
    AgentID       string          // empty for main session
    IsSidechain   bool
    Type          EntryType       // user, assistant, system, queue-operation, summary
    ParentUUID    *string
    Timestamp     string
    Message       json.RawMessage // parsed lazily
    ToolUseResult *ToolUseResult  // agent spawn detection
}
```

**Message content parsing (lazy):**
1. Try unwrap `{role, content}` envelope
2. Content can be: plain string, array of content blocks, or single block
3. Content block types: `text`, `tool_use` (id/name/input), `tool_result` (tool_use_id/content)

**Agent spawn detection (two methods):**
- Old: `queue-operation` entry with `agentId`
- New: User entry where `toolUseResult.status == "async_launched"`

**Does NOT extract:** costs, token counts. Purely conversation content and structure.

---

#### claude-historian-mcp

**Parser:** `src/parser.ts`

**Approach:** Line-by-line with relevance scoring during parse.

Parses directly into search-optimized structures. Extracts:
- Role (user/assistant)
- Content text (stripped of tool results for readability)
- Tool names and operations
- File paths referenced in tool_use inputs
- Timestamps for time-range filtering

**Unique "scope" classification during parse:**
Each message is tagged with one of 11 scopes:
`conversations`, `files`, `errors`, `plans`, `config`, `tasks`, `sessions`, `tools`, `similar`, `memories`, `summary`

---

#### claude-run

**Parser:** `api/storage.ts`

**Approach:** Full parse with streaming support via byte-offset tracking.

```typescript
interface ConversationMessage {
    type: "user" | "assistant" | "summary" | "file-history-snapshot";
    message?: { role: string; content: ContentBlock[]; model?: string; usage?: TokenUsage };
    timestamp?: string;
    uuid?: string;
    parentUuid?: string;
    sessionId?: string;
}
```

**Streaming parse for live sessions:**
```typescript
async function getConversationStream(filePath, fromOffset) {
  // Opens file, seeks to byte offset, reads new lines
  // If JSON.parse fails on a line → assumes incomplete write, stops
  return { messages, nextOffset };
}
```

**Summary handling:** `summary` type entries are `unshift()`ed to the front of the messages array (displayed as header card).

---

#### claude-conversation-extractor

**Parser:** `src/extract_claude_logs.py`

**Approach:** Simple line-by-line, user/assistant only.

```python
def extract_conversation(self, jsonl_path, detailed=False):
    for line in f:
        entry = json.loads(line.strip())
        if entry.get("type") == "user" and "message" in entry:
            text = self._extract_text_content(content)
            conversation.append({"role": "Human", "content": text})
        elif entry.get("type") == "assistant" and "message" in entry:
            # Extract text blocks, optionally tool_use blocks
            conversation.append({"role": "Assistant", "content": text})
```

Simplest parser — only user + assistant, outputs to markdown.

---

### Parsing Comparison

| Feature | raine | jhlee/CCHV | randlee | historian | claude-run | extractor |
|---|---|---|---|---|---|---|
| Streaming parse | ✅ | ✅ | ✅ (10MB buffer) | ✅ | ✅ (byte offset) | ❌ (all in memory) |
| Dedup by msg ID | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Lazy content parse | ❌ | ❌ | ✅ (RawMessage) | ❌ | ❌ | ❌ |
| Token extraction | ✅ | ✅ | ❌ | Interface only | ✅ | ❌ |
| Tool call parsing | ✅ | ✅ (full) | ✅ | ✅ (names+paths) | ✅ (renderers) | Optional |
| Thinking blocks | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Sub-agent parsing | ✅ | ✅ | ✅ (recursive) | ❌ | ❌ | ❌ |
| Sidechain filtering | ✅ | ✅ (optional) | ❌ | ❌ | ❌ | ❌ |

---

## 3. Content Sanitization & Data Massaging

### What Gets Stripped Before Display

Claude Code injects internal XML tags and system prompts into messages. All projects strip these before showing content to users.

#### claude-run's sanitization patterns (most explicit):

```typescript
const SANITIZE_PATTERNS = [
  /<command-name>[^<]*<\/command-name>/g,
  /<command-message>[^<]*<\/command-message>/g,
  /<command-args>[^<]*<\/command-args>/g,
  /<local-command-stdout>[^<]*<\/local-command-stdout>/g,
  /<system-reminder>[\s\S]*?<\/system-reminder>/g,
  /^\s*Caveat:.*?unless the user explicitly asks you to\./s,
];
```

#### raine/claude-history's filtering:

- **Warmup messages:** First user message that's just system setup → skipped
- **Clear metadata:** Messages from `/clear` command → filtered
- **`file-history-snapshot`:** Entirely excluded
- **Agent skill previews:** Detected and displayed differently
- **Empty conversations:** Sessions with only system messages → hidden from list

#### jhlee/CCHV's noise types:

```rust
fn is_non_message_noise_type(message_type: &str) -> bool {
    matches!(message_type, "progress" | "queue-operation" | "file-history-snapshot")
}
```

#### historian's content cleanup:

Strips boilerplate patterns before scoring:
```typescript
const BOILERPLATE_PATTERNS = [
  'you are claude code',
  "hello! i'm claude",
  'i am claude',
  '@claude-plugins-official',
];
```

### Path Decoding Challenges

The encoding `/ → -` is **lossy** because `-` already exists in paths and `.` also becomes `-`. All projects deal with this differently:

| Project | Approach | Reliability |
|---|---|---|
| raine | Simple replace `- → /` | Low (ambiguous) |
| jhlee/CCHV | Check filesystem existence of decoded path; fallback to `cwd` from JSONL | High |
| randlee | Validate with `IsEncodedPath()` check (starts with `-` on Unix) | Medium |
| historian | Don't decode — use raw dir names for matching | Avoids problem |
| claude-run | Read `project` field from `history.jsonl` (has original path) | High |
| extractor | Use parent directory name directly | Low |

**CCHV's filesystem-based decoding (most robust):**
```rust
// Recursively try different split points to find existing paths
pub fn decode_with_filesystem_check(encoded: &str) -> Option<String> {
    // Try all possible hyphen positions as potential path separators
    // Return the first combination that exists on the filesystem
}
```

### Preview Generation

How each project creates the short description shown in session lists:

| Project | Preview Source | Length | Content |
|---|---|---|---|
| raine | First 3 messages (or last 3, configurable) | Variable | Full message text, concatenated |
| jhlee/CCHV | First user message content | ~200 chars | Truncated first prompt |
| randlee | `firstPrompt` from sessions-index.json, or first 200 chars of first user msg | 200 chars | First user message |
| historian | Not applicable (MCP — no list view) | – | – |
| claude-run | `display` field from history.jsonl | Variable | Claude's own first-prompt extraction |
| extractor | File path + mtime | – | No preview, just metadata |

### Model Name Formatting

raine's model name shortening for display:
```rust
fn format_model_name(model: &str) -> String {
    // "claude-opus-4-5-20251101"    → "opus-4.5"
    // "claude-sonnet-4-6"           → "sonnet-4"
    // "claude-3-5-sonnet-20240620"  → "3.5-sonnet"
    // Anything > 20 chars → truncated with "…"
}
```

---

## 4. Token Usage & Metrics — Extraction and Calculation

### Where Token Data Lives

Token usage is embedded in **assistant** entries only, in `message.usage`:

```json
{
  "input_tokens": 3,
  "output_tokens": 107,
  "cache_creation_input_tokens": 15625,
  "cache_read_input_tokens": 16046,
  "server_tool_use": {"web_search_requests": 0, "web_fetch_requests": 0},
  "service_tier": "standard",
  "cache_creation": {
    "ephemeral_1h_input_tokens": 15625,
    "ephemeral_5m_input_tokens": 0
  },
  "inference_geo": "global",
  "speed": "standard"
}
```

**Key fields for metrics:**

| Field | Meaning |
|---|---|
| `input_tokens` | New tokens sent to model (not cached) |
| `output_tokens` | Tokens generated by model |
| `cache_creation_input_tokens` | Tokens written to prompt cache |
| `cache_read_input_tokens` | Tokens read from cache (much cheaper) |

**Note:** `cost_usd` and `duration_ms` fields exist in the JSONL schema but are NOT populated by current Claude Code versions on this machine. CCHV reads them when present but doesn't calculate cost independently.

### How Each Project Handles Tokens

#### raine/claude-history — Deduplication + Summation

**Problem:** Claude Code emits multiple progressive updates for a single assistant message (streaming). Each has the same `message.id` but updated token counts. Naive summation would double/triple count.

**Solution:**
```rust
let mut token_usage_by_msg: HashMap<String, TokenUsage> = HashMap::new();
let mut anonymous_token_count: u64 = 0;

// During parse:
if let Some(usage) = &message.usage {
    if let Some(msg_id) = &message.id {
        // Last update for this msg_id wins
        token_usage_by_msg.insert(msg_id.clone(), usage.clone());
    } else {
        // No message ID — sum directly (can't dedup)
        anonymous_token_count += usage.input_tokens
            + usage.output_tokens
            + usage.cache_creation_input_tokens
            + usage.cache_read_input_tokens;
    }
}

// After parse — final summation:
let total_tokens: u64 = token_usage_by_msg.values()
    .map(|u| u.input_tokens + u.output_tokens
        + u.cache_creation_input_tokens + u.cache_read_input_tokens)
    .sum::<u64>()
    + anonymous_token_count;
```

**Presentation:** `format_tokens()` → "926k tokens", "1.2M tokens", "500 tokens"
```rust
fn format_tokens(tokens: u64) -> String {
    if tokens >= 1_000_000 { format!("{:.1}M", tokens as f64 / 1_000_000.0) }
    else if tokens >= 1_000 { format!("{}k", tokens / 1_000) }
    else { tokens.to_string() }
}
```

**Display location:** In the session list, each entry shows: `project · model · N messages · duration · tokens · timestamp`

#### jhlee/CCHV — Full Token Breakdown + Stats Dashboard

**Token extraction:**
```rust
pub struct TokenUsage {
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
    pub cache_creation_input_tokens: Option<u32>,
    pub cache_read_input_tokens: Option<u32>,
}

fn token_usage_totals(usage: &TokenUsage) -> (u64, u64, u64, u64, u64) {
    let input = usage.input_tokens.unwrap_or(0) as u64;
    let output = usage.output_tokens.unwrap_or(0) as u64;
    let cache_creation = usage.cache_creation_input_tokens.unwrap_or(0) as u64;
    let cache_read = usage.cache_read_input_tokens.unwrap_or(0) as u64;
    let total = input + output + cache_creation + cache_read;
    (input, output, cache_creation, cache_read, total)
}
```

**Stats modes:**
```rust
enum StatsMode {
    All,               // All entries including noise
    ConversationOnly,  // Only user + assistant messages
    ExcludeSidechain,  // Skip sidechain/subagent messages
}
```

**Sidechain handling:** Can exclude sidechain messages from stats (these are Claude's "internal" reasoning chains).

**Frontend display:** `TokenStatsViewer.tsx` — shows breakdown:
- Input tokens (blue)
- Output tokens (green)
- Cache creation tokens (purple)
- Cache read tokens (orange)
- Total tokens

**Analytics dashboard (`AnalyticsDashboard/`):**
- Activity heatmap (daily sessions x tokens)
- Daily trend chart (tokens over time)
- Token distribution pie/donut chart
- Per-project token totals

**Number formatting:**
```typescript
export const formatNumber = (num: number): string => {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
};
```

---

#### randlee/claude-history — No Token Tracking

Does not extract or display token usage. Focused purely on conversation content, agent hierarchy, and export.

---

#### claude-historian-mcp — Token Estimation (Heuristic)

Does not read actual token counts. Instead estimates output size:
```typescript
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);  // chars/4 heuristic
}
```

Used only for response size estimation in MCP tool output, not for user-facing metrics.

---

#### claude-run — Interface Defined, Not Displayed

Has the `TokenUsage` interface:
```typescript
export interface TokenUsage {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
}
```

Token data is parsed from JSONL but **never rendered in the UI**. The web interface shows messages and tools but no token metrics.

---

#### claude-conversation-extractor — No Token Tracking

Does not extract or display token usage. Export-only tool.

---

### Cost Calculation

**No project calculates cost independently.** Here's why:
- The `cost_usd` field in JSONL is rarely populated by current Claude Code versions
- Model pricing changes frequently and varies by plan
- Cache read tokens are priced differently (much cheaper) than input tokens
- No project maintains a pricing table

**CCHV's approach:** Read `cost_usd` directly from the JSONL if present (passthrough). No independent calculation.

**Theoretical pricing formula (if someone were to implement it):**
```
cost = (input_tokens * input_price_per_M / 1M)
     + (output_tokens * output_price_per_M / 1M)
     + (cache_creation_tokens * cache_write_price_per_M / 1M)
     + (cache_read_tokens * cache_read_price_per_M / 1M)
```

### Duration Calculation

Only raine calculates session duration:
```rust
let duration_minutes = match (first_timestamp, last_timestamp) {
    (Some(first), Some(last)) => {
        let duration = last.signed_duration_since(first);
        let minutes = duration.num_minutes();
        if minutes > 0 { Some(minutes as u64) } else { None }
    }
    _ => None,
};
```

Displayed as: `"< 1m"`, `"5m"`, `"1h 23m"`, `"2h+"` etc.

---

## 5. Presentation & UI Patterns

### Session List Display

| Project | Format | Sort | Info Shown Per Item |
|---|---|---|---|
| raine | Terminal list (ratatui) | Recency (default), relevance (search) | project · model · messages · duration · tokens · timestamp · preview |
| jhlee/CCHV | Sidebar tree + cards | Recency, grouped by project | Project name, session title, timestamp, message count, token badge |
| randlee | CLI table output | Recency | Session ID (prefix), first prompt, timestamp, message count |
| historian | MCP tool output (text) | Relevance score (0-100) | Score · timestamp · project · snippet |
| claude-run | Sidebar + main panel | Recency | Display text, project name, relative timestamp |
| extractor | Interactive menu | Recency (mtime) | File path, mtime, file size |

### Message Rendering

#### raine — Terminal markdown + vim-style navigation

- Renders markdown in terminal using custom `markdown/layout.rs` (41K lines)
- Syntax highlighting for code blocks via `syntect`
- Vim keybindings: `j/k` scroll, `/` search, `n/N` next/prev match
- Tool calls shown as `[tool: Read] path/to/file.ts` with collapsible output
- Timestamps shown as "ledger" column alongside messages

#### jhlee/CCHV — Rich React rendering with specialized renderers

**Message renderers (`src/components/messageRenderer/`):**
- User messages: distinct styling
- Assistant messages: react-markdown with GFM support
- ANSI escape code rendering (for bash output with colors)
- Image display support

**Tool renderers (`src/components/toolResultRenderer/`):**
- 20+ specialized renderers for different tools
- `EditRenderer` — unified diff with syntax highlighting
- `WriteRenderer` — file creation with line count
- `BashRenderer` — command + output with ANSI colors
- `GrepRenderer` / `GlobRenderer` — search patterns
- `ReadRenderer` — file contents with line numbers
- `TaskRenderer` — subagent invocations with agent type coloring

**Content renderers (`src/components/contentRenderer/`):**
- Handles all content block types
- Thinking blocks: collapsible with amber styling
- Tool results: teal (success) / rose (error) styling
- Code blocks: syntax highlighted (Prism)

#### claude-run — React web UI with markdown

- User: indigo bubble, right-aligned
- Assistant: cyan bubble, left-aligned, markdown
- Tool calls: collapsible pill buttons with tool-specific icons
- Thinking: collapsible amber pill
- Tool results: teal/rose pills (success/error)
- Edit diffs: unified diff format using `diff` npm package
- Summary: card at top of conversation

#### historian — Plain text with scroll-corner formatting

```
📁 — search "query" — 5 results

  [score: 87] 2026-07-01 | project-name
  > matching snippet with context...

  [score: 72] 2026-06-28 | other-project
  > another matching snippet...
```

#### extractor — Markdown export format

```markdown
## Human

What is the current state of the database schema?

## Assistant

Based on my analysis of the codebase...
```

---

## 6. Search Implementation

### Search Approaches

| Project | Type | Scope | Speed |
|---|---|---|---|
| raine | Fuzzy + semantic | All message text + tool outputs | Instant (in-memory index) |
| jhlee/CCHV | Text search | Session titles + message content | Fast (Web Worker) |
| randlee | Regex + time + tool filters | Configurable per query | On-demand parse |
| historian | Relevance-scored + time-filtered | 11 scopes | Cached (30s TTL) |
| claude-run | Substring | Session display text + project name | Instant (client-side) |
| extractor | Real-time substring | All message content | Sequential scan |

### raine — Most Sophisticated Search

**Fuzzy search (`src/search/lexical.rs`, 36K lines):**
- Field-aware relevance scoring
- Prefix matching + word boundary awareness
- Tool output indexing
- Quoted exact matches
- Evidence snippets showing match context

**Semantic search (`src/semantic/`, experimental):**
- Uses `fastembed` for local embeddings (ONNX runtime)
- Chunks conversations into semantic turns
- Vector similarity search across all sessions
- Cache persisted to disk for fast reload

**Search in viewer:**
- `/` enters search mode within a conversation
- `n / N` for next/prev match
- Highlights matching text

### jhlee/CCHV — Web Worker Search

**`src/utils/searchWorker.ts` (14K lines):**
- Runs in Web Worker (non-blocking UI)
- Indexes session titles and message content
- Supports glob patterns for file filtering

**`src/utils/searchIndex.ts` (26K lines):**
- Full-text search index built from loaded sessions
- Trigram-based for substring matching
- Results ranked by recency + relevance

### historian — Scoped Search with Semantic Boosting

**11 search scopes:**

`conversations, files, errors, plans, config, tasks, sessions, tools, similar, memories, summary`

**Query intent classification:**
```typescript
analyzeQueryIntent(query) => {
    type: 'error' | 'implementation' | 'general',
    urgency: 'high' | 'medium',
    scope: 'broad' | 'focused',
    expectsCode: boolean,
    expectsSolution: boolean,
    semanticBoosts: { errorResolution: 3.0, implementation: 2.5, ... }
}
```

**Optimized pipeline:**
1. Pre-filter: raw string search before JSON parse (~10x faster)
2. Parse only files that contain keyword
3. Score messages with semantic boosts
4. Normalize scores to 0-100 within result set

### randlee — CLI Query Filters

**All combinable filters:**
```bash
ch query \
  --session abc123 \      # git-style prefix match
  --agent def456 \        # specific sub-agent
  --type user,assistant \ # entry type filter
  --start 2026-07-01 \    # date range
  --end 2026-07-07 \
  --tool bash,read \      # tool name filter
  --tool-match "*.go" \   # regex against tool inputs
  --text "database" \     # case-insensitive content search
  --include-agents        # recursive sub-agent inclusion
```

---

## 7. Real-Time / Live Updates

| Project | Mechanism | What it watches | Latency |
|---|---|---|---|
| raine | None (re-scan on launch) | – | – |
| jhlee/CCHV | Tauri FSEvents/inotify | `~/.claude/projects/` | ~100ms |
| randlee | None (CLI invocation) | – | – |
| historian | In-memory cache, 30s TTL | Re-scans on cache miss | 0-30s |
| claude-run | chokidar + SSE | `history.jsonl` + `projects/` depth 2 | 20ms debounce |
| extractor | None (CLI invocation) | – | – |

### claude-run's SSE Streaming (most sophisticated live updates):

**Server-side:**
```typescript
// SSE endpoint for new sessions
app.get('/api/sessions/stream', (c) => {
    // Watches history.jsonl changes via chokidar
    // Pushes new/updated sessions as they appear
    // 30s heartbeat to keep connection alive
});

// SSE endpoint for live conversation streaming
app.get('/api/conversation/:id/stream', (c) => {
    // Byte-offset tracking on session .jsonl file
    // Only reads newly appended bytes
    // Pushes new messages as Claude writes them
});
```

**Client-side:**
```typescript
// Exponential backoff retry (up to 10 retries, max 30s delay)
// Separate EventSource connections for session list and active conversation
```

---

## 8. Export Capabilities

| Project | Formats | Scope |
|---|---|---|
| raine | Clipboard (text/markdown), HTML (auto-opens browser) | Per-session or selection |
| jhlee/CCHV | Markdown, JSON, clipboard | Per-session |
| randlee | HTML (standalone folder with CSS/JS), JSONL (original) | Per-session + all agents |
| historian | None (MCP output only) | – |
| claude-run | Copy resume command to clipboard | Single command |
| extractor | Markdown files, bulk export all sessions | Per-session or all |

### randlee's HTML Export (most complete):

```
export-{sessionId}/
├── index.html          ← Main conversation (auto-opens in browser)
├── agents/
│   └── agent-{id}.html  ← Lazy-loaded sub-agent fragments
├── source/
│   └── {session}.jsonl  ← Original file for "resurrection"
├── manifest.json        ← Metadata, tree, entry counts
├── style.css
└── script.js
```

---

## Summary: Optimal Approach for Context Bar

Based on this research, Context Bar should combine the best of each:

| Aspect | Best Practice | Source |
|---|---|---|
| Discovery | Read `history.jsonl` as primary index | claude-run |
| Path resolution | `cwd` from JSONL as ground truth | jhlee/CCHV |
| Token dedup | HashMap by message ID | raine |
| Fast scan | File size estimation for message count | jhlee/CCHV |
| Sanitization | Strip XML tags + system reminders | claude-run |
| Search | In-memory fuzzy on titles, on-demand content | raine + historian |
| Live updates | FSEvents on `history.jsonl` | claude-run + CCHV |
| Token display | Breakdown (input/output/cache) with K/M formatting | jhlee/CCHV + raine |
| Duration | First/last timestamp diff | raine |
| Preview | `display` from history.jsonl (pre-computed) | claude-run |
| Model display | Short name formatting | raine |
