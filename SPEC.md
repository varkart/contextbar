# agentbar — Product & Technical Spec

**Version:** 0.1  
**Date:** 2026-05-30  
**Status:** Draft

---

## 1. Problem

Developers using multiple AI tools (Claude, Cursor, Gemini, Copilot, Windsurf) have no single view of:
- Which tools are installed
- Which skills/extensions are loaded per tool
- Which MCP servers are configured and active
- What's enabled vs disabled

Result: cognitive overhead, duplicate MCPs, forgotten skills, silent failures.

---

## 2. Goal

One-click macOS menu bar app that gives a unified read (and eventually write) view of all installed AI tooling.

**Success metrics:**
- Detect 5+ tools on first launch
- Show skills + MCPs per tool within 200ms of tray click
- Zero config required by user

---

## 3. Users

Solo developer on macOS using 2+ AI coding tools simultaneously.

---

## 4. Scope: v0.1

### In scope
- Detect installed tools: Claude, Cursor, Gemini CLI, Copilot (VS Code), Windsurf, ChatGPT (VS Code)
- Show skills per tool (name, active/inactive)
- Show MCP servers per tool (name, command, active/inactive)
- Show tool version where readable
- Tray icon, click-to-toggle popover
- Dark mode UI

### Out of scope (v0.2+)
- Toggle active/inactive (write back to config)
- Add/remove MCP servers from UI
- Notifications when config changes
- Search/filter
- Windows/Linux

---

## 5. UI Spec

### Window
- Size: 380 × 520px, fixed
- Position: TrayCenter (below menu bar icon)
- No decorations, no resize
- Always on top, closes on focus loss
- Dark theme: `zinc-900` background

### Layout

```
┌────────────────────────────────┐
│ agentbar              AI Tools │  ← header bar
├────────────────────────────────┤
│ ● Claude Code     v1.x    [>] │  ← tool row (installed, expanded)
│   Skills (30)                  │
│   ├ impeccable          active │
│   ├ frontend-design     active │
│   └ +28 more...                │
│   MCPs (2)                     │
│   ├ github              active │
│   └ netlify             active │
├────────────────────────────────┤
│ ● Cursor           v0.x   [>] │
│   Skills (12)                  │
│   MCPs (1)                     │
│   └ sql-explorer        active │
├────────────────────────────────┤
│ ● Gemini CLI       v0.23  [>] │
│   No skills detected           │
│   No MCPs detected             │
├────────────────────────────────┤
│ ○ Ollama           not found   │  ← not installed (grayed)
├────────────────────────────────┤
│                    ⟳ Refresh  │  ← footer
└────────────────────────────────┘
```

### States
| State | Visual |
|---|---|
| Installed + active | Green dot, white text |
| Installed, no config | Yellow dot, white text |
| Not installed | Gray dot, muted text |
| Loading | Skeleton rows |
| Error reading config | Red dot, error message inline |

---

## 6. Data Model

### AiTool
```typescript
interface AiTool {
  id: string;           // "claude" | "cursor" | "gemini" | "copilot" | "windsurf" | "chatgpt"
  name: string;         // Display name
  version?: string;
  installed: boolean;
  installPath?: string;
  skills: Skill[];
  mcps: McpServer[];
  error?: string;       // Config parse error message
}
```

### Skill
```typescript
interface Skill {
  name: string;
  path: string;
  active: boolean;      // v0.1: always true (read-only)
}
```

### McpServer
```typescript
interface McpServer {
  name: string;
  command: string;
  args: string[];
  active: boolean;      // v0.1: always true (read-only)
  hasSecrets: boolean;  // true if env keys present (never expose values)
}
```

---

## 7. Rust Architecture

### Module structure
```
src-tauri/src/
├── lib.rs              # App setup, tray, IPC command registration
├── main.rs             # Binary entry
├── models.rs           # AiTool, Skill, McpServer structs + serde derives
└── detectors/
    ├── mod.rs          # pub fn detect_all() -> Vec<AiTool>
    ├── claude.rs
    ├── cursor.rs
    ├── gemini.rs
    ├── copilot.rs
    ├── windsurf.rs
    └── chatgpt.rs
```

### IPC Commands
```rust
// Registered in lib.rs
#[tauri::command]
fn get_tools() -> Vec<AiTool>       // Called on window open + refresh

// v0.2
#[tauri::command]  
fn set_mcp_active(tool_id: String, mcp_name: String, active: bool) -> Result<(), String>
```

---

## 8. Detector Specs

### Claude Code
| Field | Source |
|---|---|
| Installed | `~/.claude/` directory exists |
| Version | `~/.claude/settings.json` → `version` or `which claude` → parse |
| Skills | `ls ~/.claude/skills/` → each dir/file = one skill |
| MCPs | `~/.claude/settings.json` → `mcpServers` keys |
| MCP has secrets | `mcpServers[name].env` is non-empty object |

### Cursor
| Field | Source |
|---|---|
| Installed | `~/.cursor/` directory exists |
| Version | `~/.cursor/argv.json` or `which cursor` |
| Skills | `ls ~/.cursor/skills-cursor/` |
| MCPs | `~/.cursor/mcp.json` → `mcpServers` keys |

### Gemini CLI
| Field | Source |
|---|---|
| Installed | `which gemini` returns path |
| Version | `gemini --version` stdout |
| Skills | none (CLI tool) |
| MCPs | `~/.config/gemini/settings.json` → `mcpServers` (if present) |

### GitHub Copilot (VS Code)
| Field | Source |
|---|---|
| Installed | `~/.vscode/extensions/github.copilot-chat-*` dir exists |
| Version | Parse latest dir name: `github.copilot-chat-{version}` |
| Skills | none |
| MCPs | `~/Library/Application Support/Code/User/settings.json` → `mcp.servers` |

### Windsurf
| Field | Source |
|---|---|
| Installed | `~/.codeium/windsurf/bin/windsurf` exists |
| Version | `~/.windsurf/argv.json` or binary `--version` |
| Skills | none detected |
| MCPs | `~/Library/Application Support/Windsurf/User/settings.json` → `mcp.servers` |

### ChatGPT (VS Code extension)
| Field | Source |
|---|---|
| Installed | `~/.vscode/extensions/openai.chatgpt-*` dir exists |
| Version | Parse latest dir name |
| Skills | none |
| MCPs | none |

---

## 9. Frontend Component Tree

```
App
└── TrayPopover
    ├── Header
    ├── ToolList (scrollable)
    │   └── ToolRow (×N)
    │       ├── ToolHeader (name, version, installed dot, expand toggle)
    │       └── ToolDetails (expanded only)
    │           ├── SkillSection
    │           │   └── SkillRow (×N) — name + active badge
    │           └── McpSection
    │               └── McpRow (×N) — name + active badge + secrets indicator
    └── Footer (refresh button, last updated time)
```

---

## 10. Build & Release

### Dev
```bash
npm run tauri dev
```

### Release build (macOS)
```bash
npm run tauri build
# Output: src-tauri/target/release/bundle/macos/agentbar.app
```

### Signing (v0.2)
- Apple Developer ID required for notarization
- Tauri handles via `tauri.conf.json` → `bundle.macOS.signingIdentity`

---

## 11. Roadmap

| Version | Features |
|---|---|
| **v0.1** | Detect tools, read skills + MCPs, read-only display |
| **v0.2** | Toggle MCP active/inactive (write config), keyboard shortcut to open |
| **v0.3** | File watcher (auto-refresh on config change), search/filter |
| **v0.4** | Add/remove MCP servers from UI |
| **v0.5** | Notifications ("new skill installed", "MCP server added") |
| **v1.0** | App Store or notarized DMG release |
