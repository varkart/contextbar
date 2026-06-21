import type { CachedMcp } from '../types'

export type McpType = 'npx' | 'http' | 'command' | 'docker' | 'local' | 'paste'

export interface McpPayload {
  command?: string
  args?: string[]
  url?: string
}

export function parsePasteJson(raw: string): McpPayload | null {
  try {
    const parsed = JSON.parse(raw.trim())
    if (typeof parsed !== 'object' || parsed === null) return null
    const keys = Object.keys(parsed)
    // Named form: { "voice-mode": { "command": "uvx", "args": [...] } }
    if (
      keys.length === 1 &&
      typeof parsed[keys[0]] === 'object' &&
      parsed[keys[0]] !== null &&
      ('command' in parsed[keys[0]] || 'url' in parsed[keys[0]])
    ) {
      const inner = parsed[keys[0]]
      return { command: inner.command, args: inner.args, url: inner.url }
    }
    // Direct form: { "command": "uvx", "args": [...] }
    if ('command' in parsed || 'url' in parsed) {
      return { command: parsed.command, args: parsed.args, url: parsed.url }
    }
    return null
  } catch {
    return null
  }
}

export function detectNameFromPaste(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw.trim())
    if (typeof parsed !== 'object' || parsed === null) return null
    const keys = Object.keys(parsed)
    if (
      keys.length === 1 &&
      typeof parsed[keys[0]] === 'object' &&
      parsed[keys[0]] !== null &&
      ('command' in parsed[keys[0]] || 'url' in parsed[keys[0]])
    ) {
      return keys[0]
    }
    return null
  } catch {
    return null
  }
}

export function buildMcpPayload(type: McpType, fields: Record<string, string>): McpPayload {
  switch (type) {
    case 'npx': {
      const pkg = fields.package?.trim() ?? ''
      return { command: 'npx', args: ['-y', pkg] }
    }
    case 'http':
      return { url: fields.url?.trim() }
    case 'command': {
      const args = fields.args?.trim() ? fields.args.trim().split(/\s+/) : []
      return { command: fields.command?.trim(), args }
    }
    case 'docker': {
      const image = fields.image?.trim() ?? ''
      const extraArgs = fields.dockerArgs?.trim() ? fields.dockerArgs.trim().split(/\s+/) : []
      return { command: 'docker', args: ['run', '--rm', '-i', image, ...extraArgs] }
    }
    case 'local': {
      const interpreter = fields.interpreter?.trim()
      const path = fields.path?.trim() ?? ''
      if (interpreter) {
        return { command: interpreter, args: [path] }
      }
      return { command: path, args: [] }
    }
    case 'paste':
      return parsePasteJson(fields.json ?? '') ?? {}
  }
}

export function prefillTypeAndFields(cached: CachedMcp): { type: McpType; fields: Record<string, string> } {
  if (cached.url) {
    return { type: 'http', fields: { url: cached.url } }
  }
  if (cached.command === 'npx' && cached.args.includes('-y')) {
    const pkg = cached.args.find(a => !a.startsWith('-')) ?? ''
    return { type: 'npx', fields: { package: pkg } }
  }
  if (cached.command === 'docker') {
    const image = cached.args.find(a => !a.startsWith('-') && a !== 'run' && a !== '--rm' && a !== '-i') ?? ''
    return { type: 'docker', fields: { image } }
  }
  const args = cached.args.join(' ')
  return { type: 'command', fields: { command: cached.command ?? '', args } }
}
