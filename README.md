# agentbar

> macOS menu bar app — unified view of every AI tool, skill, and MCP server on your machine.

[![Release](https://img.shields.io/github/v/release/varkart/agentbar)](https://github.com/varkart/agentbar/releases/latest)
[![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)](https://github.com/varkart/agentbar/releases/latest)
[![License](https://img.shields.io/github/license/varkart/agentbar)](LICENSE)
[![Build](https://img.shields.io/github/actions/workflow/status/varkart/agentbar/release.yml)](https://github.com/varkart/agentbar/actions)

<!-- Replace with actual screenshot/GIF: drop into .github/assets/ and update path -->
<!-- ![agentbar demo](.github/assets/demo.gif) -->

---

## What it does

If you use multiple AI coding tools, you probably have skills scattered across `~/.claude/`, `~/.cursor/`, MCPs configured in three different JSON files, and no clear picture of what's active where.

agentbar sits in your menu bar and gives you one place to see all of it — instantly, with no configuration.

---

## Features

- **Detects 10 AI tools** automatically — no setup required
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
- **Single instance** — no duplicate tray icons
- **Update check** — notifies when a new release is available

---

## Supported tools

| Tool | Skills | MCPs | Version |
|------|--------|------|---------|
| Claude Code | ✓ `~/.claude/skills/` | ✓ `~/.claude/settings.json` | ✓ |
| Cursor | ✓ `~/.cursor/skills-cursor/` | ✓ `~/.cursor/mcp.json` | ✓ |
| Gemini CLI | — | ✓ `~/.config/gemini/settings.json` | ✓ |
| GitHub Copilot | — | — | ✓ |
| Windsurf | — | — | ✓ |
| ChatGPT (VS Code) | — | — | ✓ |
| Aider | — | — | ✓ |
| Continue.dev | — | ✓ `~/.continue/config.json` | — |
| Amazon Q | — | — | — |
| Zed | — | ✓ `assistant.context_servers` | — |

---

## Install

1. Download `agentbar_vX.X.X_universal.dmg` from [Releases](https://github.com/varkart/agentbar/releases/latest)
2. Open the DMG and drag agentbar to Applications
3. Launch agentbar from Applications

**macOS security prompt:**

Because agentbar is not notarized with an Apple Developer certificate, macOS may block the first launch. Run this once:

```bash
xattr -d com.apple.quarantine /Applications/agentbar.app
```

Or: System Settings → Privacy & Security → scroll down → **Open Anyway**

---

## Requirements

- macOS 13 (Ventura) or later
- Apple Silicon or Intel (universal binary)

---

## Build from source

**Prerequisites:**

- [Rust](https://rustup.rs) (stable)
- [Node.js](https://nodejs.org) 20+
- Xcode Command Line Tools: `xcode-select --install`

```bash
git clone https://github.com/varkart/agentbar.git
cd agentbar
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
agentbar/
├── src/                    # React frontend (TypeScript + Tailwind v4)
│   └── components/         # UI components
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs          # Tray, window, IPC commands
│   │   ├── detectors/      # Per-tool config readers (10 detectors, run in parallel)
│   │   └── mcp_client.rs   # JSON-RPC stdio MCP client
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
