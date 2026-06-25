# Context Bar

> macOS menu bar app — unified view of AI tool skills and MCP servers.

[![Release](https://img.shields.io/github/v/release/varkart/contextbar)](https://github.com/varkart/contextbar/releases/latest)
[![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)](https://github.com/varkart/contextbar/releases/latest)
[![License](https://img.shields.io/github/license/varkart/contextbar)](LICENSE)
[![Build](https://img.shields.io/github/actions/workflow/status/varkart/contextbar/release.yml)](https://github.com/varkart/contextbar/actions)

<p align="center">
  <img src=".github/assets/demo.gif" width="380" alt="Context Bar demo">
</p>

---

## What it does

If you use multiple AI coding tools, you probably have skills scattered across `~/.claude/`, `~/.cursor/`, MCPs configured in three different JSON files, and no clear picture of what's active where.

Context Bar sits in your menu bar and gives you one place to see all of it — instantly, with no configuration.

---

## Use cases

**See everything at a glance**
Open the menu bar popover and immediately see which AI tools are installed, which have active skills and MCPs, and which are installed but unconfigured.

**Toggle skills without touching config files**
Enable or disable a skill for any tool with a single click. Context Bar moves the skill folder to/from the `.disabled` directory — no terminal, no manual file edits.

**Toggle MCP servers on/off**
Activate or deactivate an MCP server per tool without editing JSON. Changes write back to the tool's config atomically, with a backup kept automatically.

**Browse skill content in-app**
Open any skill's `SKILL.md` directly in the detail panel — read the full instructions without leaving your workflow.

**See what tools an MCP server exposes**
The MCP detail panel queries the server live over JSON-RPC stdio and lists every tool it exposes, with descriptions.

**Install an MCP package**
For `npx`-based MCPs, install the npm package globally from inside the app and see the installed version alongside the latest available.

**Audit your AI setup**
Check at a glance which tools have MCP servers registered, which skills are disabled, and whether any MCP binaries are missing from PATH (the doctor check notifies you automatically).

---

## Features

- **Detects 8 AI tools** automatically — no setup required
- **Skills** — lists every skill per tool with name and description
- **MCP servers** — shows configured MCPs with live `tools/list` via JSON-RPC stdio
- **Status indicators** — hover the dot to see installed / no config / error state
- **Search** — filter across tools, skills, and MCPs in one keystroke
- **Skill detail panel** — browse skill files directly in the app
- **MCP detail panel** — see live tools exposed by each MCP server in real time
- **FSEvents watcher** — auto-refreshes when any config file changes on disk
- **Light / dark / system theme**
- **Global shortcut** — configurable, click-to-record UI
- **Launch at login**
- **Update check** — notifies when a new release is available

---

## Supported tools

Claude Code, Cursor, Gemini CLI, GitHub Copilot, Windsurf, ChatGPT, Codex CLI, Kiro

---

## Install

1. Download `Context.Bar_vX.X.X_universal.dmg` from [Releases](https://github.com/varkart/contextbar/releases/latest)
2. Open the DMG and drag Context Bar to Applications
3. Launch Context Bar from Applications

**macOS security prompt:**

Because Context Bar is not notarized with an Apple Developer certificate, macOS may block the first launch. Run this once:

```bash
xattr -d com.apple.quarantine /Applications/Context\ Bar.app
```

Or: System Settings → Privacy & Security → scroll down → **Open Anyway**

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
│   └── components/         # UI components
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs          # Tray, window, IPC commands
│   │   └── engine/
│   │       ├── manifests/  # Per-tool TOML manifests (8 tools)
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
