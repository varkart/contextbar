# Test Automation Plan + Visual Feature Ideas (2026-07-15)

## Part 1 — Automating the manual checklist

> **STATUS 2026-07-15: Tier 1 + Tier 2 SHIPPED.** 26 expanded-window Playwright tests green
> (navigation/hotkeys/escape, multi-agent badges+pills+transcripts, resume-agent args recorded,
> repo cards/delete-guard/VS Code, My Work tabs/agent-mix/attention, sessions-changed push).
> Mock harness now supports window labels, an event emitter (`__emitMockEvent`) and an invoke
> log (`__invokeLog`). Rust parser/ordering fixtures done (189 tests). NOTE: 73 pre-branch
> popover specs are stale (written for a months-old UI; they were 100% broken before this
> branch added `get_agents` to the mock — 22 revived). Cleanup = separate chore.
> Tier 3 (CI workflow) pending push.

Existing infra (already in repo, popover-only today):
- Playwright (`e2e/playwright.config.ts`, webkit) against vite dev server with `e2e/fixtures/tauri-mock.ts` mocking every IPC command + `__skipSplash`
- WebdriverIO config with `AICONTEXTBAR_TEST=1` (auto-opens window in debug builds)
- vitest unit suites (451), cargo unit tests (188)

Constraint: `tauri-driver` (real-app WebDriver) does **not** support macOS — so full-app
E2E on mac isn't possible; the practical stack is mocked-IPC Playwright for UI + fixture-home
Rust tests for parsers + a short human list for OS integration.

### Tier 1 — Playwright expanded-window suite (covers checklist A/B-UI/D/E/F)
- Extend `tauri-mock.ts`:
  - `?window=expanded` query param → set `__TAURI_INTERNALS__.metadata.currentWebview.label = 'expanded'` before app boot (main.tsx branches on it)
  - New mock cases: `list_sessions` (multi-agent fixture: claude+codex+gemini, live flags), `get_session`, `list_worktrees` (repo w/ agentFiles+skills, safe + dirty worktrees), `get_session_insights`, `get_token_activity`, `get_prompt_timestamps`, `get_commit_activity`, `warm_session_stats`, `get_terminal`/`list_terminals`/`set_terminal`, `is_vscode_installed`, `resume_in_terminal` (record args), `open_in_vscode`, `read_markdown_file`, `get_file_mtimes`, `remove_worktree`; event emitter shim for `sessions-changed` / `session-insights-updated`
- New specs:
  - `expanded-navigation.e2e.ts` — sidebar groups, active highlight, ⌘1–6, Escape chain
  - `sessions-multiagent.e2e.ts` — badges per agent, filter pills, transcript open, load-more, resume invoked with `{agent}` recorded
  - `repos.e2e.ts` — collapsed cards, auto-expand on filter, insights lazy-load, delete only on safe + confirm flow, VS Code button presence gated on `is_vscode_installed`
  - `mywork.e2e.ts` — range tabs relabel sections, agent mix bar, needs-attention copy, card click-through
  - `markdown-viewer.e2e.ts` — .md renders inline, non-.md disabled
  - Push-refresh: fire mocked `sessions-changed` → list updates without reload

### Tier 2 — Rust integration tests with fixture stores (covers parsers/merge end-to-end)
- Codex/Gemini already honor `CODEX_HOME` / `GEMINI_DATA_DIR`; gemini has `list_from_tmp(&Path)`.
  Finish the pattern: give claude source + codex a root-param internal fn too, then test
  `list_all` merge ordering, `get_any` fallback, dedup, live flags against tempdir fixtures —
  no env races, runs in normal `cargo test`.
- Fixture corpus: tiny real-shaped files per format (rollout jsonl, gemini logs.json +
  chats jsonl, claude history.jsonl + session jsonl) checked into `src-tauri/tests/fixtures/`.

### Tier 3 — CI (activates on push)
- GitHub Actions: `cargo test` + `npm test` + Playwright (webkit) on macOS runner; artifact
  screenshots on failure. Optional nightly run of the pricing workflow dry-run.

### Stays manual (~8 items)
iTerm2/Terminal AppleScript launch · dock-icon toggle · window size/position restore ·
tray anchoring across displays · real FSEvents push with a live agent · VS Code open ·
light/dark visual pass · notarized-build Gatekeeper smoke.

## Part 2 — Visual feature ideas ("GitHub-style" & repo juggling)

- **Contribution graph** — GitHub-style 52-week green grid in My Work (sessions or commits
  per day, per agent color option). We already compute daily buckets; this is a rendering.
- **Repo juggler board** — visual switcher for active repos/worktrees: card wall (repo color,
  live badges, last activity sparkline), drag to pin/order, click = jump, ⌘K opens it as a
  visual palette. The "juggling multiple repos at once" view — pairs with worktree lifecycle.
- **Branch/worktree graph** — mini commit-graph per repo card (trunk + worktree branches as
  rails, ahead/behind visually), like a tiny `git log --graph`.
- **Session timeline lane view** — horizontal lanes per agent, sessions as bars over the day;
  hover = prompt preview, click = transcript. Makes parallel-agent days legible.
- **Token flow sankey** — agents → projects → models token flow for a period (insights page
  candidate; prototype pattern exists in insights-prototype.html).
- **Streak/momentum flair** — subtle: streak flame on My Work, weekly "personal best" chip.
  No gamification noise beyond that.
- **Live activity pulse** — tray icon subtle dot/pulse when any agent is live; expanded
  window header shows per-agent live pips.

Priority suggestion: contribution graph (cheap, loved) → repo juggler board (fits worktree
lifecycle phase) → timeline lanes → sankey/flair later.
