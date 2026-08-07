---
target: MyWorkSection
total_score: 30
p0_count: 0
p1_count: 1
timestamp: 2026-07-31T05-37-09Z
slug: src-expanded-myworksection-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Live badge, status dots, spin→checkmark RefreshButton |
| 2 | Match System / Real World | 3 | Plain phrasing throughout |
| 3 | User Control and Freedom | 3 | Dismissible banner, tab switching, no traps |
| 4 | Consistency and Standards | 3 | Matches DESIGN.md now; text-3 still carries real content in places |
| 5 | Error Prevention | 3 | try/catch + clipboard fallback, toast on failed actions |
| 6 | Recognition Rather Than Recall | 2 | Momentum day-activity detail still only in `title` tooltip |
| 7 | Flexibility and Efficiency | 3 | Tabs, one-click resume |
| 8 | Aesthetic and Minimalist Design | 4 | Flat, restrained, no gradient/shadow noise |
| 9 | Error Recovery | 3 | showToast surfaces actionable errors |
| 10 | Help and Documentation | 2 | Momentum explanation exists but hover-gated, no visible fallback |
| **Total** | | **30/40** | **Good** (up from 24/40) |

## Anti-Patterns Verdict

**LLM read**: not slop anymore — reads as a deliberate second-pass edit. Status carried by dot/border-color, flat surfaces, single accent. A few vestigial hover-only affordances remain, nothing else smells unreviewed.

**Deterministic scan**: `detect.mjs` on this file now returns 0 findings, exit 0. Both prior warnings (`side-tab` border-l-2 at 458, `ai-color-palette` gradient at 286) confirmed gone. No new findings.

**Browser evidence**: fresh-tab screenshot of the before/after comparison rendered clean across all 5 sections, 0 layout overflows. Measured the actual label color change: before rgb(161,161,170) → after rgb(113,113,122) on the same background — confirms the contrast fix is real, not cosmetic.

## Fix Verification

| # | Issue | Status | Evidence |
|---|---|---|---|
| 1 | Gradient/emoji peak banner | Resolved | Line 286 — flat surface card, single indigo accent, no gradient/emoji (grep clean) |
| 2 | Secondary text failing WCAG AA | Partial | Stat labels fixed (line 562, ~4.83:1, passes). But a.meta, branch/relativeTime, agent-mix stats, momentum meta, empty-state copy still use `--c-text-3` (~2.3–2.6:1) |
| 3 | border-l-2 stripe on attention cards | Resolved | Lines 453-462 — StatusDot replaces stripe, no `border-l` anywhere in file |
| 4 | Risk/momentum text hover-only | Partial | Attention `why` now always visible (line 469). Momentum's per-day detail still hover-only via `title` (line 515) |
| 5 | Resting shadow + eyebrow overuse | Resolved | No `shadow` class left on live cards; BentoCard eyebrows demoted with a self-documenting comment |

3 of 5 fully resolved, 2 partially — same root cause (`--c-text-3` / hover-only pattern) recurring in scope the original fix didn't fully cover.

## What's Working
- Attention-card redesign: status dot leads, explanation always visible — clean on-system replacement.
- Peak banner and project cards now read instrument-panel neutral.
- Eyebrow fix shipped with a comment explaining the design decision, not just a class swap.

## Priority Issues

- **[P1] Contrast fix didn't cover the whole file**: `--c-text-3` still carries real content (branch names, timestamps, empty-state guidance, meta lines) at ~2.3–2.6:1, still under AA. Lines: 329, 358-359, 403, 408, 468, 493-494, 529, 536.
  - **Why it matters**: PRODUCT.md states WCAG AA as a non-negotiable baseline; this is the same failure class as before, just narrower scope.
  - **Fix**: promote these to `--c-text-2` the same way the Stat labels were.
  - **Suggested command**: `$impeccable audit`
- **[P2] Momentum explanation still hover-only**: per-day activity/streak rationale sits only in `title` (line 515), unreachable by keyboard focus.
  - **Why it matters**: same class of problem flagged before, now narrower — momentum context effectively unavailable without a mouse.
  - **Fix**: render active-day labels inline under the cell row.
  - **Suggested command**: `$impeccable clarify`
- **[P3] text-2/text-3 tier inconsistency**: used somewhat arbitrarily across similarly-weighted content now that some got promoted and some didn't.
  - **Why it matters**: subtle inconsistency, minor visual noise, low urgency.
  - **Fix**: define an explicit color-per-tier rule in DESIGN.md or normalize case by case.
  - **Suggested command**: `$impeccable polish`

## Persona Red Flags

**Jordan/Sam (accessibility)**: still can't reliably read branch names, idle-day counts, empty-state guidance at AA — same class of gap, smaller surface. Momentum `title` tooltips aren't keyboard-reachable at all.
**Alex (power user)**: momentum hover-friction is the one spot left where the "seconds, then dismiss" rhythm breaks.

## Minor Observations
- `dismissPeakBanner` uses a per-day localStorage key — banner reappears daily with no permanent-disable option, likely intentional.
- Glyph icons (✕ ⌥ ● ▶ ⌖) are consistent dingbat-style, not emoji — matches the "no emoji" fix in spirit.

## Questions to Consider
- Should `--c-text-3` be excluded from real content entirely by design-system rule, given PRODUCT.md's AA baseline isn't optional?
- Is `title`-only ever acceptable for explanatory microcopy in a keyboard-first product, or does every one need a visible fallback?
