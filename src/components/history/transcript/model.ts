import type { HistoryMessage, ContentBlock } from '../../../types'

/** One tool call plus the result it was paired with (by tool_use id). */
export interface Step {
  name: string
  input?: string
  output?: string
  isError: boolean
  kind: StepKind
  /** MCP server name, for `kind === 'mcp'` (e.g. "github" from `mcp__github__…`). */
  server?: string
  /** Bare tool name for MCP calls (`create_pull_request` from `mcp__github__create_pull_request`). */
  bareName?: string
}

export type StepKind = 'read' | 'shell' | 'edit' | 'skill' | 'mcp' | 'other'

/** A run of routine tool steps folded into one block, or a single notable
 *  event (skill / MCP call) rendered on its own. */
export type Segment =
  | { type: 'work'; steps: Step[] }
  | { type: 'event'; step: Step }

export interface TranscriptTurn {
  role: 'user' | 'assistant'
  model?: string
  time?: number
  text: string
  segments: Segment[]
  hasError: boolean
  hasEvent: boolean
  /** Lower-cased haystack for the toolbar text filter. */
  haystack: string
}

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'NotebookRead'])
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

export function classify(name: string): StepKind {
  if (name === 'Skill') return 'skill'
  if (name.startsWith('mcp__')) return 'mcp'
  if (name === 'Bash') return 'shell'
  if (READ_TOOLS.has(name)) return 'read'
  if (EDIT_TOOLS.has(name)) return 'edit'
  return 'other'
}

const isNotable = (k: StepKind) => k === 'skill' || k === 'mcp'

/** A `Skill` call's input is JSON like `{"command":"ship"}` (possibly
 *  truncated). Pull the skill name out; fall back to the raw string. */
function skillName(input?: string): string | undefined {
  if (!input) return undefined
  try {
    const o = JSON.parse(input) as Record<string, unknown>
    const n = o.command ?? o.skill ?? o.name
    if (typeof n === 'string' && n) return n
  } catch {
    const m = input.match(/"(?:command|skill|name)"\s*:\s*"([^"]+)"/)
    if (m) return m[1]
  }
  return input
}
const textOf = (blocks: ContentBlock[]) =>
  blocks.filter(b => b.blockType === 'text' && b.text).map(b => b.text!.trim()).join('\n\n').trim()
const isToolOnly = (m: HistoryMessage) =>
  m.role === 'assistant' && m.content.length > 0 &&
  m.content.every(b => b.blockType === 'tool_use')

/** A user message that carries only `tool_result` protocol blocks (no prose).
 *  Its output is harvested into the results map separately; as a "turn" it is
 *  noise, and leaving it in the stream would break the run of sequential
 *  assistant tool calls that `mergeToolOnly` needs to see as adjacent. */
const isProtocolOnly = (m: HistoryMessage) =>
  m.role === 'user' && m.content.length > 0 &&
  m.content.every(b => b.blockType === 'tool_result')

/** Claude Code puts each `thinking` block in its own assistant message, which
 *  the Rust parser strips to nothing. Left in the stream, that empty message
 *  sits between a tool call and the thinking that preceded it and stops
 *  `mergeToolOnly` from joining sequential tool calls into one block. */
const isEmptyAssistant = (m: HistoryMessage) =>
  m.role === 'assistant' &&
  !m.content.some(b => (b.blockType === 'text' && b.text?.trim()) || b.blockType === 'tool_use')

/** Merge consecutive tool-only assistant messages into the assistant turn
 *  before them. Codex / agy emit one tool step per message; without this a
 *  tool-heavy stretch becomes a wall of empty avatar rows. */
function mergeToolOnly(messages: HistoryMessage[]): HistoryMessage[] {
  const out: HistoryMessage[] = []
  for (const m of messages) {
    const prev = out[out.length - 1]
    if (isToolOnly(m) && prev && prev.role === 'assistant') {
      prev.content = [...prev.content, ...m.content]
    } else {
      out.push({ ...m, content: [...m.content] })
    }
  }
  return out
}

function buildSteps(blocks: ContentBlock[], results: Map<string, { output?: string; isError: boolean }>): Step[] {
  return blocks
    .filter(b => b.blockType === 'tool_use')
    .map(b => {
      const name = b.toolName ?? 'tool'
      const kind = classify(name)
      const paired = b.toolUseId ? results.get(b.toolUseId) : undefined
      const step: Step = {
        name,
        input: b.toolInput || undefined,
        output: b.toolResult || paired?.output,
        isError: b.isError || paired?.isError || false,
        kind,
      }
      if (kind === 'mcp') {
        const parts = name.split('__')
        step.server = parts[1] || 'mcp'
        step.bareName = parts.slice(2).join('__') || name
      }
      if (kind === 'skill') {
        step.input = skillName(b.toolInput) ?? step.input
      }
      return step
    })
}

function foldSegments(steps: Step[]): Segment[] {
  const segs: Segment[] = []
  let run: Step[] = []
  const flush = () => { if (run.length) { segs.push({ type: 'work', steps: run }); run = [] } }
  for (const s of steps) {
    if (isNotable(s.kind)) { flush(); segs.push({ type: 'event', step: s }) }
    else run.push(s)
  }
  flush()
  return segs
}

export function buildTurns(messages: HistoryMessage[]): TranscriptTurn[] {
  // 1. Collect every tool_result across the whole session, keyed by the id
  //    of the call it answers.
  const results = new Map<string, { output?: string; isError: boolean }>()
  for (const m of messages) {
    for (const b of m.content) {
      if (b.blockType === 'tool_result' && b.toolUseId) {
        results.set(b.toolUseId, { output: b.toolResult || undefined, isError: b.isError })
      }
    }
  }

  // Drop protocol-only user turns and empty (thinking-stripped) assistant
  // turns first, so a stretch of one-tool-per-message assistant turns reads
  // as adjacent and merges into a single work block.
  const stream = messages.filter(m => !isProtocolOnly(m) && !isEmptyAssistant(m))

  const turns: TranscriptTurn[] = []
  for (const m of mergeToolOnly(stream)) {
    const role = m.role === 'user' ? 'user' : 'assistant'
    const text = textOf(m.content)
    const segments = role === 'assistant' ? foldSegments(buildSteps(m.content, results)) : []

    if (role === 'user' && !text) continue
    if (role === 'assistant' && !text && segments.length === 0) continue

    const allSteps = segments.flatMap(s => s.type === 'work' ? s.steps : [s.step])
    turns.push({
      role,
      model: m.model ?? undefined,
      time: m.timestamp,
      text,
      segments,
      hasError: allSteps.some(s => s.isError),
      hasEvent: segments.some(s => s.type === 'event'),
      haystack: [text, ...allSteps.flatMap(s => [s.name, s.input, s.output])]
        .filter(Boolean).join(' ').toLowerCase(),
    })
  }
  return turns
}

/** One-line summary of a turn, shown when it is collapsed. */
export function previewLine(turn: TranscriptTurn): string {
  if (turn.text) return turn.text.split('\n').find(l => l.trim()) ?? turn.text
  const bits = turn.segments.map(s =>
    s.type === 'work'
      ? `⚒ ${s.steps.length} step${s.steps.length > 1 ? 's' : ''}`
      : s.step.kind === 'skill'
        ? `skill: ${s.step.input ?? ''}`.trim()
        : `mcp: ${s.step.bareName ?? s.step.name}`,
  )
  return bits.join('  ·  ') || '(no content)'
}

/** Compact one-line preview of a work block's steps. */
export function previewSteps(steps: Step[]): string {
  if (steps.every(s => s.name === 'Bash')) {
    return steps.map(s => (s.input ?? '').split(/\s+/).slice(0, 2).join(' ')).join('  →  ')
  }
  const parts: string[] = []
  let i = 0
  while (i < steps.length) {
    let j = i
    while (j < steps.length && steps[j].name === steps[i].name) j++
    parts.push(j - i > 1 ? `${steps[i].name} ×${j - i}` : steps[i].name)
    i = j
  }
  return parts.join(' · ')
}

/** Plain-text form of one step, for copy-to-clipboard. */
function stepToText(s: Step): string {
  const head = s.name === 'Bash'
    ? `$ ${s.input ?? ''}`
    : `${s.name}${s.input ? ` ${s.input}` : ''}`
  if (!s.output) return head
  return `${head}\n${s.output.split('\n').map(l => `  ${l}`).join('\n')}`
}

/** Plain-text form of one turn (role header + prose + tool steps). */
export function turnToText(turn: TranscriptTurn): string {
  const who = turn.role === 'user' ? 'You' : (turn.model ?? 'Claude')
  const when = turn.time ? ` · ${new Date(turn.time).toLocaleString()}` : ''
  const parts: string[] = [`### ${who}${when}`]
  if (turn.text) parts.push(turn.text)
  for (const seg of turn.segments) {
    if (seg.type === 'event') {
      const s = seg.step
      parts.push(`[${s.kind.toUpperCase()}${s.server ? ` · ${s.server}` : ''}] ${s.kind === 'skill' ? (s.input ?? '') : (s.bareName ?? s.name)}${s.output ? `\n${s.output}` : ''}`)
    } else {
      for (const st of seg.steps) parts.push(stepToText(st))
    }
  }
  return parts.join('\n\n')
}

/** Plain-text form of the whole transcript. */
export function transcriptToText(turns: TranscriptTurn[]): string {
  return turns.map(turnToText).join('\n\n———\n\n')
}
