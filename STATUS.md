# agentbar — Status

**Version:** 0.5.0 (package) / v0.6.0 (effective, not yet bumped)
**Branch:** main — 3 commits ahead of origin
**Last updated:** 2026-05-31

---

## Commits this cycle

| SHA | Description |
|-----|-------------|
| `6351d17` | add PostHog analytics and Sentry error tracking |
| `300e885` | v0.6.0 — fonts, MCP client, new detectors, observability, shortcut UI |
| `ac05d21` | parallelize detectors to fix 5s startup time |

---

## Stack

| Layer | Tech |
|-------|------|
| Shell | Tauri 2.0 (macOS menu bar) |
| Backend | Rust — detectors, FSEvents watcher, MCP stdio client |
| Frontend | React 19 + TypeScript + Tailwind CSS v4 + Vite 7 |
| Analytics | PostHog (`posthog-js`, `@posthog/react`) |
| Errors | Sentry (`@sentry/react`, `@sentry/vite-plugin`) |
| Fonts | Geist Sans (UI) + Geist Mono (skill/MCP names) |

---

## Detectors (10 total, run in parallel)

| Tool | ID | Notes |
|------|----|-------|
| Claude Code | `claude` | skills + MCPs from `~/.claude/` |
| Cursor | `cursor` | MCPs from settings |
| Gemini CLI | `gemini` | |
| GitHub Copilot | `copilot` | |
| Windsurf | `windsurf` | |
| ChatGPT | `chatgpt` | |
| Aider | `aider` | `~/.aider/` or pipx venv |
| Continue.dev | `continue` | MCPs from `~/.continue/config.json` |
| Amazon Q | `amazonq` | `~/.aws/amazonq/` or `~/.q/` |
| Zed | `zed` | MCPs from `assistant.context_servers` |

---

## Features shipped

- Tool detection with skills + MCPs per LLM
- Skill detail panel — file navigator + full SKILL.md expand
- MCP detail panel — live `tools/list` via JSON-RPC stdio
- Light / dark / system theme (CSS custom properties)
- FSEvents watcher — auto-refresh on file changes
- Global shortcut (configurable, click-to-record UI)
- Launch at login (autostart)
- Window vibrancy
- Single-instance (no duplicate tray icons)
- Update check (Tauri updater IPC + GitHub API fallback)
- Onboarding empty state when no tools detected
- PostHog analytics (9 events tracked)
- Sentry error monitoring (React 19 `reactErrorHandler`)
- Sentry source maps upload on build (`sentryVitePlugin`)

---

## Env vars (`.env`, gitignored — see `.env.example`)

| Var | Purpose |
|-----|---------|
| `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN` | PostHog ingestion |
| `VITE_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` |
| `VITE_SENTRY_DSN` | Sentry error ingestion |
| `SENTRY_AUTH_TOKEN` | Source map upload (build only) — set |
| `SENTRY_ORG` | `personal-zt1` |
| `SENTRY_PROJECT` | `agentbar` |

---

## PostHog

- Project ID: `448542`
- Dashboard: `/dashboard/1651568` (5 insights: DAU, Tool Detection, Top Skills, Settings Changes, Theme Distribution)

## Sentry

- Org: `personal-zt1`
- Project: `agentbar` (ID: `4511486930911232`)
- DSN: `https://0a6b75547dcc0d0bc681f6e47c6e1ebc@o4511486603821056.ingest.us.sentry.io/4511486930911232`

---

## Pending / Next session

### Must do before v1.0
- [ ] `cargo check` — confirm Rust compiles clean (bash permission blocked last session)
- [ ] `npm run tauri:dev` — end-to-end test after cargo check
- [ ] Bump `version` in `package.json` + `Cargo.toml` to `0.6.0`
- [ ] Push commits to origin

### v1.0 gate (explicitly deferred)
- [ ] Apple Developer account + code signing certificate
- [ ] Notarization via `notarytool`
- [ ] GitHub Actions release pipeline (build universal binary, sign, notarize, upload DMG)
- [ ] `latest.json` update endpoint for `tauri-plugin-updater`

### Post v1.0
- [ ] More detectors: Cline, Cody, OpenAI CLI, JetBrains AI, Amazon Q CLI
- [ ] MCP client error UX improvements (show which MCPs timed out)
- [ ] Geist font — verify renders correctly in production `.app` build
