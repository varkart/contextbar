# agentbar — Product & Technical Spec

**Version:** 0.2  
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
- Show skills per tool (name, description on hover, active/inactive)
- Show MCP servers per tool (name, command+args on hover, active/inactive, secrets indicator)
- Show tool version where readable
- Tray icon, click-to-toggle popover
- Escape key closes popover
- Click outside closes popover
- Dark mode UI

### Out of scope (v0.2+)
- Toggle active/inactive (write back to config)
- Add/remove MCP servers from UI
- Notifications when config changes
- Search/filter
- Launch at login
- Global hotkey
- Windows/Linux

---

## 5. macOS Menu Bar Gotchas

These must be accounted for in implementation. Each has a mitigation strategy.

### 5.1 Template Icon (Critical)
- **Gotcha:** Tray icon must be a black-only PNG with transparency. Non-template icons look wrong in dark/light mode.
- **Mitigation:** `iconAsTemplate: true` in `tauri.conf.json`. Supply a 16×16 and 32×32 (retina) black PNG.

### 5.2 Focus Loss Dismissal
- **Gotcha:** Popover must hide when user clicks elsewhere. Without this, the window floats annoyingly.
- **Mitigation:** Listen for `WindowEvent::Focused(false)` in Tauri and call `window.hide()`.

### 5.3 First-Click Activation
- **Gotcha:** On macOS, clicking a tray icon when the app is not focused may require two clicks (one to focus app, one to trigger). 
- **Mitigation:** Use `window.set_focus()` explicitly after `window.show()`. Verify in E2E test.

### 5.4 Escape Key
- **Gotcha:** Users expect Escape to close any floating panel. Without this feels broken.
- **Mitigation:** Add `keydown` listener in React for `Escape` → call Tauri `hide_window` command.

### 5.5 Multiple Displays
- **Gotcha:** On multi-monitor setups the popover must appear on the display containing the menu bar (the primary display).
- **Mitigation:** `tauri-plugin-positioner` `Position::TrayCenter` handles this correctly. Verify manually on multi-display.

### 5.6 MacBook Notch (2021+)
- **Gotcha:** MacBook Pro notch reduces available menu bar space. Icons can be hidden behind notch if too many items.
- **Mitigation:** Keep icon minimal (18px template). No fix for overflow — macOS hides icons; document this known limitation.

### 5.7 Window Level
- **Gotcha:** Default window level is `Normal`. Popover must appear above all other windows including full-screen split views.
- **Mitigation:** Set `always_on_top(true)` in `WebviewWindowBuilder`. For full-screen spaces, Tauri uses `NSWindowLevel` floating automatically with this flag.

### 5.8 App Sandbox & File System Access
- **Gotcha:** If app is sandboxed (required for Mac App Store), it cannot read `~/.claude/`, `~/.cursor/`, `~/.vscode/extensions/` without entitlements.
- **Mitigation (v0.1):** Ship as non-sandboxed, notarized DMG. Not App Store. Entitlement `com.apple.security.files.user-selected.read-only` not sufficient — need `com.apple.security.files.all` or disable sandbox.
- **Mitigation (v1.0):** If App Store required, use `NSOpenPanel` to let user grant access once, then use Security-Scoped Bookmarks to persist.

### 5.9 macOS Privacy (Sequoia / 15+)
- **Gotcha:** macOS 15+ shows privacy prompts for apps reading outside their container, especially `~/Library/Application Support/`.
- **Mitigation:** Add `NSPrivacyAccessedAPITypes` to `Info.plist` for file access. Test on macOS 15 explicitly.

### 5.10 No Dock Icon
- **Gotcha:** Menu bar-only apps must not show in the Dock or Cmd+Tab switcher.
- **Mitigation:** `app.set_activation_policy(ActivationPolicy::Accessory)` already in `lib.rs`. Verify it doesn't flicker on launch.

### 5.11 Window Vibrancy (Optional, v0.2)
- **Gotcha:** Native macOS popovers use frosted glass (vibrancy). Plain solid background feels out of place.
- **Mitigation:** `window-vibrancy` crate, apply `NSVisualEffectMaterial::HudWindow` or `UnderWindow`. Optional for v0.1.

### 5.12 Retina Assets
- **Gotcha:** 1× icon looks blurry on Retina displays.
- **Mitigation:** Supply both `32x32.png` (1×) and `128x128@2x.png` (2×) — already in scaffold.

### 5.13 Hardened Runtime (Notarization)
- **Gotcha:** Apple notarization requires hardened runtime. Some Tauri features (JIT, unsigned entitlements) break this.
- **Mitigation:** Tauri 2.0 supports notarization. Set `bundle.macOS.hardened_runtime = true`. Add entitlements file for any needed exceptions.

### 5.14 CPU / Battery Drain
- **Gotcha:** File watchers using polling drain CPU. Menu bar apps are always running.
- **Mitigation (v0.1):** No file watcher. Detect on demand (tray click + manual refresh). v0.3: use `notify` crate with FSEvents backend (native, event-driven, not polling).

### 5.15 `Cmd+W` Must Not Close
- **Gotcha:** Users press Cmd+W in other apps and the menu bar popover may accidentally receive it if it's key window.
- **Mitigation:** Intercept and swallow `Cmd+W` in the React frontend or via Tauri window config.

### 5.16 Window Animation
- **Gotcha:** Plain `window.show()` snaps with no animation, feels jarring.
- **Mitigation (v0.2):** Apply CSS `opacity` + `translateY` transition on mount for fade-in-from-top feel.

---

## 6. Common Menu Bar App Features

Features users expect from well-crafted menu bar apps (based on apps like Raycast, Bartender, Hand Mirror, Lungo, etc.):

| Feature | v0.1 | v0.2 | v0.3+ |
|---|---|---|---|
| Tray icon click → popover | ✓ | | |
| Escape to close | ✓ | | |
| Click outside to close | ✓ | | |
| Hover tooltips on skills/MCPs | ✓ | | |
| Refresh button | ✓ | | |
| Last-updated timestamp | ✓ | | |
| Dark mode UI | ✓ | | |
| Launch at login toggle | | ✓ | |
| Global keyboard shortcut (⌘⇧A) | | ✓ | |
| Window vibrancy (frosted glass) | | ✓ | |
| File watcher (auto-refresh) | | | ✓ |
| Search/filter tools | | | ✓ |
| Settings panel | | ✓ | |
| About panel (version, links) | | ✓ | |
| Check for updates | | | ✓ |
| Collapsed/expanded memory per tool | | ✓ | |
| VoiceOver accessibility labels | | ✓ | |

---

## 7. UI Spec

### Window
- Size: 380 × 520px, fixed
- Position: TrayCenter (below menu bar icon)
- No decorations, no resize
- Always on top
- Closes on: focus loss, Escape key, Cmd+W
- Dark theme: `zinc-900` background

### Layout

```
┌────────────────────────────────────┐
│ agentbar                  AI Tools │  ← header
├────────────────────────────────────┤
│ ● Claude Code      v1.x      [∨]  │  ← tool row (expanded)
│   Skills (30)                      │
│   ├ impeccable    [active] [?]     │  ← [?] = hover tooltip trigger
│   ├ frontend-design [active] [?]   │
│   └ +28 more…                      │
│   MCPs (2)                         │
│   ├ github        [active] [🔑][?] │  ← [🔑] = has secrets
│   └ netlify       [active] [🔑][?] │
├────────────────────────────────────┤
│ ● Cursor           v0.x      [∨]  │
│   Skills (12)                      │
│   MCPs (1)                         │
│   └ sql-explorer  [active] [?]     │
├────────────────────────────────────┤
│ ● Gemini CLI       v0.23     [∨]  │
│   No skills detected               │
│   No MCPs detected                 │
├────────────────────────────────────┤
│ ○ Ollama           not installed   │  ← grayed out
├────────────────────────────────────┤
│ Updated 12s ago           ⟳       │  ← footer
└────────────────────────────────────┘
```

### Tooltip: Skill Hover
```
┌──────────────────────────────────┐
│ impeccable                       │
│ Polish and redesign frontend UI  │
│ — hierarchy, spacing, states,    │
│   accessibility, motion          │
│                                  │
│ Path: ~/.claude/skills/impeccable│
└──────────────────────────────────┘
```
- Source: first `description:` frontmatter line from `SKILL.md`, or first non-empty paragraph
- Fallback: show path only if no description found
- Max width: 260px, max 3 lines, truncate with ellipsis

### Tooltip: MCP Server Hover
```
┌──────────────────────────────────┐
│ github                           │
│ npx -y @modelcontextprotocol/    │
│   server-github                  │
│                                  │
│ Secrets: GITHUB_PERSONAL_ACCESS  │
│          _TOKEN (value hidden)   │
└──────────────────────────────────┘
```
- Show: command + args (full string)
- Show: env key names only, never values
- Max width: 260px

### States
| State | Visual |
|---|---|
| Installed + active | Green dot (`bg-green-500`), white text |
| Installed, no config | Yellow dot (`bg-yellow-500`), white text |
| Not installed | Gray dot (`bg-zinc-600`), `text-zinc-500` |
| Loading | Skeleton rows (`animate-pulse`) |
| Error reading config | Red dot (`bg-red-500`), inline error message |

---

## 8. Data Model

### AiTool
```typescript
interface AiTool {
  id: string;             // "claude" | "cursor" | "gemini" | "copilot" | "windsurf" | "chatgpt"
  name: string;
  version?: string;
  installed: boolean;
  installPath?: string;
  skills: Skill[];
  mcps: McpServer[];
  error?: string;
}
```

### Skill
```typescript
interface Skill {
  name: string;
  path: string;
  description?: string;   // From SKILL.md frontmatter or first paragraph
  active: boolean;        // v0.1: always true (read-only)
}
```

### McpServer
```typescript
interface McpServer {
  name: string;
  command: string;
  args: string[];
  description?: string;   // Derived: "<command> <args joined>" for display
  active: boolean;        // v0.1: always true (read-only)
  hasSecrets: boolean;    // env keys present — values NEVER exposed
  secretKeyNames: string[]; // Key names only (e.g. ["GITHUB_TOKEN"]), never values
}
```

---

## 9. Rust Architecture

### Module structure
```
src-tauri/src/
├── lib.rs              # App setup, tray, IPC, focus-loss handler
├── main.rs             # Binary entry
├── models.rs           # AiTool, Skill, McpServer structs + serde
└── detectors/
    ├── mod.rs          # pub fn detect_all() -> Vec<AiTool>
    ├── claude.rs       # ~/.claude/
    ├── cursor.rs       # ~/.cursor/
    ├── gemini.rs       # which gemini + ~/.config/gemini/
    ├── copilot.rs      # ~/.vscode/extensions/github.copilot-chat-*
    ├── windsurf.rs     # ~/.windsurf/ + ~/.codeium/windsurf/
    └── chatgpt.rs      # ~/.vscode/extensions/openai.chatgpt-*
```

### IPC Commands
```rust
#[tauri::command]
fn get_tools() -> Vec<AiTool>     // On window open + refresh button

#[tauri::command]
fn hide_window(window: WebviewWindow)  // Called from React on Escape / blur

// v0.2
#[tauri::command]
fn set_mcp_active(tool_id: String, mcp_name: String, active: bool) -> Result<(), String>
```

### Skill Description Parsing (Rust)
```rust
// For SKILL.md-based skills (Claude, Cursor):
// 1. Read <skill_path>/SKILL.md or <skill_path>.md
// 2. Parse YAML frontmatter block (--- ... ---) for `description:` field
// 3. If no frontmatter, take first non-empty non-heading line (max 120 chars)
// 4. If no file, return None
fn parse_skill_description(skill_path: &Path) -> Option<String>
```

---

## 10. Detector Specs

### Claude Code
| Field | Source |
|---|---|
| Installed | `~/.claude/` exists |
| Version | `~/.claude/settings.json → version` or `which claude && claude --version` |
| Skills | `~/.claude/skills/` → each entry is a skill; parse description from `SKILL.md` |
| MCPs | `~/.claude/settings.json → mcpServers` |
| MCP secrets | `mcpServers[n].env` non-empty → `hasSecrets=true`, expose key names only |

### Cursor
| Field | Source |
|---|---|
| Installed | `~/.cursor/` exists |
| Version | `~/.cursor/argv.json → version` |
| Skills | `~/.cursor/skills-cursor/` → each entry; parse description from skill file |
| MCPs | `~/.cursor/mcp.json → mcpServers` |

### Gemini CLI
| Field | Source |
|---|---|
| Installed | `which gemini` → non-empty |
| Version | `gemini --version` stdout (parse first token) |
| Skills | none |
| MCPs | `~/.config/gemini/settings.json → mcpServers` if file exists |

### GitHub Copilot (VS Code)
| Field | Source |
|---|---|
| Installed | `~/.vscode/extensions/github.copilot-chat-*` glob matches ≥1 dir |
| Version | Latest matched dir name: `github.copilot-chat-{version}` |
| Skills | none |
| MCPs | `~/Library/Application Support/Code/User/settings.json → mcp.servers` |

### Windsurf
| Field | Source |
|---|---|
| Installed | `~/.codeium/windsurf/bin/windsurf` exists |
| Version | `~/.windsurf/argv.json → version` |
| Skills | none detected |
| MCPs | `~/Library/Application Support/Windsurf/User/settings.json → mcp.servers` |

### ChatGPT (VS Code extension)
| Field | Source |
|---|---|
| Installed | `~/.vscode/extensions/openai.chatgpt-*` glob matches ≥1 dir |
| Version | Latest matched dir name |
| Skills | none |
| MCPs | none |

---

## 11. Frontend Component Tree

```
App
└── TrayPopover
    ├── Header ("agentbar" + "AI Tools")
    ├── ToolList (overflow-y-auto)
    │   └── ToolRow (×N, keyed by tool.id)
    │       ├── ToolHeader
    │       │   ├── StatusDot (color by install state)
    │       │   ├── ToolName + Version
    │       │   └── ExpandToggle (chevron)
    │       └── ToolDetails (animated collapse, expanded only)
    │           ├── SkillSection
    │           │   ├── SectionLabel ("Skills (N)")
    │           │   ├── SkillRow (×N)
    │           │   │   ├── SkillName
    │           │   │   ├── ActiveBadge
    │           │   │   └── Tooltip (hover → description + path)
    │           │   └── ShowMore (if >5 skills)
    │           └── McpSection
    │               ├── SectionLabel ("MCPs (N)")
    │               └── McpRow (×N)
    │                   ├── McpName
    │                   ├── ActiveBadge
    │                   ├── SecretsIndicator (key icon, if hasSecrets)
    │                   └── Tooltip (hover → command+args + secret key names)
    └── Footer
        ├── LastUpdated ("Updated Ns ago")
        └── RefreshButton (⟳, triggers get_tools())
```

---

## 12. Build & Release

### Dev
```bash
npm run tauri dev
```

### Type check only
```bash
npm run build       # Vite build (TypeScript errors surface here)
```

### Rust check (fast)
```bash
cd src-tauri && source "$HOME/.cargo/env" && cargo check
```

### Release build (macOS)
```bash
npm run tauri build
# Output: src-tauri/target/release/bundle/macos/agentbar.app
#         src-tauri/target/release/bundle/dmg/agentbar_*.dmg
```

### Signing + Notarization (v0.2+)
- Requires Apple Developer ID
- `tauri.conf.json → bundle.macOS.signingIdentity`
- `tauri.conf.json → bundle.macOS.entitlements` pointing to `entitlements.plist`
- Notarize via `xcrun notarytool` or Tauri GitHub Action

---

## 13. Testing Strategy

### 13.1 Unit Tests (Rust)

Location: `src-tauri/src/detectors/<name>.rs` → `#[cfg(test)]` blocks  
Run: `cargo test`

#### Claude detector unit tests
| Test | Given | Expected |
|---|---|---|
| `test_claude_installed` | Fixture dir with `~/.claude/` containing `settings.json` | `installed=true` |
| `test_claude_not_installed` | No `~/.claude/` dir | `installed=false`, empty skills + mcps |
| `test_claude_skills_parsed` | `skills/` dir with 3 entries | `skills.len() == 3` |
| `test_claude_skill_description` | Skill dir with `SKILL.md` with `description: "foo bar"` frontmatter | `skill.description == Some("foo bar")` |
| `test_claude_skill_no_description` | Skill dir with `SKILL.md` with no frontmatter | `skill.description == None` or first paragraph |
| `test_claude_mcps_parsed` | `settings.json` with 2 `mcpServers` | `mcps.len() == 2` |
| `test_claude_mcp_has_secrets` | MCP server with non-empty `env` | `has_secrets=true` |
| `test_claude_mcp_secrets_not_exposed` | MCP env with `{"TOKEN": "abc123"}` | `secret_key_names == ["TOKEN"]`, value `"abc123"` not in `McpServer` |
| `test_claude_malformed_json` | `settings.json` is invalid JSON | `error` field set, no panic |

#### Generic detector contract (applies to all detectors)
| Test | Expectation |
|---|---|
| Not installed path | Returns `AiTool { installed: false, skills: [], mcps: [] }`, never panics |
| Unreadable file | Returns `AiTool { error: Some(...) }`, never panics |
| Empty skills dir | `skills` is `[]`, not error |
| Empty mcpServers object | `mcps` is `[]`, not error |

#### Model unit tests (`models.rs`)
| Test | Expectation |
|---|---|
| `AiTool` serializes to JSON correctly | All fields present with correct types |
| `McpServer` with no secrets | `hasSecrets=false`, `secretKeyNames=[]` |

### 13.2 Integration Tests (Rust)

Location: `src-tauri/tests/`  
Run: `cargo test --test '*'`  
These run against the real filesystem on the dev machine.

| Test | Expectation |
|---|---|
| `test_detect_all_returns_results` | `detect_all()` returns ≥1 tool |
| `test_claude_detected_on_dev_machine` | Claude tool has `installed=true` (known to be installed) |
| `test_claude_has_skills` | Claude skills list is non-empty |
| `test_no_panics_detect_all` | `detect_all()` completes without panic on any real config |
| `test_secret_values_not_present` | No MCP's `McpServer` contains actual secret token values |

### 13.3 Frontend Unit Tests

Framework: **Vitest** + **React Testing Library**  
Location: `src/components/__tests__/`  
Run: `npm test`

| Component | Test | Expectation |
|---|---|---|
| `ToolRow` | renders installed tool | Green dot visible, name + version shown |
| `ToolRow` | renders not-installed tool | Gray dot, muted text, no expand arrow |
| `ToolRow` | expand toggle click | `ToolDetails` mounts |
| `ToolRow` | collapse toggle click | `ToolDetails` unmounts |
| `SkillRow` | renders skill name | Name text present |
| `SkillRow` | renders active badge | Badge with "active" text |
| `SkillRow` | hover shows tooltip | Tooltip element visible with description |
| `SkillRow` | tooltip shows path when no description | Path string present in tooltip |
| `McpRow` | renders name + command | Both present |
| `McpRow` | hasSecrets shows key icon | Key icon element present |
| `McpRow` | hover shows tooltip with key names | Secret key names visible |
| `McpRow` | hover tooltip hides actual secret values | No match for known token pattern |
| `StatusDot` | green for installed | `bg-green-500` class |
| `StatusDot` | gray for not-installed | `bg-zinc-600` class |
| `StatusDot` | red for error | `bg-red-500` class |
| `Footer` | shows last updated time | Text matches timestamp pattern |
| `Footer` | refresh button click | `get_tools` invoke called once |

### 13.4 E2E Tests

Framework: **WebdriverIO** + `tauri-driver`  
Location: `e2e/`  
Run: `npm run test:e2e`  
Requires: `npm run tauri build` first, or `tauri dev` running.

| Test | Steps | Expected |
|---|---|---|
| `app_launches_no_crash` | Start app | Process running, no stderr crash |
| `tray_icon_visible` | Start app | System tray has icon |
| `popover_opens_on_click` | Click tray icon | Popover window appears at TrayCenter |
| `popover_closes_on_escape` | Open popover, press Escape | Window not visible |
| `popover_closes_on_blur` | Open popover, click elsewhere | Window not visible |
| `tool_list_populated` | Open popover | ≥1 ToolRow rendered |
| `claude_detected` | Open popover | Row with text "Claude Code" present |
| `expand_tool_shows_details` | Open popover, click Claude expand | SkillSection or McpSection visible |
| `skill_tooltip_on_hover` | Expand Claude, hover a skill name | Tooltip element with non-empty text |
| `mcp_tooltip_on_hover` | Expand Claude, hover a MCP name | Tooltip shows command string |
| `secrets_not_in_tooltip` | Hover MCP with known secrets | Token value string not in DOM |
| `refresh_updates_timestamp` | Open popover, click refresh | Footer timestamp updates |
| `cmd_w_does_not_crash` | Open popover, press Cmd+W | App still running, no crash |
| `multiple_opens_no_duplicate_windows` | Click tray 5x rapidly | Exactly 1 window visible |

---

## 14. Acceptance Criteria (per feature)

### Feature: Tool Detection
- **GIVEN** any macOS machine with Claude Code installed  
- **WHEN** `get_tools()` is called  
- **THEN** result contains tool with `id="claude"`, `installed=true`

- **GIVEN** a tool is not installed  
- **WHEN** `get_tools()` is called  
- **THEN** result contains that tool with `installed=false`, `skills=[]`, `mcps=[]`, no error

### Feature: Skill Display with Hover Description
- **GIVEN** Claude has skills installed  
- **WHEN** user expands Claude row  
- **THEN** each skill name is visible with active badge

- **GIVEN** a skill has a `SKILL.md` with `description:` frontmatter  
- **WHEN** user hovers the skill row  
- **THEN** tooltip shows the description text and path

- **GIVEN** a skill has no `SKILL.md`  
- **WHEN** user hovers the skill row  
- **THEN** tooltip shows path only, no crash

### Feature: MCP Display with Hover + Secrets
- **GIVEN** Claude has MCP servers configured  
- **WHEN** user expands Claude row  
- **THEN** each MCP name + active badge is visible

- **GIVEN** an MCP server has env secrets  
- **WHEN** user hovers the MCP row  
- **THEN** tooltip shows `command + args` and env key names; actual token values are absent from DOM

- **GIVEN** an MCP server has no env secrets  
- **WHEN** the MCP row renders  
- **THEN** key icon is not visible

### Feature: Popover Window Behavior
- **GIVEN** app is running  
- **WHEN** user clicks tray icon  
- **THEN** popover appears directly below tray icon within 100ms

- **GIVEN** popover is open  
- **WHEN** user clicks anywhere outside the popover  
- **THEN** popover hides

- **GIVEN** popover is open  
- **WHEN** user presses Escape  
- **THEN** popover hides

- **GIVEN** popover is open  
- **WHEN** user presses Cmd+W  
- **THEN** popover hides, app does not crash or quit

### Feature: Config Parse Errors
- **GIVEN** a tool's config JSON is malformed  
- **WHEN** that tool's detector runs  
- **THEN** AiTool has `error` set, `installed=true`, empty skills/mcps; app does not crash

### Feature: No Secrets Leaked
- **GIVEN** any MCP server with an `env` block  
- **WHEN** rendered in UI or serialized via IPC  
- **THEN** no actual secret values are present anywhere in the DOM or IPC payload

---

## 15. Roadmap

| Version | Features |
|---|---|
| **v0.1** | Detect tools, read skills + MCPs, hover descriptions, read-only display |
| **v0.2** | Toggle MCP active/inactive (write config), launch at login, global hotkey, window vibrancy, settings panel |
| **v0.3** | File watcher (FSEvents, auto-refresh), search/filter, collapsed-state memory |
| **v0.4** | Add/remove MCP servers from UI |
| **v0.5** | Notifications ("new skill installed", "MCP server added") |
| **v1.0** | Notarized DMG release, auto-update (Tauri updater plugin) |
