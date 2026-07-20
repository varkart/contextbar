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

`claude`, `cursor`, `gemini`, `copilot`, `windsurf`, `chatgpt`, `codex`, `kiro`

---

## Adding a New Tool

1. Create `src-tauri/src/engine/manifests/<name>.toml`
2. Define `[meta]`, `[[skill_sources]]`, `[[mcp_sources]]` sections following the existing manifests
3. No Rust code changes needed — the engine loads all manifests at startup

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
