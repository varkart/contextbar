# Context Bar — Expanded Window: Review, Roadmap & App Store Release Plan

**Branch:** `feature/expanded-window` (local only, not pushed)
**Last updated:** 2026-07-10

---

## 1. What's on this branch

| Area | Change |
|---|---|
| Backend | `open_expanded_window` command; `"expanded"` window capability; `engine/worktrees.rs` (scan + guarded remove); history index groups prompts → sessions (`promptCount`) |
| Frontend | `ExpandedApp` (landing + sidebar shell, hash deep-links, Escape unwind); Sessions two-pane viewer; Worktrees section; My Work section; `ToolsPanel` embedding the full popover view stack (agents / skills / MCPs / settings / notifications with toggles, details, add flows, permissions, logs, doctor) |
| Popover | History views removed; clock icon → expanded Sessions; expand icon → expanded landing |
| Router | `useViewRouter` options (`syncHash`, `onExit`, `initialView`); `RESET_TO` action for embedded stacks |

---

## 2. Code review (extendability / maintainability)

### Fixed during review
- Window-label detection used a wrong internals key → expanded window would render popover UI. Now uses `getCurrentWebviewWindow()` with non-Tauri fallback.
- Duplicate React key risk in skills/MCP rows (same name from multiple sources).
- Embedded router escaped to stale back-views (`agent-detail` with no agent → fell through to popover MainView). Added `RESET_TO` + back-view reset; reducer test added.
- `history.jsonl` line = prompt, not session → deduped by `sessionId` (display = first prompt, timestamp = last activity); stats count unique sessions; search matches any prompt; 3 Rust tests.
- Clippy warnings in new code.

### Architecture notes (why it should stay maintainable)
- **One implementation per feature.** Expanded window reuses `SessionList`/`SessionDetail`, the entire `ViewManager` stack, and all IPC commands. No forked panels to keep in sync.
- **Adding a section** = one entry in `SECTIONS` + one render branch. Tools-backed sections need only a `ROOT_VIEW` mapping.
- **Worktree logic** isolated in `engine/worktrees.rs` with a parser unit test; destructive path re-verifies state server-side (never trusts UI snapshot).
- **Both windows, one bundle** — branch point is a single function in `main.tsx`.

### Accepted debts (deliberate, small)
- `ViewManager` props are `any` (pre-existing pattern; typed props would touch every popover view).
- `useAgents` in the expanded window re-fires PostHog `tools_loaded` → double-counted analytics events while both windows open.
- Sessions fetch is once-per-window-load, capped at 300; a long-lived window goes stale (no refresh button yet).
- Popover components render inside a centered `max-w-3xl` column in ToolsPanel rather than a true wide redesign.

---

## 3. Feature vetting vs. specs

### Worktrees (`context-bar-ideas/worktrees-spec.md`)
| Spec item | Status |
|---|---|
| One place to see all worktrees, status, last activity | ✅ implemented (real `git worktree list` scan, repos discovered from session history) |
| Status states | ✅ active / stale / abandoned / primary (age-based); spec's provisioning/waiting need live agent signal — Phase 2 |
| Compact diff stat (`+120 −34`) | ❌ not yet (`git diff --shortstat` vs base) — Phase 2 |
| Session list per worktree | ✅ linked by exact path match |
| Merge-back flow | ❌ deliberately deferred (spec forbids silent resolution; needs conflict UI) — Phase 2 |
| Create worktree | ❌ deferred — Phase 2 |
| Cleanup / delete | ✅ merged+clean only, double-guarded (UI confirm + backend re-verify) |
| "Behind main by N" indicator | ✅ `↓N` badge |
| Uncommitted-changes delete confirm | ✅ backend refuses dirty trees outright |

### My Work (`context-bar-ideas/my-work-spec.md`)
| Spec item | Status |
|---|---|
| Single roll-up view across repos | ✅ |
| "Needs you" prioritized on top | ⚠️ partial — derived from git state (dirty, unmerged-ahead); true "agent waiting on input" needs live session signal — Phase 2 |
| In progress with repo/branch/status/time | ✅ active projects cards (live badge, branch cross-ref, tokens, resume) |
| Recently finished | ❌ Phase 2 (recently merged worktrees) |
| Sort/filter/search | ⚠️ time-window tabs only — Phase 2 |
| Empty states (plain, no filler) | ✅ per spec ("Nothing in progress…", sections omitted when empty) |
| Focus / momentum / standup (prototype) | ✅ token-share bar, 7-day tracks + streaks, copyable standup |

### Manual test checklist (user)
1. Popover: expand icon → landing; clock icon → Sessions two-pane.
2. Sidebar: all 6 sections + Notifications/Settings footer; counts match popover.
3. Agents/Skills/MCPs in expanded window: toggle a skill/MCP, open detail, add-skill flow, permissions — verify writes land in tool configs (same as popover).
4. Worktrees: compare against `git worktree list` in a repo; delete only offered on merged+clean; confirm flow; list refreshes after delete.
5. My Work: tab switching, focus %, momentum streaks, standup copy, needs-attention links to Worktrees.
6. Escape: unwinds detail → root → landing → closes window. Popover unaffected; `#settings` tray deep-link works.
7. Sessions list: one row per conversation, "N prompts" meta, live dot on active session.

---

## 4. Phase roadmap

Each phase ships behind the same two gates: (a) code review — extendable/maintainable, tests green (`npm test`, `cargo test`, `npm run build`, clippy clean on new code); (b) feature vetting against the relevant spec + manual checklist.

### Shipped since this plan was written
- Multi-agent sessions: Claude Code + Codex CLI + Gemini CLI in Sessions / My Work / Repos,
  agent badges, filter pills, per-agent activity counts, agent-aware Resume-in-Terminal.
- Insights distributed into sections; standalone Insights dissolved; My Work is home.
- Freshness (focus refetch, polling, load-more), window state, dock icon while open,
  VS Code open, markdown viewer in skill files, collapsible strips, chart hover readouts.

### Phase 2 — depth (2–3 weeks of evenings)
- Worktrees: diff stat vs base; create-worktree flow (`git worktree add` + open terminal); merge-back with conflict surfacing (never auto-resolve); disk-size lazily computed with cache.
- My Work: "Recently finished" (merged in last N days); repo/status filters + search; "needs you" from live session state (session file tail: last message role = assistant + waiting).
- Sessions: refresh + live tail of running session; pagination past 300.
- Shell: activation policy → `Regular` while expanded window open (dock icon, Cmd-Tab), back to `Accessory` on close.
- Fix analytics double-fire (window-label dimension or suppress in expanded).

### Phase 3 — polish & release readiness
- Wide-layout redesign of detail panels (two-column skill/MCP detail).
- Window state persistence (size/position/last section).
- Onboarding for expanded view; keyboard palette (⌘K section jump).
- Performance: worktree scan parallelism + cache; virtualized session list.
- Accessibility pass (focus rings, VoiceOver labels, reduced motion).

---

## 5. App Store release plan

### 5.0 Reality check — sandbox (read this first)
Mac App Store **requires App Sandbox**. Context Bar's core behavior conflicts with it:

| Capability | MAS sandbox impact |
|---|---|
| Reading/writing `~/.claude`, `~/.cursor`, `~/.gemini`, … | Blocked. Needs user-granted security-scoped bookmarks (folder picker per tool) or temporary-exception entitlements (routinely rejected) |
| Spawning `git`, `npx`, `claude` | `git` (system binary) borderline; `npx` installs and arbitrary CLIs effectively no |
| tauri-plugin-updater | Must be stripped from MAS build (self-updating apps are rejected; App Store owns updates) |
| Autostart LaunchAgent | Must migrate to `SMAppService` login item |
| Global shortcut | OK |

**Recommendation: dual-track.**
- **Track A (primary, now): Developer ID + notarized DMG** — current functionality intact, updater keeps working. This is the real "release".
- **Track B (later, optional): MAS build** — reduced feature set (folder-picker onboarding grants each tool's config dir; no npx installs; no self-update). Decide after Track A ships and demand justifies the work.

### 5.1 Track A — notarized DMG (target: 1–2 weeks)
Prereqs: Apple Developer account (individual — active ✅).

1. **Certificates**: create `Developer ID Application` cert in the developer portal; install in Keychain.
2. **Tauri signing config**: `bundle.macOS.signingIdentity = "Developer ID Application: <name> (<TEAMID>)"`; enable hardened runtime (Tauri default); audit entitlements (none extra needed for Track A).
3. **Notarization**: App Store Connect API key or `notarytool` app-specific password; set `APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` env for `npm run tauri build`; staple ticket to DMG.
4. **Updater**: generate updater signing keypair if not present; host `latest.json` + artifacts on GitHub Releases.
5. **CI**: GitHub Actions release workflow — tag push → build, sign, notarize, staple, upload release + updater manifest. Secrets: cert (base64 p12 + password), notary credentials, updater private key.
6. **QA gate**: fresh-macOS (or new user account) install test — Gatekeeper pass, permissions prompts, autostart, updater round-trip from previous version.
7. **Release**: version bump (`tauri.conf.json` + `Cargo.toml` + `package.json`), changelog, tag `v0.9.0`.

### 5.2 Track B — Mac App Store (target: after Track A, 3–4 weeks)
1. **App ID + provisioning**: explicit bundle id `com.varkart.contextbar`, MAS provisioning profile, `Apple Distribution` + `Mac Installer Distribution` certs.
2. **Sandbox refactor** (the real work):
   - Onboarding flow: per-tool folder grant (NSOpenPanel → security-scoped bookmark, persisted; Rust side resolves bookmarks).
   - Feature-flag out: npx MCP install, arbitrary `open_path` outside granted scopes, updater plugin.
   - Autostart → `SMAppService` login item; keep LaunchAgent for DMG build (build-time cfg flag).
   - `remove_worktree`/git scan: restrict to granted project folders.
3. **Entitlements file**: `com.apple.security.app-sandbox`, `files.user-selected.read-write`, `files.bookmarks.app-scope`; document every entitlement for review.
4. **App Store Connect**: app record, privacy nutrition labels (analytics: PostHog — disclose; offer opt-out in Settings), category (Developer Tools), screenshots (popover + expanded window, light/dark), description/keywords.
5. **TestFlight for Mac**: internal testing round before review.
6. **Review-risk notes**: explain why the app reads AI-tool config folders (user grants each explicitly); demo video for reviewer; expect 1–2 rejection cycles on file-access rationale.
7. **Post-approval**: phased release; MAS build ID separate from DMG build (`-mas` suffix in CFBundleVersion scheme) so updater never targets MAS installs.

### 5.3 Pre-submission checklist (both tracks)
- [ ] No secrets in bundle; PostHog key is a publishable client key (ok) — verify Sentry DSN handling
- [ ] Analytics opt-out setting exists and works
- [ ] Icon set complete (asset catalog incl. 1024px); menu bar template icon verified light/dark
- [ ] All Phase gates green: `npm test`, `cargo test`, `npm run build`, `npm run tauri build`, clippy
- [ ] Privacy policy URL (required by App Store; also good for DMG site)
- [ ] License/attribution for bundled fonts (Geist) verified

---

## 6. Open decisions for the owner
1. Ship Track A at `v0.9.0` from this branch after manual testing, or hold for Phase 2 features?
2. Is MAS (Track B) actually wanted, given the sandbox-driven feature cuts?
3. "Needs you" live-session detection approach (tail session JSONL vs. hooks) — pick in Phase 2.
