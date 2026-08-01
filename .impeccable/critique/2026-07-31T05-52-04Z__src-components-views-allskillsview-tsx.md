---
target: Skills
total_score: 29
p0_count: 0
p1_count: 0
timestamp: 2026-07-31T05-52-04Z
slug: src-components-views-allskillsview-tsx
---
## Design Health Score
**Total: 29/40 — Good.** Lowest: Consistency & Standards (filled/shadowed CTA button, both explicitly disallowed); Visibility of System Status (skill descriptions exist only inside a title tooltip).

## Anti-Patterns Verdict
**LLM**: solid list-table structure (reused SearchInput, AgentChips, real column headers) undercut by one filled/shadowed CTA and a hover-only description that carries real information nowhere else.
**Deterministic scan**: 0 findings.

## Overall Impression
The table-style header row with per-agent dots is exactly the "state over decoration" principle in action. The Add button and the hidden description are the two things holding this back from Excellent.

## What's Working
- Table-style header (Name / Agents / Active) with AgentDot per-installer icons — clean, scannable multi-agent comparison.

## Priority Issues
- **[P2] Filled solid CTA with resting shadow** — AllSkillsView.tsx:76-88, `bg-indigo-500 text-white … shadow-sm` on "Add skill." Violates both the Buttons spec (no filled/solid CTA) and Flat-By-Default. Fix: `border border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10`, drop the fill and shadow. → `$impeccable quieter`
- **[P2] Description reachable only via title hover** — AllSkillsView.tsx:113, the row's only access to the skill description is a native tooltip. Fix: add a truncated secondary line, `text-[10.5px] text-[var(--c-text-3)] truncate`, first ~60 chars, visible at rest. → `$impeccable clarify`
- **[P3] Partial-active rendered identically to fully-active** — AllSkillsView.tsx:124-126, emerald "x/y on" regardless of ratio. Fix: `text-amber-400` when `0 < activeCount < variants.length`, emerald only at full. → `$impeccable audit`
