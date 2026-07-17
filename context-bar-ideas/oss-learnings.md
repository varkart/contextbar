# OSS Learnings — Session/Usage Tools Survey (2026-07-15)

Reviewed: Chronicle (claude-history-manager), Agent Sessions (jazzyalex), ccusage (16.5k★),
plus sightings: jhlee0409/claude-code-history-viewer (28 providers), TokenTracker (menu bar, 25 tools), tokscale.

## Best practices worth adopting

| Practice | Source | Status in Context Bar |
|---|---|---|
| Reindex only files whose (size, mtime) changed; persistent index | Chronicle (SQLite + FSEvents, 75ms warm opens) | Partial — `session_stats` warm does this for Claude; codex list re-scanned every poll → **fixed 2026-07-15 (in-memory summary cache)** |
| Never re-parse corpus on refresh timers | Agent Sessions (25–41% idle CPU → 11% after per-file parse cache) | Guarded now; watch when polling gets denser |
| Respect env overrides for data dirs (`CODEX_HOME`, `GEMINI_DATA_DIR`) | ccusage | **Added 2026-07-15** |
| Aggregate all sources by default, narrow per source | ccusage | Already our model (merged list + agent pills) ✓ |
| FSEvents watcher instead of polling | Chronicle (no daemon, on-demand) | Phase 2 — replace 30s poll |
| Pricing from cached/offline model-price table, not hardcoded consts | ccusage (offline mode) | TODO — our `rates()` will rot |
| Metadata-only cloud sync (tags/pins), transcripts stay local | Chronicle (iCloud `chronicle-sync.json`) | Not started; good privacy posture if sync ever wanted |
| No sandbox + Developer ID tradeoff called out explicitly | Chronicle (ad-hoc signed) | Matches our RELEASE_PLAN sandbox analysis ✓ |

## Missing features (competitors have, we don't)

- **Per-session `gemini --resume <uuid>`** (Chronicle claims it works; verify once gemini on PATH — we emit plain `gemini --resume`)
- **Terminal choice** for resume: Terminal/iTerm2/Ghostty/WezTerm/kitty/Warp (both apps) — we hardcode Terminal.app
- **Antigravity source**: `~/.gemini/antigravity/brain` (Agent Sessions) — separate store from gemini tmp
- **More providers**: OpenCode (`~/.local/share/opencode/opencode.db`), Copilot CLI (`~/.copilot/session-state`), Cursor Agent (`~/.cursor/projects|chats`), Hermes, Pi — paths documented by Agent Sessions
- **Search inside transcripts** (several viewers) — we search first-prompts only
- **Tags / pins / notes on sessions** (Chronicle) — lightweight metadata, syncable
- **Quota/rate-limit meters** (Agent Sessions: 5h + weekly windows, run-out projection) — whole feature area
- **Live tail of running session** (claude-code-trace) — we have live dots, not streaming transcripts

## Good-to-have / roadmap candidates

1. FSEvents + persistent session index (kills polling, instant opens) — Chronicle model
2. Pricing table as data (cached JSON, offline-friendly) + editable in Settings
3. Terminal preference setting; per-session override
4. Antigravity brain source (4th agent, likely easy JSONL/JSON)
5. OpenCode SQLite source (5th; needs rusqlite read-only open)
6. Transcript full-text search (SQLite FTS over session_stats-adjacent table)
7. Session tags/pins (local first; metadata-only iCloud later)
8. Usage/quota meters per provider

## Market signal

TokenTracker (menu bar, 25 tools) and Agent Sessions (macOS app) prove demand for exactly
this product shape. Differentiators we already have that they lack: skills/MCP management,
worktree/repo operations, per-repo insights. Keep leaning on the "manage + observe" combo
rather than pure viewing.
