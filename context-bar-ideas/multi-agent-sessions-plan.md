# Multi-Agent Sessions — Implementation Plan

> **STATUS 2026-07-15: IMPLEMENTED** (commits 9d95a75…9b9a013 on feature/expanded-window).
> Deviations from plan below:
> - Gemini listing indexes `logs.json` (per-project prompt log with timestamps) instead of
>   scanning chat files — chat snapshots turned out to be context-only in their first `$set`
>   and Antigravity floods dirs with thousands of agent-internal sessions. logs.json gives
>   only real user sessions, 5ms vs 6.4s.
> - Codex list() also captures per-session token totals (rollouts carry `token_count` events)
>   — shows up as token badges on codex session rows for free.
> - Smoke verified on real data: merged top-30 = claude+gemini mix, codex sessions listed,
>   gemini transcript get() = 45 messages, codex tokens 4.3M on biggest session.

**Goal:** My Work / Sessions / Repos aggregate activity from Claude Code + Codex CLI + Gemini CLI. Sections stay top-level (activity-first IA, confirmed); agent pages keep scoped strips. Kiro/Copilot/Cursor parked (no parseable store / brittle).

**Evidence (verified on this machine 2026-07-14):**
- Codex: `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl` — line 1 = `session_meta` `{id, cwd, timestamp, model_provider, cli_version}`, then message stream. Resumable (`codex resume <id>`).
- Gemini: `~/.gemini/tmp/<sha256>/chats/session-*.json` — `{sessionId, projectHash, startTime, lastUpdated, messages[{id, timestamp, type, content}]}`; sibling `.project_root` file holds the real project path. `logs.json` = prompt log.

---

## Architecture

### Rust: `SessionSource` trait

New `src-tauri/src/engine/sessions/`:

```rust
pub trait SessionSource: Send + Sync {
    fn agent_id(&self) -> &'static str;                     // "claude" | "codex" | "gemini"
    fn list(&self, limit: usize) -> Vec<SessionEntry>;      // newest-first
    fn get(&self, session_id: &str) -> Option<SessionDetail>;
    /// Shell command to resume this session in its project dir, or None.
    fn resume_command(&self, project: &str, session_id: Option<&str>) -> String;
}

pub fn sources() -> &'static [Box<dyn SessionSource>];      // registry
pub fn list_all(limit, offset, ...) -> Vec<SessionEntry>;   // merge + sort + paginate
pub fn get_any(agent: Option<&str>, id: &str) -> Result<SessionDetail>;
```

- `SessionEntry` / `SessionDetail` gain `agent: String` (`#[serde(default = "claude")]` so cached rows stay valid).
- Existing `engine/history/` becomes the Claude source (thin adapter impl; module untouched internally).
- `codex.rs`: walk sessions dir (cap: last 90 days of date-dirs), read first line for meta (id/cwd/ts), scan for first user message → `display`, count user messages → `promptCount`, model from meta, live = mtime < 300s. `get()` maps response items → our `Message`/`ContentBlock` (text + `function_call` names as tool_use).
- `gemini.rs`: walk `~/.gemini/tmp/*/`; require `.project_root` (skip hash dirs without it — can't attribute); parse `chats/session-*.json`; display = first user message; live = `lastUpdated` or mtime < 300s. `get()` maps messages (user/model text; tool entries as tool_use where typed).
- `resume_command`: claude `claude --resume <id>`, codex `codex resume <id>`, gemini plain `gemini` in project dir (chat-tag resume unreliable; revisit).

### Stats cache (scope control)
- `session_stats` gains `agent` column — migration v8, drop+recreate (rebuildable cache).
- v1: warm still parses **Claude only** for tokens/tools/skills (codex/gemini token+tool data is sparse/absent). Insights strips label "token insights: Claude Code sessions". Per-agent *session counts* come from the merged list, not the cache — real data for all three, no extra parsing.

### IPC changes
- `list_sessions` → merged multi-source (same signature; entries carry `agent`).
- `get_session(session_id, agent: Option<String>)` — hint avoids source probing.
- `resume_in_terminal(project, session_id, agent: Option<String>)` — builds per-agent command via the trait.

## Frontend

- `types.ts`: `SessionEntry.agent: string`, `SessionDetail.agent: string`.
- **AgentBadge** component (small colored chip: Claude indigo, Codex emerald, Gemini blue; label = agent name initial/short). Used in: session rows, transcript header, worktree linked-session rows, My Work project cards (set of agents per project).
- **Agent filter pills** in `SessionList` (`All · Claude · Codex · Gemini` — only agents present in data; combinable with existing project pills/search).
- **My Work**: "Agents" mini stack bar in Overview (session share per agent for the selected range) — finally answers "which agents do I use" with real data.
- **ToolsPanel agent activity rows**: pass `sessions` prop down; codex/gemini rows show real "N sessions in 30d" instead of config-mtime proxy (mtime stays as fallback for agents without sources).
- Resume buttons pass `session.agent`; button label unchanged.
- Sessions insights tiles: unchanged semantics (they aggregate the merged list automatically).

## Commits

1. `refactor: extract SessionSource trait with claude adapter` — registry + merge/paginate; zero behavior change; existing tests green.
2. `feat: codex session source` — parser + fixtures test (session_meta line, user-message scan), list/get/resume.
3. `feat: gemini session source` — parser + fixtures test (.project_root mapping, chats JSON), list/get/resume.
4. `feat: agent field through IPC, badges in session UI` — types, AgentBadge, rows/transcript/worktree/My Work chips, `get_session`/`resume_in_terminal` agent params, stats migration v8.
5. `feat: agent filter pills and agent mix insights` — SessionList pills, My Work agent stack, ToolsPanel real per-agent counts.
6. `docs: update release plan + manifest notes` — RELEASE_PLAN roadmap, honesty labels for Kiro/Copilot ("doesn't expose session history").

## Risks / decisions
- **Codex rollout format churn** — pin parsing to `session_meta` line + tolerant per-line parse (skip unknown types); fixture test from real file shape.
- **Gemini dirs without `.project_root`** — skipped (unattributable); some history invisible. Acceptable v1.
- **Perf**: codex walk = fs metadata + first-line read per file (cheap); gemini chats fully parsed on list — cache display/promptCount by (path, mtime) in the existing SQLite if it proves slow; measure first.
- **Live semantics** differ slightly per source — all use 300s mtime as the common rule.
- **Merged pagination**: offset applies post-merge — consistent, simple; per-source limits generous (2000).

## Verification
- `cargo test` (new parser fixtures), `npm test`, builds, clippy on new modules.
- Manual: Sessions shows codex + gemini entries with badges (your machine has both); filter pills work; codex transcript opens; gemini transcript opens; Resume opens Terminal with `codex resume …`; My Work agent bar shows 3 agents; worktree linked sessions include codex sessions from same cwd; Claude-only behavior identical to today.
- Local commits only, no push.
