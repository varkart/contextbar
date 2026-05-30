# agentbar — Claude Code Project Guide

## What This Is

macOS menu bar app (Tauri 2.0) that detects installed AI tools (Claude, Cursor, Gemini, Copilot, Windsurf, ChatGPT) and shows their skills, MCP servers, and active/inactive status — all in one tray popover.

**Repo:** https://github.com/varkart/agentbar (private)
**Owner:** varkart

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + TypeScript + Tailwind v4 |
| Backend | Rust (Tauri 2.0) |
| Tray | `tauri-plugin-positioner` + `tray-icon` |
| Build | Vite |
| Package manager | npm |

## Directory Structure

```
agentbar/
├── src/                        # React frontend
│   ├── index.css               # Tailwind v4 entry (@import "tailwindcss")
│   ├── main.tsx                # React entry
│   ├── App.tsx                 # Root component
│   └── components/             # UI components (to be created)
├── src-tauri/
│   ├── src/
│   │   ├── main.rs             # Binary entry — calls lib::run()
│   │   ├── lib.rs              # Tray setup, window toggle, app lifecycle
│   │   └── detectors/          # Per-tool config readers (to be created)
│   │       ├── mod.rs
│   │       ├── claude.rs       # ~/.claude/settings.json + skills/
│   │       ├── cursor.rs       # ~/.cursor/mcp.json + skills-cursor/
│   │       ├── gemini.rs       # ~/.config/gemini/ + which gemini
│   │       ├── copilot.rs      # ~/.vscode/extensions/github.copilot*
│   │       ├── windsurf.rs     # ~/.windsurf/ + ~/.codeium/windsurf/
│   │       └── chatgpt.rs      # ~/.vscode/extensions/openai.chatgpt*
│   ├── Cargo.toml
│   └── tauri.conf.json
├── CLAUDE.md                   # This file
└── SPEC.md                     # Full product + technical spec
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
Rust detectors (read fs)
  → serialize to JSON via serde
  → Tauri IPC command: get_tools()
  → React frontend renders
  → User toggle → IPC command: set_tool_active(id, bool)
  → Rust writes back to tool's config
```

---

## Core Data Types (Rust → TypeScript)

```rust
// src-tauri/src/models.rs (to create)
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

## Adding a New LLM Detector

1. Create `src-tauri/src/detectors/<name>.rs`
2. Implement `pub fn detect() -> Option<AiTool>` — return `None` if not installed
3. Register in `src-tauri/src/detectors/mod.rs`
4. Call in `get_tools()` Tauri command in `lib.rs`
5. No frontend changes needed — generic component renders all tools

---

## Installed Tools on Dev Machine

| Tool | Install Path | Skills | MCPs |
|---|---|---|---|
| Claude Code | `~/.claude/` | `~/.claude/skills/` (30+) | `~/.claude/settings.json` → `mcpServers` |
| Cursor | `~/.cursor/` | `~/.cursor/skills-cursor/` (12) | `~/.cursor/mcp.json` |
| Gemini CLI | `/opt/homebrew/bin/gemini` | none detected | none detected |
| GitHub Copilot | `~/.vscode/extensions/github.copilot-chat-*` | none | none |
| Windsurf | `~/.windsurf/` + `~/.codeium/windsurf/` | none detected | none detected |
| ChatGPT (VS Code) | `~/.vscode/extensions/openai.chatgpt-*` | none | none |

---

## Security Notes

- Never read or log API key values from tool configs (only key names)
- Never commit `~/.claude/settings.json` contents or any tool secrets
- MCP `env` fields: detect presence, never expose values in UI

---

## Spec-Driven Workflow

1. All features start in `SPEC.md` before code
2. UI changes: prototype with `impeccable` or `design-taste-frontend` skill first
3. Rust changes: `cargo check` must pass before committing
4. Commits: small + incremental, feature branch per feature
5. No direct pushes to `main`
