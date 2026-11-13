/**
 * Splits a markdown file's YAML frontmatter into display fields and body.
 * Handles the shapes SKILL.md files use: `key: value`, quoted values,
 * folded/literal blocks (`>`, `|`), plain values wrapped onto indented lines,
 * and simple lists. Nested maps are flattened to "a, b" text for display.
 */
export interface Frontmatter {
  fields: [string, string][]
  body: string
}

function unquote(v: string): string {
  const t = v.trim()
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1)
  }
  return t
}

export function splitFrontmatter(content: string): Frontmatter {
  const text = content.replace(/^﻿/, '')
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return { fields: [], body: content }
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (end === -1) return { fields: [], body: content }

  const fields: [string, string][] = []
  const header = lines.slice(1, end)
  for (let i = 0; i < header.length; i++) {
    const m = header[i].match(/^([A-Za-z0-9_-]+):(.*)$/)
    if (!m) continue
    const key = m[1]
    const rest = m[2].trim()
    const block: string[] = []
    while (i + 1 < header.length && (/^\s/.test(header[i + 1]) || header[i + 1].trim() === '')) {
      block.push(header[++i].trim())
    }
    const nonEmpty = block.filter(Boolean)
    let value: string
    if (/^[>|][+-]?$/.test(rest)) {
      value = rest.startsWith('|') ? block.join('\n').trim() : nonEmpty.join(' ')
    } else if (rest === '') {
      value = nonEmpty.map(l => unquote(l.replace(/^-\s*/, ''))).join(', ')
    } else {
      value = [unquote(rest), ...nonEmpty].join(' ')
    }
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(unquote).filter(Boolean).join(', ')
    }
    if (value) fields.push([key, value])
  }
  return { fields, body: lines.slice(end + 1).join('\n').trimStart() }
}
