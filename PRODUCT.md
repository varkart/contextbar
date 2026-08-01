# Product

## Register

product

## Users

Developers running multiple AI coding tools (Claude Code, Codex, Gemini, Cursor, Kiro, OpenCode, and others) side by side. Primary usage is a glance-and-go interaction: check the tray popover for 2-3 seconds between coding tasks to see what's installed, active, or needs attention, then dismiss it. The Expanded window (⌘K, ⌘1-6) serves the secondary, lower-frequency job: managing MCPs, skills, permissions, and sessions in a longer sitting.

## Product Purpose

Context Bar gives one place to see every AI coding tool's state — skills, MCP servers, sessions, permissions, worktrees — without opening terminals or hand-editing JSON/TOML config scattered across `~/.claude/`, `~/.cursor/`, `~/.codex/`, and others. Success is a user trusting the tray at a glance instead of manually checking each tool.

## Brand Personality

Precise, calm, technical. Speaks like a well-built CLI, not a SaaS product: no persuasion, no gloss, just accurate state clearly shown. Confidence comes from correctness and restraint, not decoration.

## Anti-references

- Generic SaaS dashboard: no card-grid analytics look, no gradient hero-metric widgets, no marketing sheen, no upsell framing.
- Cluttered system utility: no Activity-Monitor-style density, no enterprise-settings-panel sprawl. Every panel should read at a glance, not require hunting.

## Design Principles

1. **State over decoration** — every visual element exists to answer "what's the current state of this tool/skill/MCP," never as ornament.
2. **Glance-first, drill-down second** — the tray popover must be scannable in seconds; deeper detail lives one click away in the Expanded window, never crammed into the popover.
3. **Never lie about state** — capability toggles, live indicators, and status dots must reflect real on-disk/process state (e.g. "applies to new sessions only" callouts), not an idealized or cached view.
4. **Terminal-adjacent restraint** — neutral palette, monospace for technical values (paths, commands, IDs), no color used decoratively; color is reserved for actual status signaling.
5. **Keyboard-operable by default** — ⌘K palette and roving focus aren't an accessibility add-on, they're the primary navigation model for power users.

## Accessibility & Inclusion

WCAG AA baseline: contrast ratios, full keyboard navigation, `prefers-reduced-motion` support throughout. No additional specialized requirements known at this time.
