# Context Bar — Claude Code Project Guide

## What This Is

macOS menu bar app (Tauri 2.0) that detects installed AI tools and shows their skills, MCP servers, and active/inactive status — all in one tray popover.

**Repo:** https://github.com/varkart/contextbar
**Owner:** varkart

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + TypeScript + Tailwind v4 |
| Backend | Rust (Tauri 2.0) |
| Tray | `tauri-plugin-positioner` + `tray-icon` |
| Build | Vite 7 |
| Package manager | npm |

## Directory Structure

```
contextbar/
├── src/                        # React frontend
│   ├── index.css               # Tailwind v4 entry (@import "tailwindcss")
│   ├── main.tsx                # React entry
│   ├── App.tsx                 # Root component
│   └── components/             # UI components
├── src-tauri/
│   ├── src/
│   │   ├── main.rs             # Binary entry — calls lib::run()
│   │   ├── lib.rs              # Tray setup, window toggle, IPC commands
│   │   ├── detectors/          # Per-tool config readers (10 detectors, run in parallel)
│   │   └── engine/
│   │       ├── manifests/      # Per-tool TOML manifests (skills + MCP sources)
│   │       └── mod.rs          # detect_all() entry point
│   ├── Cargo.toml
│   └── tauri.conf.json
├── CLAUDE.md                   # This file
└── .local/                     # Local-only knowledge (gitignored)
```

---

## Key Commands

```bash
# Development (hot reload)
npm run tauri dev

# Type check frontend only
npm run build

# Rust check (fast, no full compile)
cd src-tauri && cargo check

# Full Rust compile + frontend build
npm run tauri build
```

Note: `cargo` needs `source "$HOME/.cargo/env"` if not in PATH.

---

## Architecture: Data Flow

```
Rust engine (read fs via manifests)
  → serialize to JSON via serde
  → Tauri IPC command: get_tools()
  → React frontend renders
  → User toggle → IPC command: set_skill_active / set_mcp_active
  → Rust writes back to tool's config
```

---

## Core Data Types (Rust → TypeScript)

```rust
pub struct AiTool {
    pub id: String,           // "claude", "cursor", etc.
    pub name: String,
    pub version: Option<String>,
    pub installed: bool,
    pub skills: Vec<Skill>,
    pub mcps: Vec<McpServer>,
}

pub struct Skill {
    pub name: String,
    pub path: String,
    pub active: bool,
}

pub struct McpServer {
    pub name: String,
    pub command: String,
    pub active: bool,
}
```

---

## Supported Tools

Defined by TOML manifests in `src-tauri/src/engine/manifests/`:

`claude`, `cursor`, `gemini`, `copilot`, `windsurf`, `kiro`, `codex`, `agy`, `opencode`

---

## Adding a New Tool (skills + MCP detection)

This is one of **two separate extension points** for a coding agent — see
below for the other (session history). A tool needs this one to show up in
the tray popover at all; it needs the other one to appear in Sessions / My
Work / token stats. Most fully-supported agents have both; some (e.g.
Copilot, Cursor, Windsurf) currently only have this one, because they don't
expose a parseable local session store.

1. Create `src-tauri/src/engine/manifests/<name>.toml`
2. Define `[[detection]]`, `[version]`, `[[skill_sources]]`, `[[mcp_sources]]` sections following the existing manifests
3. Register it in `all_manifest_strs()` in `src-tauri/src/engine/mod.rs` — manifests are embedded via `include_str!` at compile time, so a file alone is not picked up

---

## Adding a New Coding Agent (session history / My Work / stats)

Every agent with session-history support implements one trait —
`SessionSource` in `src-tauri/src/engine/sessions/mod.rs`:

```rust
pub trait SessionSource: Sync {
    fn agent_id(&self) -> &'static str;
    /// Newest-first entries, at most `limit`.
    fn list(&self, limit: usize) -> Vec<SessionEntry>;
    fn get(&self, session_id: &str) -> Option<SessionDetail>;
    /// Shell command that resumes work in `project` (id optional).
    fn resume_command(&self, session_id: Option<&str>) -> String;
    /// On-disk transcript backing this entry, used by the stats warm pass
    /// for (mtime, size) staleness checks. None when the source can't map
    /// an entry to a single file. Default provided — override only when
    /// sessions do map to one file.
    fn transcript_file(&self, entry: &SessionEntry) -> Option<std::path::PathBuf> {
        let _ = entry;
        None
    }
}
```

This one trait is the entire surface — every feature on Sessions and My Work
is built on top of `list()`/`get()`, not implemented per-feature per-agent:

- **Session list, live dot, resume button** — `list()`. Each source decides
  its own "live" rule when building each `SessionEntry` (existing sources
  use "transcript file modified in the last 5 minutes"); there's no shared
  trait method for it.
- **Transcript view** — `get()`, returning a `SessionDetail` (messages +
  token usage in the source's own format, normalized to the shared
  `Message`/`ContentBlock`/`TokenUsage` types in `engine/history/types.rs`).
- **Token/cost stats, Top sessions/repos, Usage & cost, Activity** (My
  Work) — all read from the `session_stats` SQLite cache, which the
  background "warm" pass (`engine/history/stats.rs::warm`) populates by
  calling `source.get()` on anything new or changed (per `transcript_file`'s
  mtime/size) across **every** registered source — nothing agent-specific
  needed here once `get()` exists.
- **Resume** — `resume_command()`.

Steps to add a new agent:

1. Create `src-tauri/src/engine/sessions/<name>.rs` implementing
   `SessionSource` — `list()` (newest-first, capped at `limit`), `get()`
   (parse the agent's transcript format into `SessionDetail`),
   `resume_command()`, and `transcript_file()` if sessions map to a single
   file (needed for the stats cache to detect changes; skip it and the warm
   pass just re-parses every time).
2. Register the module (`pub mod <name>;`) and add an instance to the
   `sources()` vec, both in `src-tauri/src/engine/sessions/mod.rs`.
3. Add the agent to `AGENT_COLORS` in `src/constants/agentColors.ts` (label
   + color) — not required (unknown agents get a deterministic hash-based
   fallback color via `agentColor()`), but gives it a stable, chosen color
   instead of whatever the hash lands on.
4. That's it — Sessions, My Work (Active projects, Top sessions/repos,
   Usage & cost, Activity), the command palette, and worktree-linked
   sessions all pick it up automatically; none of them hardcode an agent
   list.

See `context-bar-ideas/multi-agent-sessions-plan.md` for the original
implementation writeup (Codex/Gemini) — useful for the "why," but it predates
`transcript_file()` and the current signature, so follow the trait above,
not that doc, for the actual shape.

---

## Security Notes

- Never read or log API key values from tool configs (only key names)
- Never commit `~/.claude/settings.json` contents or any tool secrets
- MCP `env` fields: detect presence, never expose values in UI
- All IPC commands that touch the filesystem call `validate_tool_path()` first
- Capability toggles (`[[capabilities]]` in manifests) only write their declared
  key / deny-list member and never touch unrelated config values; every write is
  preceded by an automatic backup. They affect **new agent sessions only** —
  running sessions keep their loaded settings, and all UI copy must say so

---

## Development Workflow

1. Rust changes: `cargo check` must pass before committing
2. Commits: small + incremental, feature branch per feature
3. No direct pushes to `main`
