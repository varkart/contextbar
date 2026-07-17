# Multi-Agent Support via `ctx` — Integration Research

Yes — `ctx` is exactly the right integration path for multi-agent support. Here's how it fits.

---

## What `ctx` Does

`ctx` is a Rust CLI that:

1. Discovers local history files from 35+ coding agents automatically
2. Imports them into a normalized SQLite database (`~/.ctx/work.sqlite`)
3. Normalizes different formats (JSONL, SQLite, state files) into a unified schema: `sessions → events → citations`
4. Provides `search`, `show`, and `locate` commands

---

## Supported Agents (35+)

| Agent | Format `ctx` Reads |
|---|---|
| Claude Code | `~/.claude/projects/` JSONL |
| Codex | `~/.codex/sessions/` |
| Cursor | `~/.cursor/` transcripts |
| Gemini CLI / Antigravity | `~/.gemini/history/` |
| GitHub Copilot CLI | Session state files |
| Cline / Roo Code / Kilo Code | VS Code globalStorage |
| Kiro CLI | SQLite |
| Windsurf | Local history |
| OpenCode | SQLite |
| Goose | SQLite sessions |
| Zed | SQLite + Zstd threads |
| ForgeCode | SQLite |
| + 23 more | Various |

---

## Integration Approach for Context Bar

### Option A: Use `ctx` as the Backend (Recommended)

Instead of Context Bar parsing each agent's files directly, delegate to `ctx`:

```rust
// In Context Bar's Rust backend
use std::process::Command;

// Get all sessions across all agents
fn get_sessions() -> Vec<Session> {
    let output = Command::new("ctx")
        .args(["search", "*", "--format", "json", "--limit", "100"])
        .output()?;
    serde_json::from_slice(&output.stdout)?
}

// Search across all agents
fn search_history(query: &str) -> Vec<SearchResult> {
    let output = Command::new("ctx")
        .args(["search", query, "--format", "json"])
        .output()?;
    serde_json::from_slice(&output.stdout)?
}

// Get session detail
fn get_session(ctx_session_id: &str) -> SessionDetail {
    let output = Command::new("ctx")
        .args(["show", "session", ctx_session_id, "--format", "json"])
        .output()?;
    serde_json::from_slice(&output.stdout)?
}

// List providers/sources
fn get_agents() -> Vec<Agent> {
    let output = Command::new("ctx")
        .args(["sources", "--json"])
        .output()?;
    serde_json::from_slice(&output.stdout)?
}
```

### Option B: Read `ctx`'s SQLite Directly

`ctx` stores everything in `~/.ctx/work.sqlite`. Context Bar could read it directly:

```rust
// Direct SQLite access for faster queries
use rusqlite::Connection;

fn open_ctx_db() -> Connection {
    let path = dirs::home_dir().unwrap().join(".ctx/work.sqlite");
    Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?
}

// Query normalized sessions across all agents
fn list_sessions(conn: &Connection) -> Vec<Session> {
    conn.prepare("SELECT * FROM ctx_sessions ORDER BY created_at DESC LIMIT 100")?
        .query_map([], |row| { ... })?
}
```

### Option C: Use `ctx` as MCP Server

`ctx` has an MCP mode — Context Bar could connect to it like any other MCP:

```bash
ctx mcp  # starts MCP stdio server
```

---

## What This Means for the Prototype

The Agents tab already shows Claude Code, Gemini CLI, Cursor, Kiro. With `ctx`:

| Before (manual parsing per agent) | After (`ctx` integration) |
|---|---|
| Custom JSONL parser for Claude | `ctx` handles it |
| Custom reader for Gemini history | `ctx` handles it |
| Custom reader for Cursor transcripts | `ctx` handles it |
| 35 different parsers needed | One `ctx search` call |
| We maintain all parsers | `ctx` team maintains them |
| New agents = new code | New agents = `ctx upgrade` |

---

## Architecture with `ctx`

```
Context Bar (Tauri app)
├── Frontend: React (sessions, insights, MCPs, skills UI)
│
├── Backend (Rust):
│   ├── MCP/Skills engine (existing)
│   ├── Session engine:
│   │   ├── ctx CLI integration OR
│   │   └── Direct SQLite read of ~/.ctx/work.sqlite
│   └── FSEvents watcher on ~/.ctx/work.sqlite
│
└── ctx (installed separately):
    ├── Discovers 35+ agent histories
    ├── Imports into normalized SQLite
    └── Auto-refreshes on search
```

---

## Trade-offs

| Approach | Pros | Cons |
|---|---|---|
| Use `ctx` CLI | Zero maintenance, 35 agents free, always up to date | Requires `ctx` installed, CLI spawn overhead (~50ms) |
| Read `ctx` SQLite | Fast (direct DB read), no CLI spawn | Couples to `ctx`'s schema (could change), still needs `ctx` for import |
| Parse files ourselves | No dependency on `ctx` | Massive effort, constant maintenance as agents change formats |
| Hybrid | Best of both: `ctx` for import, direct SQLite for reads | Need `ctx` installed + schema awareness |

**Recommended: Hybrid approach** — require `ctx` for import/indexing (user runs `ctx setup` once), then Context Bar reads `~/.ctx/work.sqlite` directly for fast UI. Watch the file with FSEvents for live updates.

---

## What to Show in Context Bar with `ctx`

```sql
-- Agents tab: list providers with counts
SELECT provider, COUNT(*) as sessions, SUM(token_count) as tokens
FROM ctx_sessions GROUP BY provider;

-- Sessions: list with metadata
SELECT * FROM ctx_sessions ORDER BY created_at DESC;

-- Insights: date-range aggregates
SELECT date(created_at) as day, COUNT(*) as sessions, SUM(token_count) as tokens
FROM ctx_sessions WHERE created_at > date('now', '-7 days') GROUP BY day;
```

```bash
# Search across all agents
ctx search "failed migration" --format json
```

---

## Bottom Line

This gives you 35+ agent support with near-zero effort — `ctx` does all the heavy lifting of discovering, parsing, and normalizing different formats. Context Bar just needs to present the data beautifully (which it already does in the prototype).
