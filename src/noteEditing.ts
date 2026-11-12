/** Pure text edits behind the note editor's markdown shortcuts. */

export interface Edit { value: string; start: number; end: number }

/** Length of the run of `c` ending at `end` (backwards) or starting at `start`. */
function runBefore(s: string, end: number, c: string): number {
  let n = 0
  while (end - n - 1 >= 0 && s[end - n - 1] === c) n++
  return n
}
function runAfter(s: string, start: number, c: string): number {
  let n = 0
  while (start + n < s.length && s[start + n] === c) n++
  return n
}

/** Is a `marker` (one char repeated) present in a run of `run` marker chars?
 *  For `*`, odd runs carry italic and runs of 2+ carry bold, so `*` inside
 *  `**bold**` is not italic. */
function hasMarker(marker: string, run: number): boolean {
  if (marker[0] === '*') return marker.length === 1 ? run % 2 === 1 : run >= 2
  return run >= marker.length
}

/** Wraps the selection in `marker` (e.g. `**`), or unwraps it if already wrapped. */
export function toggleWrap(value: string, start: number, end: number, marker: string, placeholder = 'text'): Edit {
  const m = marker.length
  const c = marker[0]
  const outer = Math.min(runBefore(value, start, c), runAfter(value, end, c))
  if (hasMarker(marker, outer)) {
    return {
      value: value.slice(0, start - m) + value.slice(start, end) + value.slice(end + m),
      start: start - m,
      end: end - m,
    }
  }
  const selected = value.slice(start, end)
  const inner = Math.min(runAfter(selected, 0, c), runBefore(selected, selected.length, c))
  if (selected.length > 2 * m && hasMarker(marker, inner)) {
    const stripped = selected.slice(m, -m)
    return { value: value.slice(0, start) + stripped + value.slice(end), start, end: start + stripped.length }
  }
  const text = selected || placeholder
  return {
    value: value.slice(0, start) + marker + text + marker + value.slice(end),
    start: start + m,
    end: start + m + text.length,
  }
}

/** Turns the selection into `[text](url)` with the url selected. */
export function insertLink(value: string, start: number, end: number): Edit {
  const text = value.slice(start, end) || 'link'
  const insert = `[${text}](url)`
  const urlStart = start + text.length + 3
  return { value: value.slice(0, start) + insert + value.slice(end), start: urlStart, end: urlStart + 3 }
}

const LIST_RE = /^(\s*)([-*+]|\d+\.)\s(\[[ xX]\]\s)?/

/**
 * Enter at the end of a list item continues the list ("- ", "1. ", "- [ ] ").
 * On an empty item it ends the list instead. Returns null when not in a list.
 */
export function continueList(value: string, pos: number): Edit | null {
  const lineStart = value.lastIndexOf('\n', pos - 1) + 1
  const line = value.slice(lineStart, pos)
  const m = line.match(LIST_RE)
  if (!m) return null
  if (line.trim() === m[0].trim()) {
    return { value: value.slice(0, lineStart) + value.slice(pos), start: lineStart, end: lineStart }
  }
  const [, indent, bullet, box] = m
  const nextBullet = /^\d+\.$/.test(bullet) ? `${parseInt(bullet, 10) + 1}.` : bullet
  const insert = `\n${indent}${nextBullet} ${box ? '[ ] ' : ''}`
  return { value: value.slice(0, pos) + insert + value.slice(pos), start: pos + insert.length, end: pos + insert.length }
}

export const NOTE_SHORTCUTS: [string, string][] = [
  ['⌘B', '**bold**'],
  ['⌘I', '*italic*'],
  ['⌘E', '`code`'],
  ['⌘K', '[link](url)'],
  ['⌘⇧P', 'Preview / edit'],
]

export const NOTE_SYNTAX: [string, string][] = [
  ['# Heading', 'Heading'],
  ['- item', 'Bullet list (Enter continues it)'],
  ['- [ ] task', 'Checklist'],
  ['---', 'Line separator'],
  ['> quote', 'Quote'],
]
