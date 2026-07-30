# Context Bar

> macOS menu bar app — mission control for every AI coding agent on your Mac.

[![Release](https://img.shields.io/github/v/release/varkart/contextbar)](https://github.com/varkart/contextbar/releases/latest)
[![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)](https://github.com/varkart/contextbar/releases/latest)
[![License](https://img.shields.io/github/license/varkart/contextbar)](LICENSE)
[![Build](https://img.shields.io/github/actions/workflow/status/varkart/contextbar/release.yml)](https://github.com/varkart/contextbar/actions)
[![CI](https://img.shields.io/github/actions/workflow/status/varkart/contextbar/ci.yml?label=ci)](https://github.com/varkart/contextbar/actions)

<p align="center">
  <img src=".github/assets/demo.gif" width="760" alt="Context Bar demo">
</p>

---

## What it does

If you use multiple AI coding tools, you probably have skills scattered across `~/.claude/`, `~/.cursor/`, MCPs configured in three different JSON files, sessions you can never find again, and no clear picture of what's running where.

Context Bar sits in your menu bar and gives you one place to see all of it — every agent, skill, server, and session — instantly, with no configuration. The tray popover is the quick glance; a full Expanded window (⌘K to search, ⌘1–6 to jump sections) is one click away for anything that needs more room.

---

## Use cases

**See everything at a glance**
Open the menu bar popover and immediately see which AI tools are installed, which have active skills and MCPs, and which are installed but unconfigured.

**Toggle skills without touching config files**
Enable or disable a skill for any tool with a single click. Context Bar moves the skill folder to/from the `.disabled` directory — no terminal, no manual file edits.

**Manage MCP servers**
Add, remove, or toggle an MCP server per tool without editing JSON. Changes write back to the tool's config atomically, with a backup kept automatically.

**Browse skill content in-app**
Open any skill's `SKILL.md` directly in the detail panel — read the full instructions without leaving your workflow.

**See what tools an MCP server exposes**
The MCP detail panel queries the server live over JSON-RPC stdio and lists every tool it exposes, with descriptions.

**Install an MCP package**
For `npx`-based MCPs, install the npm package globally from inside the app and see the installed version alongside the latest available.

**Audit your AI setup**
Check at a glance which tools have MCP servers registered, which skills are disabled, and whether any MCP binaries are missing from PATH (the doctor check notifies you automatically).

**Catch up on what you were doing**
The Expanded window's My Work tab groups recent sessions by project so you can pick up an agent conversation where you left off — today, yesterday, this week, or the last 7 days.

**Review sessions across every agent**
Browse and search session transcripts from Claude, Codex, Gemini, and others in one list, with token usage per session.

**Track repos and worktrees**
See every worktree per repo, its branch, dirty/merged status, and whether it's safe to delete — with a per-repo view of each agent's capability overrides (e.g. Claude settings.json tri-state permissions).

**Inspect Codex permission profiles**
Read-only view of Codex's `[permissions.<name>]` profiles — access level and allow/deny actions — without opening the TOML.

**Jump to anything with ⌘K**
The Expanded window's command palette searches sessions, repos, and sections; ⌘1–⌘6 jump straight to a section from anywhere in the window.

---

## Features

- **Detects 10 AI tools** automatically — no setup required
- **Skills** — lists every skill per tool with name and description
- **MCP servers** — shows configured MCPs with live `tools/list` via JSON-RPC stdio; add, remove, or toggle without touching JSON
- **Status indicators** — hover the dot to see installed / no config / error state
- **Search** — filter across tools, skills, and MCPs in one keystroke
- **Skill detail panel** — browse skill files directly in the app
- **MCP detail panel** — see live tools exposed by each MCP server in real time
- **Permissions & context toggles** — turn Claude Code features and tools off from the agent's Permissions tab (auto memory, hooks, WebFetch, plan mode, and more) to shrink startup context. Writes only the documented `settings.json` keys, with an automatic backup before every change. **Toggles apply to new agent sessions only** — sessions already running keep their loaded settings until restarted; verify in a fresh session with `/context`
- **Codex permission profiles** — read-only view of `[permissions.<name>]` profiles from Codex's config
- **Notifications panel** — error / warn / info feed, including missing-MCP-binary alerts
- **Expanded window** — a full-size window (separate from the tray popover) with:
  - **My Work** — recent sessions grouped by project, filterable by today / yesterday / this week / last 7 days
  - **Sessions** — searchable transcript list across every agent, with per-session token usage
  - **Repos** — worktrees per repo with branch, dirty/merged/stale status, safe-to-delete detection, and per-repo agent capability overrides
  - **Command palette (⌘K)** and section shortcuts (⌘1–⌘6)
- **FSEvents watcher** — auto-refreshes when any config file changes on disk
- **Light / dark / system theme**
- **Global shortcut** — configurable, click-to-record UI
- **Launch at login**
- **Update check** — notifies when a new release is available

---

## Supported tools

Claude Code, Cursor, Gemini CLI, GitHub Copilot, Windsurf, ChatGPT, Codex CLI, Kiro, OpenCode, Antigravity CLI

---

## Install

1. Download `Context.Bar_vX.X.X_universal.dmg` from [Releases](https://github.com/varkart/contextbar/releases/latest)
2. Open the DMG and drag Context Bar to Applications
3. Launch Context Bar from Applications

**macOS security prompt:**

Because Context Bar is not notarized with an Apple Developer certificate, macOS may block the first launch with a warning. You can bypass this in one of three ways:

1. **Right-Click Open (Easiest)**: Right-click (or Control-click) `/Applications/Context Bar.app` in Finder, select **Open**, and click **Open** again in the confirmation dialog.
2. **Terminal**: Run this command once to clear the quarantine flag:
   ```bash
   xattr -d com.apple.quarantine /Applications/Context\ Bar.app
   ```
3. **System Settings**: Go to **System Settings → Privacy & Security**, scroll down to the Security section, and click **Open Anyway**.

---

## Requirements

- macOS 13 (Ventura) or later
- Apple Silicon or Intel (universal binary)

> **Windows / Linux not supported.** Context Bar uses macOS-specific APIs (tray, FSEvents, Tauri positioner). If you add Windows support, regenerate the full icon set from the source PNG:
> ```bash
> npm run tauri icon assets/sloth_transparent_nobg.png
> ```
> This regenerates all sizes including `icon.ico` and `icon.png` in `src-tauri/icons/`.

---

## Build from source

**Prerequisites:**

- [Rust](https://rustup.rs) (stable)
- [Node.js](https://nodejs.org) 20+
- Xcode Command Line Tools: `xcode-select --install`

```bash
git clone https://github.com/varkart/contextbar.git
cd contextbar
npm install
npm run tauri dev     # development with hot reload
npm run tauri build   # production build → src-tauri/target/release/bundle/
```

**Universal binary (arm64 + x86_64):**

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri build -- --target universal-apple-darwin
```

---

## Project structure

```
contextbar/
├── src/                    # React frontend (TypeScript + Tailwind v4)
│   ├── components/         # Tray popover UI components
│   └── expanded/           # Expanded window (My Work, Sessions, Repos, command palette)
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs          # Tray, window, IPC commands
│   │   └── engine/
│   │       ├── manifests/  # Per-tool TOML manifests (10 tools)
│   │       └── mod.rs      # detect_all() — runs all detectors in parallel
│   └── Cargo.toml
└── .github/workflows/
    └── release.yml         # Build → ad-hoc sign → DMG → GitHub Release
```

---

## Stack

| Layer | Tech |
|-------|------|
| Shell | Tauri 2.0 |
| Backend | Rust |
| Frontend | React 19 + TypeScript + Tailwind CSS v4 |
| Build | Vite 7 |

---

## Contributing

Issues and PRs welcome.

Before opening a PR:

```bash
cd src-tauri && cargo check   # must pass
npm run build                 # must pass
```

Keep commits small and focused. One feature or fix per PR.

---

## License

MIT — see [LICENSE](LICENSE)
