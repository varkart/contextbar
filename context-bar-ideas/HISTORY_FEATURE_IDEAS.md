# Context Bar — Session History Feature Ideas

Features informed by research on 6 open-source Claude session history tools.

---

## High-Value (Unique to Menu Bar UX)

| Feature | Why it fits Context Bar | Inspired by |
|---|---|---|
| **Session list with instant search** | One click from menu bar → see all past sessions, type to filter | raine, claude-run |
| **Live session indicator** | Show "Claude is active" dot when a session is being written to right now | claude-run (SSE) |
| **Quick resume** | Click session → copy `cd <project> && claude --resume <id>` to clipboard | claude-run, raine |
| **Token usage badges** | See at a glance which sessions consumed the most tokens | jhlee/CCHV |
| **Cross-project search** | Search across ALL projects from one place — no cd needed | raine, historian |

---

## Medium-Value (Enrich the Existing Views)

| Feature | Description | Inspired by |
|---|---|---|
| **Session detail viewer** | Click a session → see the full conversation with markdown rendering | claude-run, jhlee/CCHV |
| **Tool call visualization** | Collapsible pills for Read/Write/Bash/Grep with expandable output | jhlee/CCHV, claude-run |
| **Thinking block toggle** | Show/hide Claude's extended thinking blocks | jhlee/CCHV |
| **Project grouping** | Group sessions by project in a tree/accordion | jhlee/CCHV |
| **Git branch display** | Show which git branch each session was on | randlee (sessions-index.json) |
| **Duration + model tag** | Show "sonnet-4 · 23m · 450k tokens" per session | raine |
| **Daily activity summary** | "Today: 5 sessions, 2.1M tokens across 3 projects" at the top | jhlee/CCHV analytics |

---

## Nice-to-Have (Power User Features)

| Feature | Description | Inspired by |
|---|---|---|
| **Export to markdown** | Right-click session → Export as .md file | extractor |
| **Copy conversation** | Copy full conversation text to clipboard | raine |
| **Sub-agent tree** | Expandable hierarchy showing main session → spawned agents | randlee |
| **Token breakdown chart** | Mini donut/bar showing input vs output vs cache per session | jhlee/CCHV |
| **Session diff** | Compare two sessions that worked on the same project | Original idea |
| **"What did I do today?"** | Auto-summary: projects touched, files modified, tokens used | jhlee/CCHV analytics |
| **Filter by tool** | "Show me sessions where I used Bash" / "sessions with errors" | randlee, historian |
| **Error session highlighting** | Flag sessions that had tool errors or failed commands | historian (error scope) |

---

## Stretch (Future / Experimental)

| Feature | Description | Inspired by |
|---|---|---|
| **Semantic search** | "Find where I debugged the auth issue" → vector similarity | raine (fastembed) |
| **MCP-based self-search** | Let Claude Code search its own history via Context Bar as MCP | historian |
| **Multi-tool support** | Show Gemini CLI, Cursor, Kiro sessions too | jhlee/CCHV (25 tools) |
| **Cost estimation** | Approximate $ spent per session using model pricing | None do it well yet |
| **Session bookmarks** | Star/pin important sessions for quick access | Original idea |
| **Workspace correlation** | "This session touched the same files as that MCP server" | Linking existing Context Bar features |

---

## What Makes Context Bar's Version Unique

None of these tools are **always one click away**. Context Bar's advantage:

- **Zero friction** — already running in the menu bar, no app/terminal to launch
- **Unified context** — sessions alongside MCPs, skills, and tool status in one view
- **Cross-tool awareness** — can correlate "this session used this MCP" since it already knows about both
- **FSEvents already wired** — the file watcher infrastructure exists, just needs to watch one more file

---

## Recommended MVP

The minimal set that would differentiate Context Bar from all existing tools:

1. **Session list** — parse `~/.claude/history.jsonl`, show 50 most recent sessions
2. **Instant title search** — filter by typing (in-memory, <50ms)
3. **Token badges** — per-session total token count as colored badge
4. **Live indicator** — dot animation when a session file is being actively written
5. **Quick resume** — click → copies resume command to clipboard
6. **Project filter** — dropdown to scope to one project

This gives users in 5 seconds what every other tool requires launching a separate app for.

---

## References

| Project | GitHub | Specialization |
|---|---|---|
| claude-history (raine) | https://github.com/raine/claude-history | Search & discovery, semantic search, TUI |
| claude-code-history-viewer (jhlee0409) | https://github.com/jhlee0409/claude-code-history-viewer | Multi-tool analytics, token dashboards |
| claude-history (randlee) | https://github.com/randlee/claude-history | Agent hierarchy, HTML export with resurrection |
| claude-historian-mcp (Vvkmnn) | https://github.com/Vvkmnn/claude-historian-mcp | In-session recall via MCP, scoped search |
| claude-run (nilbuild) | https://github.com/nilbuild/claude-run | Real-time SSE streaming, live updates |
| claude-conversation-extractor (ZeroSumQuant) | https://github.com/ZeroSumQuant/claude-conversation-extractor | Bulk markdown export, archival |
