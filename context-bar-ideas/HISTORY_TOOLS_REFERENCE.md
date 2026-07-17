# Claude Session History Tools — Reference

Projects researched for the Context Bar history feature (July 2026).

---

## Projects

### 1. claude-history (raine)

**GitHub:** https://github.com/raine/claude-history
**Stack:** Rust
**UI:** Terminal TUI (ratatui)

**Specialization: Search & Discovery**

Best-in-class fuzzy search with field-aware relevance scoring, experimental semantic search via local embeddings (fastembed/ONNX), in-terminal conversation viewer with vim keybindings, worktree-aware project filtering. Resume and fork sessions directly from the TUI. Agent protocol for bounded search from within Claude Code.

---

### 2. claude-code-history-viewer (jhlee0409)

**GitHub:** https://github.com/jhlee0409/claude-code-history-viewer
**Stack:** Rust + React + Tauri 2.0
**UI:** Desktop app (macOS/Windows/Linux) + headless server mode

**Specialization: Multi-Tool Analytics**

Supports 25 AI tools (Claude Code, Cursor, Gemini CLI, Copilot, Codex, Cline, Aider, OpenCode, ForgeCode, Kiro, Amazon Q, and more). Token usage dashboards with full breakdowns (input/output/cache creation/cache read), activity heatmaps, daily trend charts, per-project stats, file edit tracking. Headless server mode with Docker support.

---

### 3. claude-history (randlee)

**GitHub:** https://github.com/randlee/claude-history
**Stack:** Go
**UI:** CLI

**Specialization: Agent Hierarchy & Export**

Recursive sub-agent tree visualization (ASCII art, JSON, or GraphViz DOT format). Git-style partial UUID matching for session/agent selection. HTML export with "resurrection" capability — bundles original JSONL files alongside rendered HTML so sessions can be re-imported. Cross-platform path handling (macOS/Linux/Windows). Query filters combinable: time range, tool type, regex on tool inputs, text search.

---

### 4. claude-historian-mcp (Vvkmnn)

**GitHub:** https://github.com/Vvkmnn/claude-historian-mcp
**Stack:** TypeScript
**UI:** MCP server (no direct UI — called by Claude Code itself)

**Specialization: In-Session Recall**

Designed to be invoked BY Claude Code as an MCP tool during active sessions. Two tools (`search`, `find_file_context`), 11 search scopes (conversations, files, errors, plans, config, tasks, sessions, tools, similar, memories, summary). Query intent classification with semantic boosting (errors get 3x boost, implementations 2.5x). Zero external dependencies. Plugin with hooks that auto-trigger history search on errors, before web searches, and before planning.

---

### 5. claude-run (nilbuild)

**GitHub:** https://github.com/nilbuild/claude-run
**Stack:** TypeScript (Hono + React)
**UI:** Web app (localhost)

**Specialization: Real-Time Streaming**

SSE-based live conversation updates — watch Claude's responses appear in real time as it types. Byte-offset tracking for incremental file reads (only reads newly appended bytes). Chokidar file watching on `history.jsonl` and `projects/` directory. Specialized tool renderers (unified diffs, bash output with ANSI colors, grep results). Resume command copy. 20ms debounce for rapid file changes.

---

### 6. claude-conversation-extractor (ZeroSumQuant)

**GitHub:** https://github.com/ZeroSumQuant/claude-conversation-extractor
**Stack:** Python
**UI:** CLI (interactive menu + plain CLI)

**Specialization: Bulk Archival & Export**

Export all Claude Code sessions to clean markdown files in one command. Real-time interactive search with results as you type. Zero external dependencies (pure Python stdlib). Cross-platform (macOS/Windows/Linux). Designed for backup, documentation, and sharing rather than interactive browsing. 97% test coverage. Outputs to `~/Desktop/Claude logs/` or configurable directory.

---

## Comparison Matrix

| Feature | raine | jhlee/CCHV | randlee | historian | claude-run | extractor |
|---|---|---|---|---|---|---|
| Fuzzy search | ✅ | ✅ | ❌ | ✅ | Basic | Basic |
| Semantic search | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Content search | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Token stats | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Multi-tool | ❌ | ✅ (25) | ❌ | ❌ | ❌ | ❌ |
| Live updates | ❌ | ✅ (Tauri) | ❌ | Cache | ✅ (chokidar) | ❌ |
| Sub-agents | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Export | Clipboard/HTML | Multi-format | HTML+JSONL | ❌ | ❌ | Markdown |
| Resume session | ✅ (direct) | ❌ | ✅ | ❌ | ✅ (copy) | ❌ |
| Always available | ❌ | ❌ | ❌ | ✅ (MCP) | ❌ | ❌ |
| No install needed | ❌ | ❌ | ❌ | ✅ (npx) | ✅ (npx) | ✅ (pipx) |

---

## What Context Bar Takes From Each

| From | What We Adopt |
|---|---|
| raine | Token dedup via message ID HashMap, `format_tokens()` (K/M suffixes), duration from first/last timestamp, model name shortening |
| jhlee/CCHV | File-size estimation for fast scanning, `cwd` field as ground truth for project name, token breakdown (4 categories), sidechain filtering |
| randlee | `sessions-index.json` awareness (use if present), agent tree structure |
| historian | Pre-filter optimization (raw string search before JSON parse), search scope classification, `display` field for preview |
| claude-run | `history.jsonl` as primary session index, SSE-style live updates pattern, XML tag sanitization patterns |
| extractor | Simplicity of the core parse loop (user + assistant only for MVP) |
