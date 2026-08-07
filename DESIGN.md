---
name: Context Bar
description: macOS menu bar app — mission control for every AI coding agent on your Mac
colors:
  bg: "#ffffff"
  bg-dark: "#09090b"
  surface: "#f4f4f5"
  surface-dark: "#18181b"
  border: "rgba(228,228,231,0.9)"
  border-dark: "rgba(39,39,42,0.8)"
  border-sub: "rgba(228,228,231,0.6)"
  border-sub-dark: "rgba(39,39,42,0.5)"
  text: "#18181b"
  text-dark: "#e4e4e7"
  text-secondary: "#71717a"
  text-tertiary-light: "#a1a1aa"
  text-tertiary-dark: "#52525b"
  indigo: "#6366f1"
  violet: "#8b5cf6"
  emerald: "#10b981"
  amber: "#fbbf24"
  red: "#ef4444"
typography:
  title:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  label:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, ui-sans-serif, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  mono:
    fontFamily: "Geist Mono, SF Mono, ui-monospace, monospace"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "10px"
  lg: "16px"
components:
  status-dot:
    backgroundColor: "{colors.emerald}"
    rounded: "{rounded.full}"
    size: "7px"
  toggle-track-on:
    backgroundColor: "{colors.indigo}"
    rounded: "{rounded.full}"
    width: "28px"
    height: "16px"
  toggle-track-off:
    backgroundColor: "{colors.border}"
    rounded: "{rounded.full}"
    width: "28px"
    height: "16px"
  search-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "6px 12px 6px 32px"
  row-hover:
    backgroundColor: "{colors.surface}"
    padding: "10px 16px"
    rounded: "{rounded.none}"
---

# Design System: Context Bar

## 1. Overview

**Creative North Star: "The Instrument Panel"**

Context Bar is a readout, not a showroom. Every element on screen exists to answer one question: what's the current state of this tool, skill, MCP, or session? Nothing is decorative because nothing has room to be — the tray popover is a few hundred pixels wide and has to communicate at a glance, the way a cockpit gauge does. The Expanded window relaxes the width constraint but keeps the same discipline: dense information, minimal chrome, status carried by color and typography weight rather than illustration or gradient.

This system explicitly rejects the generic SaaS dashboard (card-grid analytics, gradient hero-metric widgets, marketing sheen, upsell framing) and the cluttered system utility (Activity-Monitor-style density, enterprise-settings-panel sprawl). The bar is: precise, calm, technical. It speaks like a well-built CLI wearing a GUI, not a product trying to sell itself.

**Key Characteristics:**
- Two-tier neutral surface (bg / surface) in true zinc, no warm or cool tint — the palette itself doesn't editorialize
- A single accent (indigo) reserved for interactive/primary state; status color (emerald/amber/red) is reserved strictly for state signaling, never decoration
- Compact type scale (9–16px for 95% of UI) built for scanning many rows fast, not for touch-target spaciousness
- Flat by default; shadow exists only where a layer floats above the page (popovers, dropdowns, tooltips)
- Monospace (Geist Mono) marks anything that is literally a system value — a path, a command, a session ID — never used for narrative text

## 2. Colors

The palette is a true-zinc neutral base (no warm or cool tint) with one interactive accent and a strict status triad. Color is never used to differentiate content that isn't stateful.

### Primary
- **Indigo** (`#6366f1`, indigo-500/400): the one interactive accent — links, focus rings, active nav, primary icon accents, unread-notification badge glow. Also doubles as the default search-input focus border.

### Secondary
- **Violet** (`#8b5cf6`, violet-500): reserved for a second, distinct interactive context (e.g. Sessions search vs. Skills/MCP search) so two coexisting search fields don't share the same accent. Used sparingly, never alongside indigo in the same view.

### Tertiary — Status Triad
- **Emerald** (`#10b981`, emerald-500/400): installed / active / healthy / live. The "good" state.
- **Amber** (`#fbbf24`, amber-400/500): no-config / needs-attention / warning. The "check this" state.
- **Red** (`#ef4444`, red-500/400): error / failed. The "broken" state.

### Neutral
- **Canvas** (`#ffffff` light / `#09090b` dark): page background (`--c-bg`).
- **Surface** (`#f4f4f5` light / `#18181b` dark): rows, cards, inputs, hover fills (`--c-surface`, `--c-hover`).
- **Border** (`rgba(228,228,231,0.9)` light / `rgba(39,39,42,0.8)` dark): default dividers and outlines (`--c-border`); a `-sub` variant at ~60% opacity for quieter internal separators.
- **Ink** (`#18181b` light / `#e4e4e7` dark): primary text (`--c-text`).
- **Ink-secondary** (`#71717a`): supporting text, both themes (`--c-text-2`).
- **Ink-tertiary** (`#a1a1aa` light / `#52525b` dark): metadata, timestamps, placeholder text (`--c-text-3`).

### Named Rules
**The Signal Rule.** Emerald/amber/red exist only to report installed/warning/error state. If a color choice isn't reporting a real state, it's wrong — reach for the neutral ramp instead.

**The One Accent Rule.** Indigo is the default interactive accent everywhere. Violet is the sole permitted exception, and only to disambiguate two co-visible interactive surfaces (e.g. two search inputs in the same view). No other view introduces a third accent.

## 3. Typography

**Body & Display Font:** Geist (with `-apple-system, BlinkMacSystemFont, ui-sans-serif, system-ui, sans-serif` fallback)
**Mono Font:** Geist Mono (with `SF Mono, ui-monospace, monospace` fallback)

**Character:** One typeface family carrying the entire hierarchy through weight and size alone — Regular/Medium/SemiBold/Bold — plus Geist Mono strictly for literal system values. No serif, no second display face; the restraint is the point.

### Hierarchy
- **Display** (bold, 19–24px, tight): rare — used only for the tray header wordmark and Expanded-window page titles. The absolute ceiling of the scale.
- **Title** (semibold, 13–16px, `-0.01em` tracking): row primary labels, panel headers, the active breadcrumb crumb.
- **Body** (regular/medium, 12–13px): descriptions, list content, form values.
- **Label** (medium, 10–11px): secondary metadata — timestamps, counts, breadcrumb trail, section eyebrows used sparingly and only where they carry real hierarchy (not on every panel).
- **Micro** (medium, 8–9px): the smallest tier — badge counts, command-palette section headers, keycap glyphs.
- **Mono/Label** (regular, 10px): file paths, shell commands, session IDs, keyboard shortcuts (⌘K).

### Named Rules
**The Literal-Value Rule.** Anything that is copy-pasteable or executable — a path, a command, a session ID, a hex-ish identifier — renders in Geist Mono. Prose never does.

## 4. Elevation

Context Bar is flat at rest. Rows, panels, and cards carry depth through a 1px border and a one-step-lighter surface fill, never a shadow. Shadow is reserved exclusively for layers that visually float above the page's own stacking order: dropdowns, popovers, and tooltips. When one of those closes, its shadow leaves with it — nothing at rest ever carries a shadow.

### Shadow Vocabulary
- **Floating-low** (`shadow-sm`): dropdown menus, small popovers anchored to a trigger.
- **Floating-high** (`shadow-lg` / `shadow-xl`): the Expanded window's command palette and larger modal-style overlays.

### Named Rules
**The Flat-By-Default Rule.** Nothing at rest has a shadow. A shadow appearing on an element is the signal that it's temporarily floating above the layout, not a permanent decoration.

## 5. Components

Every component is dense and utilitarian: compact hit targets, tight internal spacing, built for scanning many rows quickly rather than touch-friendly spaciousness.

### Buttons
- **Shape:** rounded (`rounded` / `rounded-md`, 4–6px) for icon buttons; `rounded-full` for pill-shaped chips and count badges.
- **Primary:** text-only or icon-only, colored via `text-[var(--c-text-3)]` at rest, `text-[var(--c-text)]` or the indigo accent on hover — Context Bar has effectively no filled/solid CTA button; interaction is signaled by color and opacity shift, not a raised surface.
- **Hover / Focus:** `transition-colors duration-100–200`; hover shifts text tertiary → text, or fills a light `bg-hover` surface behind the whole row. `focus-visible` gets a background fill, not an outline ring, matching the row-hover treatment.

### Toggles
- **Shape:** pill track (`rounded-full`, 28×16px) with a 12×12px white thumb.
- **On:** track fills the entity's `activeColor` prop (context-specific accent, typically indigo or emerald); thumb slides right with `translate-x-3` at `duration-200`.
- **Off:** track is `var(--c-border)`; thumb rests left.
- **Disabled (toggling):** `opacity-40`, pointer events blocked until the write resolves.

### Rows (the app's signature component)
- **Shape:** no border-radius at the row level inside a list — full-bleed with a bottom hairline border, or `rounded-lg`/`rounded-xl` only when the row is itself a standalone card (e.g. a worktree card).
- **Background:** transparent at rest, `bg-[var(--c-hover)]` on hover/focus-visible.
- **Padding:** `px-4 py-2.5` typical list row; `px-3 py-2` in denser tray contexts.
- **Status:** leads with a `StatusDot` (7×7px filled circle in the status triad) or an `AgentDot` glyph badge — status is always the leftmost signal, never buried in text.

### Cards / Containers (worktrees, hint banners, detail panels)
- **Corner Style:** `rounded-lg` (8px) standard; `rounded-[10px]` on hint banners; `rounded-2xl` reserved for the rare larger surface.
- **Background:** `var(--c-surface)`.
- **Shadow Strategy:** none at rest — see Elevation.
- **Border:** 1px `var(--c-border)`, sometimes the quieter `var(--c-border-sub)` for internal dividers.
- **Internal Padding:** 8–12px, scaling with the card's role.

### Inputs / Search
- **Style:** `var(--c-surface)` fill, 1px `var(--c-border)` stroke, `rounded-md` (6px), left-padded 32px for a leading search icon.
- **Focus:** border shifts to the view's accent at 50% opacity (`focus:border-indigo-500/50` or `-violet-500/50`) — no glow, no ring.
- **Placeholder:** `var(--c-text-3)`.

### Status Dot
- **Style:** 7×7px filled circle, `rounded-full`, color from the status triad (or zinc-600 for "not installed"). Always paired with an `aria-label`/`title` and `role="img"` so state is announced, not just shown.

### Navigation (breadcrumb + command palette)
- **Breadcrumb:** 11–12px tertiary text with a `›` separator at 40% opacity; the active/last crumb steps up to 13px semibold ink.
- **Command Palette (⌘K):** floating overlay (`shadow-xl`), sections marked by 9.5px mono uppercase labels with wide tracking, results rows matching the standard row treatment, keyboard shortcut hints rendered as bordered mono badges.

## 6. Do's and Don'ts

### Do:
- **Do** lead every row with its status signal (dot, badge, or icon) before any label text.
- **Do** keep the status triad (emerald/amber/red) exclusively for real installed/warning/error state.
- **Do** use Geist Mono for every literal system value: paths, commands, session IDs, shortcuts.
- **Do** keep shadows exclusive to floating layers (popovers, dropdowns, the command palette); everything at rest is flat.
- **Do** hold the type scale in the 9–16px band; reserve 19px+ for the rare page-level title.

### Don't:
- **Don't** build a generic SaaS dashboard: no card-grid analytics layout, no gradient hero-metric widgets, no marketing sheen, no upsell framing anywhere in the app.
- **Don't** let density collapse into a cluttered system utility: no Activity-Monitor-style sprawl, no enterprise-settings-panel density where a panel can't be read at a glance.
- **Don't** introduce a third interactive accent beyond indigo (primary) and violet (secondary, disambiguation-only).
- **Don't** use `border-left`/`border-right` as a colored accent stripe on rows or cards.
- **Don't** add a shadow to anything that isn't a floating layer — a shadow on a resting card is a bug, not a style choice.
- **Don't** use color for anything that isn't reporting real state; if it's not installed/active/warning/error, it stays neutral.
