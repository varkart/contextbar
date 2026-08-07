---
target: Sessions
total_score: 30
p0_count: 0
p1_count: 1
timestamp: 2026-07-31T05-52-04Z
slug: src-components-history-sessionlist-tsx
---
## Design Health Score
**Total: 30/40 — Good.** Lowest: Consistency & Standards (static border-l stripe contradicts the Do/Don't list and the correct hover-only precedent in SkillRow/McpRow); Visibility of System Status (pin-toggle invisible to keyboard focus).

## Anti-Patterns Verdict
**LLM**: one real offender — a static, non-hover colored `border-l-2` stripe on selected/live rows, the exact pattern already stripped from MyWorkSection in the prior pass, recurring here unfixed. Everything else (skeleton rows, time grouping, tag/pin chips) is disciplined.
**Deterministic scan**: 0 findings on this file (detector's pattern set doesn't catch this specific case; LLM review is the primary signal here).

## Overall Impression
Strong bones — time-bucketed grouping (Live/Today/This Week/Earlier) with pinned-float-above is a genuinely useful glance-first pattern. The one recurring anti-pattern (border stripe) is a copy-paste of a mistake already fixed elsewhere in the app.

## What's Working
- Time-bucketed grouping with pin-float is a strong glance-first pattern.
- Noise-hiding footer for bare-slash-command sessions is a thoughtful density control.

## Priority Issues
- **[P1] Static colored border-l stripe on selected/live rows** — SessionList.tsx:119-123,137, `border-l-2` filled at rest (not hover), for both selected (`--c-accent`) and live (emerald) states. Violates the Don't list; SkillRow.tsx:14 shows the correct hover-only version. Fix: drop the border classes, keep only background wash (`bg-[var(--c-accent)]/8` selected, `bg-emerald-500/5` live) plus the existing pulse dot. → `$impeccable layout`
- **[P2] Pin toggle invisible to keyboard focus** — SessionList.tsx:253, `opacity-0 group-hover:opacity-60`, no `focus-visible:opacity-*`. A tabIndex={0} control a keyboard user can reach but not see. Fix: add `focus-visible:opacity-100`. → `$impeccable audit`
- **[P3] AgentBadge introduces 5 colors** beyond indigo/violet (AgentBadge.tsx:1-8) — app-wide identity convention, most visible here; worth an explicit DESIGN.md carve-out rather than a per-page fix. → `$impeccable document`
