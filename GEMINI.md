# LLM Manager — Gemini CLI Project Guide

macOS menu bar app (Tauri 2.0) that detects installed AI tools and shows their skills, MCP servers, and active/inactive status in a tray popover.

**Repo:** https://github.com/varkart/llmmanager (private)
**Owner:** varkart

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + TypeScript + Tailwind v4 |
| Backend | Rust (Tauri 2.0) |
| Build | Vite + npm |

## Key Commands

```bash
npm run tauri dev          # dev server (hot reload)
npm run build              # type check + frontend build
npm run lint               # TypeScript type check only
npm run test               # vitest unit tests
cd src-tauri && cargo check   # fast Rust check
cd src-tauri && cargo test    # Rust unit tests
```

Note: `cargo` needs `source "$HOME/.cargo/env"` if not in PATH.

## Architecture

```
Rust detectors (read fs)
  → serde → JSON
  → Tauri IPC: get_tools()
  → React renders
  → User action → IPC command
  → Rust writes config
```

## Directory Layout

```
src/                     # React frontend
  App.tsx                # Root: routing, global state
  components/            # UI components
src-tauri/src/
  lib.rs                 # Tray, window, IPC commands
  detectors/             # Per-tool config readers
  engine/                # MCP querying, skill toggle logic
  models.rs              # Shared data types
  mcp_client.rs          # MCP stdio + HTTP transport
```

## Adding a New LLM Detector

1. Create `src-tauri/src/detectors/<name>.rs`
2. Implement `pub fn detect() -> Option<AiTool>` — `None` if not installed
3. Register in `src-tauri/src/detectors/mod.rs`
4. Call in `get_tools()` in `lib.rs`

## Git Rules

- Feature branches only — never push to `main`
- Small, incremental commits
- No AI attribution in commits or code
- `cargo check` must pass before committing

## Security

- Never read or log API key values (only key names)
- MCP `env` fields: detect presence only, never expose values in UI
- Never commit tool config secrets
