---
target: Repos/Worktrees
total_score: 22
p0_count: 1
p1_count: 2
timestamp: 2026-07-31T05-52-04Z
slug: src-expanded-worktreessection-tsx
---
## Design Health Score
**Total: 22/40 — Acceptable.** Lowest: Aesthetic & Minimalist Design (decorative hashed palette adds visual noise with no state meaning); Consistency & Standards (three independent named-rule violations in one component).

## Anti-Patterns Verdict
**LLM**: the most anti-pattern-dense of all 6 pages — an arbitrary hashed color palette for repo avatars (no state meaning), a static border-stripe using an unauthorized teal accent, and a resting glow shadow on active cards all appear in one file, each a direct DESIGN.md Don't.
**Deterministic scan**: 1 finding — `side-tab` warning at line 109 (`border-l-2`), confirmed real (unconditional static class, not hover-gated).

## Overall Impression
The densest page in the app, and it shows in both cognitive load and rule violations. The trunk-line branch map is a genuinely useful structural device buried under decorative color noise that doesn't belong.

## What's Working
- Trunk-line branch map (vertical rule + connector per worktree) is a useful non-decorative structural device.
- Repo/branch note distinction is a thoughtful feature, even though its current execution over-colors it.

## Priority Issues
- **[P0] Hashed decorative color palette for repo avatars** — WorktreesSection.tsx:38-44 (`REPO_COLORS`, `repoColor()`) and :399-402. 7-hue array with no state meaning, violates the Signal Rule and introduces colors entirely outside the documented palette (#e8a94a, #d98fd9, #2dd4bf, #fb7185, #8fbf6b, #7aa2e8). Fix: delete `repoColor()`, render all repo-initial badges identically as `bg-[var(--c-surface-2)] border border-[var(--c-border)] text-[var(--c-text-2)]`. → `$impeccable quieter`
- **[P1] Static border-l-2 stripe + unauthorized teal accent** — WorktreesSection.tsx:68-72,109, permanent left rule on note cards (`border-l-indigo-400/60` repo / `border-l-teal-400/60` branch). Fix: remove the border entirely, distinguish repo vs branch via the existing text chip restyled neutral. → `$impeccable layout`
- **[P1] Resting glow shadow on active worktree cards** — WorktreesSection.tsx:516, `shadow-[0_0_14px_rgba(52,211,153,0.07)]` at rest. Violates Flat-By-Default. Fix: delete the shadow, keep `border-emerald-500/30` + the pulsing status dot. → `$impeccable distill`
