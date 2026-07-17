# Implementation Plan: Session History Viewer for Context Bar

## Overview

Add a Claude Code session history browser to Context Bar's menu bar popover. Users can browse, search, and inspect past conversations without leaving their workflow.

**Goal:** Surface the same session data that `claude-history`, `claude-code-history-viewer`, and similar tools provide, but integrated into Context Bar's menu bar UX — instant access, no terminal required.

---

## Data Sources

### Primary: `~/.claude/history.jsonl` (Master Index)

Each line is a JSON object:
```json
{
  "display": "first user prompt or /command",
  "timestamp": 1779899138750,              // epoch ms
  "project": "/Users/.../juno",            // original project path
  "sessionId": "cd813109-7f12-4475-863b-b4c263e0942f",
  "pastedContents": {}                     // optional
}
```

- ~550 entries on a typical dev machine
- Sorted chronologically (newest at bottom)
- Some entries lack `sessionId` (older format)

### Secondary: `~/.claude/projects/{encoded-path}/{uuid}.jsonl` (Full Sessions)

Session JSONL files with one entry per line. Path encoding: `/Users/foo/bar` → `-Users-foo-bar`.

**Entry types:**

| Type | Purpose | Key Fields |
|---|---|---|
| `permission-mode` | Session config | `permissionMode`, `sessionId` |
| `file-history-snapshot` | File state at that point | `snapshot`, `messageId` |
| `user` | User message | `message.content`, `uuid`, `timestamp`, `cwd`, `gitBranch` |
| `assistant` | AI response | `message.content`, `message.model`, `message.usage`, `uuid`, `timestamp` |
| `summary` | Conversation summary | `summary` text |

**Assistant message.usage:**
```json
{
  "input_tokens": 3,
  "cache_creation_input_tokens": 15625,
  "cache_read_input_tokens": 16046,
  "output_tokens": 107,
  "server_tool_use": {"web_search_requests": 0},
  "service_tier": "standard"
}
```

**Content block types** (in `message.content` array):
- `text` — plain text / markdown
- `tool_use` — tool invocation with `id`, `name`, `input`
- `tool_result` — tool output with `tool_use_id`, `content`, `is_error`
- `thinking` — extended thinking blocks

### Scale on this machine
- 14 project directories
- 160 session files
- 57 MB total
- Largest file: 5.1 MB
- 550 history entries

---

## Architecture

### Backend (Rust, in `src-tauri/src/engine/`)

```
engine/
├── history/
│   ├── mod.rs        # Public API: list_sessions, get_session, search
│   ├── index.rs      # Parse history.jsonl, build in-memory index
│   ├── parser.rs     # JSONL streaming parser for session files
│   ├── types.rs      # SessionEntry, Message, ContentBlock, Usage
│   ├── search.rs     # Full-text search across sessions
│   └── watcher.rs    # FSEvents watcher for history.jsonl changes
```

### Frontend (React, in `src/components/`)

```
components/
├── history/
│   ├── HistoryPanel.tsx     # Main panel (replaces/adds tab in popover)
│   ├── SessionList.tsx      # Virtualized session list with search
│   ├── SessionDetail.tsx    # Conversation viewer
│   ├── MessageBubble.tsx    # Individual message rendering
│   ├── ToolCallBlock.tsx    # Collapsible tool use/result display
│   └── SessionStats.tsx     # Token usage summary per session
```

---

## Implementation Phases

### Phase 1: Session Index & List View (MVP)

**Backend:**

1. **`history/types.rs`** — Define structs:
```rust
pub struct SessionEntry {
    pub session_id: String,
    pub display: String,        // first prompt
    pub timestamp: u64,         // epoch ms
    pub project: String,        // decoded project path
    pub project_name: String,   // last path component
}

pub struct SessionDetail {
    pub session_id: String,
    pub messages: Vec<Message>,
    pub total_tokens: TokenUsage,
    pub model: Option<String>,
    pub duration_ms: Option<u64>,
}

pub struct Message {
    pub role: String,               // user | assistant
    pub content: Vec<ContentBlock>,
    pub timestamp: Option<String>,
    pub model: Option<String>,
    pub usage: Option<TokenUsage>,
}

pub struct ContentBlock {
    pub block_type: String,       // text, tool_use, tool_result, thinking
    pub text: Option<String>,
    pub tool_name: Option<String>,
    pub tool_input: Option<String>,
    pub tool_result: Option<String>,
    pub is_error: bool,
}

pub struct TokenUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_creation_tokens: u64,
}
```

2. **`history/index.rs`** — Parse `~/.claude/history.jsonl`:
   - Read file line-by-line (150KB, fast)
   - Deserialize each line into `SessionEntry`
   - Sort by timestamp descending
   - Decode project path from encoded directory name
   - Cache in memory with TTL (refresh on FSEvents)

3. **`history/parser.rs`** — Stream-parse session JSONL:
   - Use `BufReader` line-by-line (sessions can be 5MB+)
   - Skip `permission-mode` and `file-history-snapshot` entries
   - Extract `user` and `assistant` messages
   - Parse content blocks array
   - Accumulate token usage from all assistant entries
   - Set max buffer size to 10MB per line (like randlee's scanner)

4. **IPC Commands** (in `lib.rs`):
```rust
#[tauri::command]
async fn list_sessions(limit: usize, offset: usize, project_filter: Option<String>) -> Vec<SessionEntry>;

#[tauri::command]
async fn get_session(session_id: String) -> SessionDetail;

#[tauri::command]
async fn list_projects() -> Vec<String>;
```

**Frontend:**

5. **`HistoryPanel.tsx`** — New tab/view in the popover:
   - Project filter dropdown (deduplicated from all sessions)
   - Search input
   - Scrollable session list (virtualized — @tanstack/virtual if needed)
   - Each item shows: first prompt (truncated), project name, relative time, token count badge

6. **`SessionList.tsx`** — Virtualized list:
   - Load 50 sessions initially, paginate on scroll
   - Click opens `SessionDetail`
   - Relative timestamps ("2h ago", "yesterday")

**Effort:** ~3-4 days

---

### Phase 2: Conversation Viewer

**Backend:**

7. **Enhanced parser** — Parse all content block types:
   - `tool_use`: extract tool name + first 200 chars of input
   - `tool_result`: extract output text, handle `is_error`
   - `thinking`: extract thinking text
   - Handle string content (user messages) vs array content (assistant)

**Frontend:**

8. **`SessionDetail.tsx`** — Full conversation view:
   - Back button to return to list
   - Header: project name, timestamp, total tokens, model, duration
   - "Resume" button: copies `cd <project> && claude --resume <id>` to clipboard
   - Scrollable message list

9. **`MessageBubble.tsx`** — Message rendering:
   - User: simple text, right-aligned or distinct styling
   - Assistant: markdown rendered (react-markdown already in deps)
   - Different background colors per role

10. **`ToolCallBlock.tsx`** — Collapsible tool blocks:
    - Pill/badge showing tool name (Read, Write, Bash, Grep, etc.)
    - Click to expand: show input + output
    - Error results highlighted in red
    - Thinking blocks collapsed by default

**Effort:** ~2-3 days

---

### Phase 3: Search

**Backend:**

11. **`history/search.rs`** — Full-text search:
    - **Level 1 (fast):** Search `display` field in history index (already in memory)
    - **Level 2 (on-demand):** Scan session JSONL files for matching text
    - Case-insensitive substring matching
    - Return matches with context snippet (±50 chars around match)
    - Limit concurrent file reads (tokio semaphore, max 4 parallel)

12. **IPC Command:**
```rust
#[tauri::command]
async fn search_sessions(query: String, scope: SearchScope) -> Vec<SearchResult>;

pub enum SearchScope {
    Titles,      // history.jsonl display field only
    Content,     // full session content
}

pub struct SearchResult {
    pub session_id: String,
    pub display: String,
    pub project: String,
    pub timestamp: u64,
    pub snippet: Option<String>,   // matching context
    pub match_count: u32,
}
```

**Frontend:**

13. **Search UI:**
    - Debounced input (300ms)
    - Results show matching snippet with highlighted terms
    - Scope toggle: "Titles" (instant) vs "Content" (may take 1-2s)
    - Loading indicator for content search

**Effort:** ~2 days

---

### Phase 4: Live Updates & Polish

14. **FSEvents watcher** — Watch `~/.claude/history.jsonl` for changes:
    - Reuse existing FSEvents infrastructure in Context Bar
    - On change: re-parse index, emit event to frontend
    - Frontend auto-prepends new sessions to list

15. **Token stats summary:**
    - Per-session: total input/output/cache tokens
    - Estimated cost calculation (model-specific rates)
    - Show in session list as badge

16. **Export:**
    - Copy conversation as markdown to clipboard
    - Export session as .md file

17. **Keyboard navigation:**
    - `↑ / ↓` to navigate sessions
    - `Enter` to open
    - `Esc` to go back
    - `Cmd+F` to focus search

**Effort:** ~2 days

---

## Key Design Decisions

### Why not use `claude mcp list` approach (like historian)?
Context Bar is a GUI app that should show history instantly. Parsing local files is faster and more reliable than running CLI commands with timeouts.

### Why stream-parse vs load-all?
Session files can be 5MB+. Loading all 160 files (57MB) into memory is wasteful. Instead:
- Index: always in memory (150KB, fast)
- Sessions: parsed on-demand when opened
- Search: stream-scanned with early termination

### Why not a database/SQLite?
The source data is JSONL files that change when Claude Code runs. A database would need syncing logic, conflict resolution, and migration handling. Direct file parsing is simpler, always consistent with source, and fast enough at this scale (57MB across 160 files).

### Where does it live in the UI?
Add a "History" tab alongside the existing "Tools" / "Skills" / "MCPs" views in the popover. The menu bar app is always available — one click to search past sessions.

### Virtual scrolling?
Yes, for the session list. 550 sessions need virtualization. The conversation viewer within a session can use standard scrolling (most sessions are <100 messages visible at once).

---

## Comparison with Existing Tools

| Feature | Context Bar (planned) | raine/claude-history | jhlee/CCHV | claude-run |
|---|---|---|---|---|
| UI type | Menu bar popover | Terminal TUI | Desktop app | Web app |
| Always available | ✅ (menu bar) | ❌ (launch manually) | ❌ (launch) | ❌ (start server) |
| Fuzzy search | ✅ | ✅ (best) | ✅ | Basic |
| Content search | ✅ | ✅ + semantic | ✅ | ❌ |
| Real-time updates | ✅ (FSEvents) | ❌ | ✅ (file watcher) | ✅ (SSE) |
| Token stats | ✅ | ❌ | ✅ (best) | ❌ |
| Multi-tool support | ❌ (Claude only) | ❌ | ✅ (25 tools) | ❌ |
| Export | Markdown | HTML + clipboard | Multiple formats | ❌ |
| Resume session | ✅ (copy cmd) | ✅ (direct) | ❌ | ✅ (copy cmd) |
| Install needed | Already installed | `cargo install` | Download app | `npx` |

**Context Bar's unique advantage:** Always one click away in the menu bar. No separate app to launch, no terminal to open. Complements the existing tool/skill/MCP views.

---

## Tech Stack Alignment

Context Bar already uses:
- **Tauri 2.0** — IPC commands, window management
- **Rust** — backend parsing (already handles JSONL for MCP configs)
- **React 19 + TypeScript** — frontend
- **Tailwind CSS v4** — styling
- **react-markdown** — already a dependency
- **FSEvents** — already watching config files

No new dependencies needed for Phase 1-3. The only potential addition is `@tanstack/react-virtual` for list virtualization (already used by claude-run).

---

## File Sizes & Performance Budget

| Operation | Target | Approach |
|---|---|---|
| Load session list | <100ms | Parse 150KB history.jsonl, cached |
| Open a session | <500ms | Stream-parse up to 5MB JSONL |
| Title search | <50ms | In-memory filter on cached index |
| Content search | <3s | Parallel scan 57MB across 160 files |
| Live update | <200ms | FSEvents + incremental index append |

---

## Future Enhancements (Not in scope)

- Semantic search (fastembed, like raine's tool)
- Multi-tool support (Gemini CLI, Cursor, etc. — like jhlee's CCHV)
- Analytics dashboard (daily activity, token usage over time)
- Agent tree visualization (like randlee's tool)
- Session diffing (compare two sessions)
- Cost tracking with model-specific pricing
