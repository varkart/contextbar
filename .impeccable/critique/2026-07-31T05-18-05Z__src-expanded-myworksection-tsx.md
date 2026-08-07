---
target: MyWorkSection
total_score: 24
p0_count: 0
p1_count: 4
timestamp: 2026-07-31T05-18-05Z
slug: src-expanded-myworksection-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Solid — skeletons, live dot, refresh states |
| 2 | Match System / Real World | 2 | "Nice work today 🎯" breaks the "precise, calm, technical" register PRODUCT.md defines |
| 3 | User Control and Freedom | 3 | Banner dismiss persists but no way to bring it back |
| 4 | Consistency and Standards | 2 | Violates its own DESIGN.md in 3+ places (gradient, border-stripe, resting shadow) |
| 5 | Error Prevention | 3 | Good try/catch fallbacks on Resume/VSCode/Finder actions |
| 6 | Recognition Rather Than Recall | 2 | Risk copy hidden behind hover-only `title` tooltips (lines 457, 512) |
| 7 | Flexibility and Efficiency | 2 | No roving-focus/arrow-key grid nav despite PRODUCT.md's stated keyboard-first principle |
| 8 | Aesthetic and Minimalist Design | 2 | Banner + tabs + 4 stats + up to 9 project cards + 4 bento cards all visible at once |
| 9 | Error Recovery | 3 | Attention copy is factual, not alarmist — a genuine strength |
| 10 | Help and Documentation | 2 | No onboarding for the momentum grid; relies entirely on hover tooltips |
| **Total** | | **24/40** | **Acceptable** |

## Anti-Patterns Verdict

**LLM assessment**: Yes — this screen carries several textbook AI-slop tells, which is notable because it sits in a codebase with an unusually strict, well-written design system that explicitly bans exactly these patterns. The peak banner is a gradient hero-metric widget with an emoji, introducing fuchsia as an unauthorized third accent. The "needs attention" cards use a static colored left-border stripe. Live project cards carry a resting glow shadow at rest. A five-color hardcoded avatar palette sits entirely outside the token system.

**Deterministic scan**: `detect.mjs` against this one file found 2 warnings, and both independently corroborate the LLM's read line-for-line:
- `side-tab` (line 458, `border-l-2`) — the "needs attention" card border. Assessment B confirmed by reading the surrounding code that this is a **static default**, not hover-only (hover only changes background), so it's a real instance of the banned pattern, not a false positive.
- `ai-color-palette` (line 286, `from-indigo-400` gradient) — the peak-summary banner. Also confirmed statically rendered (whenever `peakSummary && !peakDismissed`), not conditional/hover.

**Browser evidence**: A static prototype hand-built from this exact source file was used as a visual proxy (the live component only renders inside a Tauri webview and isn't reachable via plain browser navigation). Screenshot and DOM inspection both succeeded this run. Two new, purely evidence-based findings came out of it:
- Section-label text (e.g. "NEEDS ATTENTION", stat-tile labels) measures **~2.56:1 contrast** against its background — below the WCAG AA 4.5:1 floor PRODUCT.md sets as a hard accessibility requirement, not a nice-to-have.
- No layout overflow detected anywhere on the screen — a clean result worth noting since it rules out a whole category of responsive bugs.

## Overall Impression

The bones are good — the stat tiles, project grouping, and especially the "needs attention" copy show real design care (the LLM reviewer singled out the risk copy as "genuinely well-calibrated ... not alarmist" and the empty-window state as unusually thoughtful). But this is also the one screen in the app that visibly drifts from the design system the rest of the app just got documented against: a gradient banner, a static border-stripe, and a resting shadow are three of DESIGN.md's named Don'ts, all present in one file, all confirmed by an independent deterministic scan. The biggest opportunity isn't a redesign — it's reconciling this screen with rules the rest of the app already follows.

## What's Working

- **Attention-card copy** (~line 213): states data-loss risk factually ("uncommitted changes") instead of alarmingly — the right tone for a high-stakes moment, and rare to get right.
- **`handleResume` failure path** (~lines 256-269): IPC → clipboard fallback → toast is a genuinely considered recovery chain, not a bare try/catch.
- **Empty-window state** (~lines 361-369): explicitly tells the user which widgets are window-independent instead of silently rendering nothing.

## Priority Issues

- **[P1] Gradient/emoji peak banner** — Lines 286-287. Directly contradicts DESIGN.md's anti-reference (no gradient hero-metric widgets, no marketing sheen) and the One Accent Rule (fuchsia is not an authorized accent). *Why it matters*: this is the first thing a user sees on the app's landing section — it sets the tone, and the tone it sets is "SaaS dashboard," the exact thing PRODUCT.md's anti-references reject. *Fix*: flat `--c-surface` card, drop the gradient and emoji, keep the copy factual like the attention card already does. **Suggested command**: `$impeccable quieter`

- **[P1] Secondary text fails WCAG AA contrast** — measured ~2.56:1 (section labels, stat-tile labels) against a 4.5:1 requirement PRODUCT.md states as non-negotiable, not aspirational. *Why it matters*: this isn't a style opinion, it's a stated accessibility requirement the app is currently failing, on real measured data. *Fix*: darken `--c-text-3` usage on these specific labels toward `--c-text-2`, or bump label weight/size so the AA large-text threshold (3:1) applies honestly. **Suggested command**: `$impeccable audit`

- **[P1] Static side-tab border stripe on attention cards** — line 458 (`border-l-2 border-l-rose-400` / `border-l-amber-400`). Named verbatim in DESIGN.md's Don'ts, confirmed by both reviewers as a static default, not an interactive affordance (unlike the legitimate hover-only pattern already used elsewhere in `SkillRow`/`McpRow`). *Why it matters*: inconsistency undermines the rule itself — if it's banned here and used there, the rule reads as arbitrary. *Fix*: replace with a leading `StatusDot` per the Rows spec, or a full border + tinted background. **Suggested command**: `$impeccable layout`

- **[P1] Risk explanation is hover-only** — lines 457 and 512, the actual "why this needs attention" text lives only in a native `title` attribute. *Why it matters*: this is the one moment on the screen with real stakes (uncommitted work at risk), and the explanation is unreachable for keyboard-only/screen-reader users and slow to discover for everyone else. *Fix*: render `why` inline as body text under the meta line, not just in `title`. **Suggested command**: `$impeccable clarify`

- **[P2] Resting glow shadow + eyebrow overuse** — a `shadow-[0_0_14px_...]` glow at rest on live project cards (line 384, violates the Flat-By-Default Rule) plus 5 separate mono-uppercase eyebrow labels on one screen (lines 374, 447, 451, 475, 506), which DESIGN.md itself cautions against using on every panel. *Why it matters*: both are small, mechanical drifts from rules the rest of the app follows — cheap to fix, and fixing them removes two more "does this look AI-made" tells. *Fix*: drop the resting shadow (the existing "● live" badge already signals liveness); keep eyebrows only at the top-level grouping. **Suggested command**: `$impeccable distill`

## Persona Red Flags

**Alex (Power User)**: Tooltip-only `why`/momentum explanations (lines 457, 512) require a hover-and-wait — friction for someone scanning fast. Silent clipboard-fallback failure (line 268) gives zero feedback if Resume fails entirely. No arrow-key/roving-focus grid navigation despite the app's stated keyboard-first principle.

**Sam (Accessibility)**: The Reveal-in-Finder button (lines 429-435) has only a `title`, no `aria-label`, unlike the Dismiss button (line 302) which does it correctly — an inconsistent accessibility pattern within the same file. `SectionLabel`/`BentoCard` headers render as `<p>` tags, not headings, so a screen-reader user navigating by heading structure finds nothing inside "My Work" below the page's single `<h2>`. Compounds directly with the measured contrast failure above.

**Riley (Stress Tester)**: `attention.slice(0, 5)` (line 239) silently truncates with no "N more" indicator — inconsistent with the projects grid, which explicitly says "showing 9 of N" (line 375). The app is honest about truncation in one place and silent about it in another.

## Minor Observations

- `AGENT_COLORS` (line 11) duplicates color decisions already encoded in `AgentBadge.tsx`'s Tailwind classes — two sources of truth that can drift apart.
- `rounded-xl` (12px) used pervasively for cards where DESIGN.md's Components section names `rounded-lg` (8px) as the card standard.
- Text glyphs (▶, ⌥, ⌖, ●) used as icons instead of the SVG icon system already established in `ExpandedApp.tsx`'s `NavIcon`.
- Three time windows are visible simultaneously with only small inline text differentiating them: the tab-selected window, the fixed "today" peak banner, and the fixed "last 7 days" momentum grid (lines 139-190). Not urgent, but worth a look if cognitive load ever comes up again.

## Questions to Consider

- If DESIGN.md bans gradients, border-stripes, and resting shadows by name, why does the landing section of the Expanded window contain all three — was this file simply written before the system was formalized and never reconciled?
- The tab row already scopes sessions/prompts/projects — what does a second, permanently-"today"-scoped banner solve that the tab row doesn't?
- Is the momentum grid's "Friction" tag (driven by raw error count) legible to someone who's never hovered the tooltip, or does it risk reading as a judgment on their session rather than a diagnostic?
