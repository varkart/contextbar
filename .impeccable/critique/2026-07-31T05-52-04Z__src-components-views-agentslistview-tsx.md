---
target: Agents
total_score: 34
p0_count: 0
p1_count: 0
timestamp: 2026-07-31T05-52-04Z
slug: src-components-views-agentslistview-tsx
---
## Design Health Score
**Total: 34/40 — Good.** Lowest: Consistency & Standards — the page hand-rolls its own search input instead of reusing the shared SearchInput component every other list view uses.

## Anti-Patterns Verdict
**LLM**: close to clean, the strongest of the six pages. Note this view is shared with the tray popover, so any fix here has wider blast radius.
**Deterministic scan**: 0 findings.

## Overall Impression
Near-model page. AgentRow is close to a reference component — status dot first, no decorative color, chevron only when navigable. The one gap is a bespoke search field that diverges from the app's established pattern.

## What's Working
- AgentRow.tsx: status dot first, no decorative color, chevron only when navigable, disabled (not hidden) when not installed.
- Skeleton loading rows mirror the real row's shape/spacing for good perceived continuity.

## Priority Issues
- **[P2] Bespoke search input with off-palette focus color** — AgentsListView.tsx:41-56 reimplements the search field locally instead of using `../SearchInput`, with `focus:border-[var(--c-text-2)]` (neutral) instead of the accent-based focus every other search field uses (`SearchInput.tsx:9`, indigo-500/50). Fix: replace with `<SearchInput value={query} onChange={setQuery} placeholder="Search agents, skills, MCPs…" accentColor="indigo" />`, matching AllSkillsView/AllMcpsView. → `$impeccable layout`

No other significant issues found on this page.
