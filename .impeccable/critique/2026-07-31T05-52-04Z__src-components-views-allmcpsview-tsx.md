---
target: MCPs
total_score: 28
p0_count: 0
p1_count: 0
timestamp: 2026-07-31T05-52-04Z
slug: src-components-views-allmcpsview-tsx
---
## Design Health Score
**Total: 28/40 — Good (borderline Acceptable).** Lowest: Consistency & Standards (filled/shadowed CTA) and Visibility of System Status — command/URL hidden behind hover, more operationally important than Skills' hidden description.

## Anti-Patterns Verdict
**LLM**: near-identical shape and problems to Skills — same filled/shadowed CTA pattern (violet here), same hover-only info-hiding, this time for connection command/URL rather than description.
**Deterministic scan**: 0 findings.

## Overall Impression
Same structure and same two issues as Skills, slightly higher stakes since the hidden info here (actual connection command/URL) is something users need to verify before toggling, not just descriptive color.

## What's Working
- Secrets lock icon (AllMcpsView.tsx:116-121) is the right pattern — visible glyph carries the state, title/aria-label only adds detail, not the sole channel.

## Priority Issues
- **[P2] Filled solid CTA with resting shadow** — AllMcpsView.tsx:73-85, `bg-violet-500 text-white … shadow-sm` on "Add MCP." Fix: `border border-violet-500/40 text-violet-400 hover:bg-violet-500/10`, same as Skills. → `$impeccable quieter`
- **[P2] Command/URL reachable only via title hover** — AllMcpsView.tsx:111, `title={group.primary.url ?? group.primary.command}` is the row's only exposure of what it connects to. Fix: add `font-mono text-[10.5px] text-[var(--c-text-3)] truncate` line under the name at rest — also satisfies the Literal-Value Rule (mono for commands), which the tooltip-only version currently fails. → `$impeccable clarify`
- **[P3] Partial-active shown as full emerald** — AllMcpsView.tsx:128-130, same issue and fix as Skills. → `$impeccable audit`
