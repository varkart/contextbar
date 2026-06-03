# agentbar — Status

**Version:** 0.6.0
**Branch:** main (clean, in sync with origin)
**Last updated:** 2026-06-03

---

## Commits this cycle (since v0.5.0)

| SHA | Description |
|-----|-------------|
| `be9ee2e` | fix duplicate tray icon — remove conf trayIcon, add icon_as_template |
| `c203484` | add demo GIF to README |
| `463be73` | add README and MIT license |
| `3a61cfe` | bump to v0.6.0 |
| `05eab22` | add GitHub Actions release workflow with ad-hoc signing |
| `ae62478` | hide non-installed tools, add status tooltip, show MCP description |
| `5645a3e` | fix startup latency and cargo check error in detectors |
| `4db32ad` | add STATUS.md with current project state and pending items |
| `ac05d21` | parallelize detectors to fix 5s startup time |
| `300e885` | v0.6.0 — fonts, MCP client, new detectors, observability, shortcut UI |

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
- Only installed tools shown (non-installed filtered out)
- Skill detail panel — file navigator + full SKILL.md expand
- MCP detail panel — live `tools/list` via JSON-RPC stdio + description
- Light / dark / system theme (CSS custom properties)
- FSEvents watcher — auto-refresh on file changes
- Global shortcut (configurable, click-to-record UI)
- Launch at login (autostart)
- Window vibrancy
- Single-instance (no duplicate tray icons)
- Single tray icon — template (white/black), right-click → Quit / Settings
- Status dot tooltip on hover
- Update check (Tauri updater IPC + GitHub API fallback)
- Onboarding empty state when no tools detected
- PostHog analytics (9 events tracked)
- Sentry error monitoring (React 19 `reactErrorHandler`)
- Sentry source maps upload on build (`sentryVitePlugin`)
- GitHub Actions release pipeline (build → ad-hoc sign → DMG → GitHub Release)
- README + MIT license

---

## Env vars (`.env`, gitignored — see `.env.example`)

| Var | Purpose |
|-----|---------|
| `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN` | PostHog ingestion |
| `VITE_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` |
| `VITE_SENTRY_DSN` | Sentry error ingestion |
| `SENTRY_AUTH_TOKEN` | Source map upload (build only) |
| `SENTRY_ORG` | `personal-zt1` |
| `SENTRY_PROJECT` | `agentbar` |

All 6 synced to GitHub repo secrets via `gh secret set --env-file .env`.

---

## PostHog

- Project ID: `448542`
- Dashboard: `/dashboard/1651568`

## Sentry

- Org: `personal-zt1`
- Project: `agentbar` (ID: `4511486930911232`)

---

## Release process

```bash
git tag -a vX.Y.Z -m "$(cat <<'EOF'
One-line summary

- Change 1
- Change 2
EOF
)"
git push --tags
```

GitHub Actions builds universal DMG, signs ad-hoc, uploads to release automatically.

---

## Pending / Next

### v1.0 gate (deferred — needs Apple Dev account)
- [ ] Apple Developer account (Individual or LLC org)
- [ ] Code signing certificate (Developer ID Application)
- [ ] Notarization via `notarytool`
- [ ] Update signing step in `release.yml`
- [ ] `latest.json` endpoint for `tauri-plugin-updater`

### Post v1.0
- [ ] More detectors: Cline, Cody, OpenAI CLI, JetBrains AI
- [ ] MCP client error UX (show which MCPs timed out)
- [ ] Geist font — verify renders correctly in production `.app`
