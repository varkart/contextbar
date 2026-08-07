---
target: Settings
total_score: 32
p0_count: 0
p1_count: 0
timestamp: 2026-07-31T05-52-04Z
slug: src-components-settings-tsx
---
## Design Health Score
**Total: 32/40 — Good.** Lowest: Consistency & Standards — one filled CTA breaks the app's own no-solid-button rule; theme-picker selection uses `border-2` where Worktrees' filter tiles use `ring-1` for the same "selected" signal.

## Anti-Patterns Verdict
**LLM**: the calmest and most restrained of the six pages — mostly bordered toggles/pill-pickers, no decorative color, no border stripes. One filled solid CTA is the deviation, consistent with the same pattern in Skills/MCPs.
**Deterministic scan**: 0 findings.

## Overall Impression
Closest to fully on-system of the six. The accessibility-not-granted row is exemplary Signal Rule usage. The filled CTA and the selection-style inconsistency are small, mechanical fixes.

## What's Working
- Accessibility-not-granted row (Settings.tsx:284-296): amber only appears when there's a real, actionable problem, with a direct fix-it action attached.

## Priority Issues
- **[P2] Filled solid CTA button** — Settings.tsx:374-389, "Install {version}" is `bg-indigo-500 text-white`. Same family of issue as Skills/MCPs Add buttons — likely worth fixing as one systemic pattern rather than per-page. Fix: `border border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10`, matching the adjacent Terminal picker buttons in the same file. → `$impeccable quieter`
- **[P3] Selection border weight inconsistent app-wide** — ThemeSelector (Settings.tsx:108) uses `border-2` for selected; WorktreesSection's filter tiles use `ring-1 ring-[var(--c-accent)]` for the same signal. Fix: `border border-[var(--c-border)]` at rest, `ring-1 ring-indigo-500 bg-indigo-500/10 text-indigo-500` when selected. → `$impeccable polish`
