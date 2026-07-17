# Context Bar Prototype — Feature Table & Extended View Design

## ✅ All Features Included (Quick Summary)

| Feature | Where in Prototype |
|---|---|
| Session list + instant search | Sessions tab — search bar + live filter |
| Live indicator | Pulsing green dot + "● Live" badge |
| Quick resume | Resume button → copies command, flashes green |
| Token badges | Per-session colored badge (450k, 890k) |
| Cross-project search | Search box searches all sessions |
| Filter by project | Pills: juno, contextbar, shadowdev |
| Filter by tool used | Pills: "$ Bash", "✎ Write" |
| Filter by model | Pills: opus-4, sonnet-4 |
| Error session highlighting | Red "2 errors" badge on sessions with failures |
| Session bookmarks | ⭐ Star icon (click to toggle) + "Starred" filter |
| Token breakdown chart | Tokens tab → colored bar + legend (input/output/cache) |
| Cost estimation | Tokens tab → "~$0.18" with cache savings |
| Tool breakdown | Tools tab → bar chart per tool type |
| Files touched | Tools tab → file list with read/write counts |
| Thinking block toggle | Chat → collapsible 💭 Thinking blocks |
| Sub-agent tree | Agents tab → hierarchy with indented sub-agents |
| Daily activity summary | Agents page → "4 projects touched, 12 files modified" |
| MCP tools list | Click MCP → detail page lists all tools |
| MCP status/filters | Pills: Connected, Needs Auth, Failed, Enterprise, Connectors |
| Skill detail/content | Click skill → full description + file path |
| Skill enable/disable | Detail page → "Disable Skill" button |
| Multi-agent support | Agents page → Claude, Gemini, Cursor, Kiro |

---

## Full Feature Table (Detailed)

| # | Feature | Location | Description |
|---|---|---|---|
| | **AGENTS TAB** | | |
| 1 | Multi-agent overview | Agents → main list | Shows all installed AI tools (Claude Code, Gemini CLI, Cursor, Kiro) with session count, total tokens, and project count per agent |
| 2 | Live status indicator | Agents → green pulsing dot | Animated breathing dot shows which agent has an active session right now |
| 3 | Today's summary | Agents → bottom card | "4 projects touched · 12 files modified · 847 tool calls" — quick daily digest without drilling down |
| 4 | Aggregate stats banner | Agents → top row | Sessions today, tokens today, active projects — at a glance numbers |
| | **SESSIONS TAB** | | |
| 5 | Full-text search | Sessions → search bar | Type to instantly filter sessions by title, project, tools, keywords — matches against all metadata |
| 6 | Project filter pills | Sessions → filter row | One-tap filter by project (juno, contextbar, shadowdev, onboarding) |
| 7 | Model filter | Sessions → filter pills | Filter by opus-4 or sonnet-4 to see which model was used |
| 8 | Tool-used filter | Sessions → "$ Bash", "✎ Write" pills | Show only sessions where specific tools were invoked (e.g., all sessions that used Bash) |
| 9 | Error filter | Sessions → "🔴 Errors" pill | Show only sessions that had tool errors or failed commands |
| 10 | Bookmarks/Stars | Sessions → ⭐ icon per session | Click star to pin important sessions; filter by "⭐ Starred" pill to see only pinned |
| 11 | Error badges | Sessions → red "2 errors" badge | Sessions with tool failures get a red badge showing error count |
| 12 | Token badges | Sessions → green badge per session | Per-session total token count (450k, 890k, etc.) — color-coded for quick scanning |
| 13 | Live badge | Sessions → "● Live" blue badge | Pulsing indicator on the session currently being written to |
| 14 | Time grouping | Sessions → group headers | Sessions organized by Live / Today / This Week for temporal context |
| 15 | Branch display | Sessions → subtitle | Shows git branch (⌥main, ⌥feature/cdc) in session metadata line |
| 16 | Model + time in subtitle | Sessions → subtitle line | Each session shows: project · time ago · model · branch |
| | **SESSION DETAIL** | | |
| 17 | Session stats bar | Detail → 4-column grid | Tokens, Messages, Tools, Duration — key metrics at the top |
| 18 | Resume button | Detail → action bar | Copies `cd <project> && claude --resume <id>` to clipboard with green "✓ Copied!" animation |
| 19 | Copy button | Detail → action bar | Copy full conversation text to clipboard |
| 20 | Export button | Detail → action bar | Export session as markdown file |
| 21 | Tags (project, branch, model, duration) | Detail → colored tag row | Visual pills showing project, git branch, model, and duration |
| 22 | Section tabs (Chat/Tokens/Tools/Agents) | Detail → tab bar | Switch between conversation view, token breakdown, tool stats, and sub-agent tree |
| 23 | Chat conversation view | Detail → Chat tab | iMessage-style bubbles — user in blue (right), Claude in gray (left) |
| 24 | Tool call chips | Detail → Chat tab → in bubbles | Compact pills (📄 Read, $ Bash, 🔍 Grep) showing which tools were called in each response |
| 25 | Collapsible thinking blocks | Detail → Chat tab → 💭 | Click to expand Claude's extended thinking/reasoning — collapsed by default |
| 26 | Token breakdown chart | Detail → Tokens tab | Colored stacked bar (input/output/cache read/cache write) with legend and exact counts |
| 27 | Cost estimation | Detail → Tokens tab | "~$0.18" estimated cost with cache savings noted |
| 28 | Per-message token stats | Detail → Tokens tab | Average tokens per turn, cache hit rate |
| 29 | Tool breakdown bars | Detail → Tools tab | Horizontal bar chart showing Read (18), Bash (14), Grep (9), Write (6) with proportional bars |
| 30 | Files touched list | Detail → Tools tab | Files modified/read with counts (e.g., "mcp.rs — Read 5x · Write 2x") |
| 31 | Sub-agent hierarchy | Detail → Agents tab | Tree view showing main session → spawned sub-agents with indentation, message counts, and token usage per agent |
| | **INSIGHTS TAB** | | |
| 32 | Date range picker | Insights → top pills | Switch between 7 Days / 30 Days / 90 Days / All Time — all metrics update accordingly |
| 33 | Summary metrics grid | Insights → 2×2 cards | Total sessions, total tokens, estimated cost, total time for selected period |
| 34 | Daily activity chart | Insights → bar chart | Token usage per day of the week — today highlighted in green |
| 35 | Most active projects ranking | Insights → ranked list | Projects sorted by activity with colored indicator bars, percentage share, sessions/tokens/hours |
| 36 | Token breakdown (global) | Insights → stacked bar + legend | Input vs Output vs Cache Read vs Cache Write across all projects for the period |
| 37 | Tool usage across all projects | Insights → horizontal bars | Read (342), Bash (246), Write (189), Grep (130), Task (62) — total tool call counts with proportional bars |
| 38 | Model usage distribution | Insights → list | sonnet-4 vs opus-4: session count, token count, estimated cost, percentage share |
| 39 | Peak activity hours | Insights → 24-hour histogram | Bar chart by hour showing when you code most — highlights peak window (10 AM – 4 PM) |
| 40 | Cache efficiency metric | Insights → card | Cache hit rate (72%), estimated dollar savings vs no caching |
| 41 | Session averages | Insights → card | Average session: tokens + duration, longest and shortest sessions noted |
| | **MCPs TAB** | | |
| 42 | MCP search | MCPs → search bar | Type to filter MCPs by name (searches "slack", "datadog", etc.) |
| 43 | Status filter pills | MCPs → filter row | Filter by Connected, Needs Auth, Failed, Enterprise, Connectors |
| 44 | Status dots | MCPs → per-server dot | Green (connected), orange (needs auth), red (failed), gray (disabled) |
| 45 | Toggle switches | MCPs → per-server | Enable/disable MCP servers with iOS-style toggle — writes back to config |
| 46 | Source labels | MCPs → subtitle | Shows "Enterprise" or "Connector" to identify where each MCP comes from |
| 47 | Error details | MCPs → subtitle | Shows specific failure reason ("Missing BILL_STARBURST_TOKEN") |
| 48 | MCP detail drill-down | MCPs → tap server → detail page | Shows command, source file path, and full list of tools exposed by the server |
| 49 | MCP tool list | MCP Detail → tools section | Lists every tool the MCP exposes (e.g., `bcli_check_auth`, `bcli_create_teamspace`, ...) |
| | **SKILLS TAB** | | |
| 50 | Skill search | Skills → search bar | Search by name or description keywords (type "kafka", "playwright", "debug") |
| 51 | Category filter pills | Skills → filter row | Filter by Active, Disabled, Elixir, Testing, Infra, Workflow |
| 52 | Skill detail drill-down | Skills → tap skill → detail page | Full description, trigger conditions, and file path of the SKILL.md |
| 53 | Enable/disable skill | Skill Detail → button | Toggle a skill on/off (moves folder to/from `.disabled` directory) |
| 54 | Category tags | Skill Detail → colored tags | Shows Active/Disabled status and category (Workflow, Elixir, Infra, Testing) |
| | **NAVIGATION & UX** | | |
| 55 | iOS-style drill-down | All pages | Tap to navigate deeper with slide animation — back button always returns |
| 56 | Dynamic back button | Nav bar → "< Back" | Shows parent page name ("< Sessions", "< MCPs") — context-aware |
| 57 | Tab bar | Bottom | 5 tabs: Agents, Sessions, Insights, MCPs, Skills — tap resets navigation stack |
| 58 | Page transitions | All navigation | CSS slide animations (push right on forward, slide back on back) |
| 59 | Empty states | Search results | "No sessions match" / "No MCPs match" when filters return nothing |
| 60 | Sticky search bars | Sessions, MCPs, Skills | Search bars stay pinned at top while scrolling through results |

---

## How Would We Switch From Menu Bar to Extended View?

Two natural ways to open the extended view from the menu bar popover:

### Option 1: Expand button in the popover header

The menu bar popover already has a header area. Add a small "expand" icon (⤢ or ⇱) in the top-right corner. Click it → opens the extended view as a separate Tauri window.

```
┌ 🐝 Context Bar        [⤢] ┐  ← click this
│ Tools  Skills  MCPs        │
│ ...                        │
└─────────────────────────────┘
```

### Option 2: Double-click the menu bar icon

Single click → opens the popover (existing behavior). Double-click → opens the full window.

### Option 3: Keyboard shortcut

The app already has a configurable global shortcut. Add a second shortcut (or modifier):

- `⌘+Shift+B` → opens extended view directly
- Or hold `⌥` while clicking the tray icon

### Recommended approach: Option 1 + 3 combined

```
┌ 🐝 Context Bar             [⤢] ┐  ← expand button
│                                  │
│ Claude Code (5 MCPs · 42 skills)│
│ ├ bcli         ✓ connected      │
│ ├ playwright   ✓ connected      │
│ └ skylab-mcp   ✓ connected      │
│                                  │
│ ── Recent Sessions ────────────  │  ← new section in popover
│ Fix MCP discovery...    ● Live   │
│ Add CDC consumer...      450k    │
│ Debug teamspace...       280k    │
│                    View All →    │  ← also opens extended view
└──────────────────────────────────┘
```

### Implementation in Tauri

```rust
// In lib.rs — new command to open extended window

async fn open_extended_view(app: tauri::AppHandle) -> Result<(), String> {
    let window = tauri::WebviewWindowBuilder::new(
        &app,
        "extended",
        tauri::WebviewUrl::App("extended.html".into()),
    )
    .title("Context Bar")
    .inner_size(440.0, 780.0)
    .min_inner_size(380.0, 600.0)
    .build()
    .map_err(|e| e.to_string())?;

    window.show().map_err(|e| e.to_string())?;
    Ok(())
}
```

```typescript
// In frontend — trigger from popover
import { invoke } from '@tauri-apps/api/core';

// Expand button click
const openExtended = () => invoke('open_extended_view');
```

The popover stays lightweight (tools/skills/MCPs at a glance), the extended window is the full experience (sessions, insights, detail views, search). Same Tauri app, two windows, shared backend state.
