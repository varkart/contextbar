---
target: Repos
total_score: 30
p0_count: 0
p1_count: 2
timestamp: 2026-07-31T16-14-04Z
slug: src-expanded-worktreessection-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Solid |
| 2 | Match System / Real World | 3 | — |
| 3 | User Control and Freedom | 4 | — |
| 4 | Consistency and Standards | 3 | — |
| 5 | Error Prevention | 3 | — |
| 6 | Recognition Rather Than Recall | 3 | Icon-only actions, tooltip-only meaning |
| 7 | Flexibility and Efficiency | 4 | — |
| 8 | Aesthetic and Minimalist Design | 2 | 12+ distinct font sizes in one file |
| 9 | Error Recovery | 2 | Silent-fail rename/notes writes |
| 10 | Help and Documentation | 2 | — |
| **Total** | | **30/40** | **Good** (up from 22/40) |

## Anti-Patterns Verdict

Not slop — a real, deliberately-engineered dense data view (state derived from actual commit timestamps/merge status, no fake data). Deterministic scan: 0 findings, exit 0 — prior `side-tab` warning gone, nothing new. Token check: --c-accent/--c-surface-2 confirmed defined in both :root/.dark, used correctly throughout.

## Fix Verification

| # | Issue | Status | Evidence |
|---|---|---|---|
| 1 | Hashed REPO_COLORS/repoColor() avatar palette | Resolved | Symbol gone entirely; badge now neutral |
| 2 | border-l-2 teal-accented note stripe | Resolved | No border-l-* anywhere in file |
| 3 | Resting glow shadow on active cards | Resolved | No shadow-[...] anywhere in file |

All 3 clean, corroborated independently by source review and grep.

## What's Working
- Real status model (worktreeStatus(), isSafeToDelete()) — no decoration standing in for state.
- Deep-link auto-expand + scroll-into-view is a genuinely strong power feature.
- Tokens now resolve correctly and are used pervasively right.

## Priority Issues

- **[P1] Silent failure on rename/notes save**: invoke('set_repo_notes'/'set_repo_name', …).catch(() => {}) (lines 70, 210) swallow errors with zero feedback, while adjacent VS Code/Finder calls correctly showToast('error', …) on failure.
  - Why it matters: a failed rename looks identical to success — trust-eroding for daily users.
  - Fix: route through showToast like the other IPC calls.
  - Suggested command: $impeccable harden
- **[P1] Repo header control density**: six interactive targets in one row (rename, Sessions, Insights, VS Code, expand, plus the name itself), lines 383-467.
  - Why it matters: violates PRODUCT.md's own anti-reference against enterprise-panel sprawl.
  - Fix: move rename + VS Code into an overflow menu, keep expand/Insights/Sessions primary.
  - Suggested command: $impeccable distill
- **[P2] Fragmented type scale**: 12+ distinct px sizes (8, 8.5, 9, 9.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 16), confirmed by both reviewers independently. Not part of the earlier typography pass on My Work/Sessions.
  - Fix: consolidate to DESIGN.md's tier system, same pattern already applied elsewhere.
  - Suggested command: $impeccable typeset
- **[P2] Emoji inconsistency**: 📝 Add repo note (line 113) is the only colorful glyph among an otherwise monochrome icon set.
  - Suggested command: $impeccable clarify
- **[P3] Hardcoded indigo instead of token**: NotesEditor's repo-variant chip uses bg-indigo-500/15 text-indigo-400 directly (line 61) instead of --c-accent.
  - Suggested command: $impeccable polish

## Persona Red Flags
**Sam (accessibility)**: path text stacks tertiary color + 70% opacity (lines 421, 531) — likely under AA at 11px. VS Code button has title but no aria-label.
**Alex (power user)**: silent rename/notes failures are exactly the kind of trust-eroding bug a daily user eventually hits.
**Jordan (first-timer)**: glyph-only actions require hover-to-discover before the icon vocabulary is learned.

## Minor Observations
- Opacity suffixes on --c-surface-2 are inconsistent across the file (/25, /40, /60, plain) with no evident rule.
- animate-pulse on the active-status dot is covered by the global prefers-reduced-motion rule — fine, but worth confirming intentional.

## Questions to Consider
- Should optimistic UI ever ship without a rollback/toast path for a failed write?
- Does the repo header need six buttons always visible, or only once expanded?
