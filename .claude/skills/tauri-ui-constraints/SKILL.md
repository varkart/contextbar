---
name: tauri-ui-constraints
description: Hard rules for UI/UX work in this Tauri 2.0 macOS menu bar app. Fixed 380×520px window, no native scroll, constrained overlay positioning. Apply whenever touching components, tooltips, dropdowns, or any floating element.
---

# Tauri Menu Bar UI Constraints

Fixed window: **380px wide × 520px tall**. No resize, no scroll outside the managed scroll containers. Every pixel counts.

---

## Overlay positioning — the cardinal rule

**Never position floating elements with pure CSS centering.** `left: 50%; transform: translateX(-50%)` overflows when the anchor is near an edge.

Always compute with JS:

```tsx
const handleEnter = () => {
  if (ref.current) {
    const rect = ref.current.getBoundingClientRect()
    const TOOLTIP_W = 140
    const PAD = 8
    const left = Math.max(PAD, Math.min(rect.left + rect.width / 2 - TOOLTIP_W / 2, window.innerWidth - TOOLTIP_W - PAD))
    setStyle({ position: 'fixed', top: rect.top - 26, left })
  }
  setVisible(true)
}
```

Rules:
- Use `position: fixed`, never `absolute`, for anything that floats over list content.
- Clamp both axes: horizontal (left/right edges) and vertical (top of window when anchor is in first rows).
- Use `role="tooltip"` on the tooltip element so tests can assert presence.
- `pointer-events: none` on the tooltip — it must never intercept clicks.
- `whitespace-nowrap` + a known max-width for the clamping math to be correct. If width is unknown, measure the rendered element with a second ref before positioning.

---

## Small-dot (ToolDot) pattern

Colored letter badges showing provider identity on list rows. Canonical implementation: `src/components/ToolDot.tsx`.

- Size: `w-3.5 h-3.5` (14px). Never larger on a list row.
- Always pass `toolName` and show it as a clamped fixed tooltip on hover.
- Colors from `TOOL_COLORS` map in `src/constants/toolColors.ts`. Add new providers there, nowhere else.
- Layout in rows: `flex-row gap-1` at the **bottom** of the row content, not a left column. Vertical columns of dots push content right and look like a bullet list.

---

## Component extraction triggers

Extract to a shared component immediately when:
- The same JSX block appears verbatim (or near-verbatim) in **2+ files**.
- A local helper component (like `ToolDot`) is copy-pasted into a second file.
- State logic (`useState` + derived values + a toggle fn) is duplicated across components.

Shared locations:
| What | Where |
|---|---|
| Stateless UI atoms | `src/components/` |
| State logic hooks | `src/hooks/` |
| Provider filter pattern | `src/hooks/useProviderFilter.ts` (already exists) |
| Tool dot badge | `src/components/ToolDot.tsx` (already exists) |
| Provider chip row | `src/components/ProviderChips.tsx` (already exists) |

---

## Cross-tool list views (AllSkillsView / AllMcpsView)

Pattern for any grouped cross-tool view:
1. `buildGroups(tools)` — group items by name across all installed tools, attach `toolId` + `toolName` to each variant.
2. `useProviderFilter(tools)` — multi-select provider filter state.
3. `<ProviderChips>` — only renders when `installedTools.length > 1`.
4. `<ToolDot>` with `toolName` prop — renders in `flex-row gap-1` at bottom of each row.
5. Count label: when filtered → `"N of M items"`, otherwise → `"M items · K installs"`.

---

## Search filter visibility

Search inputs in `SkillsListPanel` and `McpsListPanel` are **always visible** — no threshold gating. Never add `{items.length > N && <input>}` guards.

---

## Scroll and overflow

- Main list areas: `flex-1 overflow-y-auto` inside a `flex flex-col h-full` parent.
- Never put `overflow: hidden` on a parent of a dropdown/tooltip — use `position: fixed` to escape.
- The app window does not scroll as a whole. Each panel manages its own scroll container.

---

## Test requirements

Every new shared component or hook needs a co-located test:
- `src/components/__tests__/<ComponentName>.test.tsx`
- `src/__tests__/<hookName>.test.ts`

Tooltip-bearing components: test that tooltip is absent by default, present on `mouseEnter`, absent again on `mouseLeave`.
