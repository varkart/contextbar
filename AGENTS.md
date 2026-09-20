# Context Bar — UX Design Principles

Guidance for anyone (human or agent) making UI changes in this app. Keep entries short and concrete — a rule plus the example that produced it, not a style guide.

## Place controls where the user's focus actually is, not just where they're logically grouped

A control tied to a section should sit where attention naturally lands *at the moment you'd reach for it* — not wherever fits near a header.

- **Active projects' "Show all" toggle** — was top-right next to the header. Moved to bottom-center, below the tile row, because you only want to expand it after scanning the row and realizing there's more. (`src/expanded/MyWorkSection.tsx`)
- **Activity calendar's month nav** — was up by the month title. Moved below the grid, because deciding "I want a different month" happens after looking at the grid, not before. (`src/expanded/InsightWidgets.tsx`, `ActivityCalendar`)

When adding a similar affordance (expand/collapse, pagination, "show more", navigation tied to a specific view), ask: does the user decide they want this *before* or *after* looking at the content it acts on? Place it accordingly — usually that means below/after the content, not in the header.

## Hover-revealed information needs its own visible affordance

If hovering an element reveals information nowhere else on screen, there must be a persistent, visible hint that hovering does something — otherwise most users never discover it. Don't rely on a faint placeholder alone.

- Activity calendar/week-row hover readout: idle state now reads "⟶ hover a day for details" (was easy to miss), and the *active* hover result renders bold + accent-colored so it visibly changes state, not just fades in as more gray text.
- Hoverable cells also get a `hover:ring` + slight scale so there's feedback right at the cursor, not only in a text row elsewhere on the tile.

## Icons over ambiguous glyphs for interactive controls

Plain text glyphs (`‹` `›` `»` etc.) render inconsistently — thin, off-center, or barely legible — across fonts and sizes. Use an explicit stroked SVG icon for any clickable icon-only control (see `ChevronIcon` in `InsightWidgets.tsx`), matching the stroke style already used elsewhere in this app (`stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"`).
