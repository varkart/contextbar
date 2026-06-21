import { describe, it, expect } from 'vitest'
import { parsePasteJson, detectNameFromPaste, buildMcpPayload, prefillTypeAndFields } from '../mcpPayload'
import type { CachedMcp } from '../../types'

// ── parsePasteJson ────────────────────────────────────────────────────────────

describe('parsePasteJson', () => {
  it('parses direct command form', () => {
    const result = parsePasteJson('{"command":"uvx","args":["voice-mode"]}')
    expect(result).toEqual({ command: 'uvx', args: ['voice-mode'], url: undefined })
  })

  it('parses named form — extracts inner object', () => {
    const result = parsePasteJson('{"voice-mode":{"command":"uvx","args":["voice-mode"]}}')
    expect(result).toEqual({ command: 'uvx', args: ['voice-mode'], url: undefined })
  })

  it('parses url form', () => {
    const result = parsePasteJson('{"url":"https://mcp.example.com/sse"}')
    expect(result).toEqual({ url: 'https://mcp.example.com/sse', command: undefined, args: undefined })
  })

  it('parses named url form', () => {
    const result = parsePasteJson('{"my-server":{"url":"https://mcp.example.com/sse"}}')
    expect(result).toEqual({ url: 'https://mcp.example.com/sse', command: undefined, args: undefined })
  })

  it('returns null for invalid json', () => {
    expect(parsePasteJson('not json')).toBeNull()
    expect(parsePasteJson('')).toBeNull()
  })

  it('returns null for json without command or url', () => {
    expect(parsePasteJson('{"name":"foo"}')).toBeNull()
    expect(parsePasteJson('{"name":"foo","other":"bar"}')).toBeNull()
  })

  it('returns null for multi-key object with no command/url', () => {
    expect(parsePasteJson('{"a":{"x":1},"b":{"y":2}}')).toBeNull()
  })

  it('returns null for null json value', () => {
    expect(parsePasteJson('null')).toBeNull()
  })

  it('handles whitespace around json', () => {
    const result = parsePasteJson('  {"command":"npx","args":[]}  ')
    expect(result?.command).toBe('npx')
  })
})

// ── detectNameFromPaste ───────────────────────────────────────────────────────

describe('detectNameFromPaste', () => {
  it('detects name from named form', () => {
    expect(detectNameFromPaste('{"voice-mode":{"command":"uvx","args":["voice-mode"]}}')).toBe('voice-mode')
  })

  it('detects name from named url form', () => {
    expect(detectNameFromPaste('{"my-server":{"url":"https://example.com"}}')).toBe('my-server')
  })

  it('returns null for direct form — no outer key to use as name', () => {
    expect(detectNameFromPaste('{"command":"uvx","args":["voice-mode"]}')).toBeNull()
  })

  it('returns null for invalid json', () => {
    expect(detectNameFromPaste('broken')).toBeNull()
    expect(detectNameFromPaste('')).toBeNull()
  })

  it('returns null for multi-key object', () => {
    expect(detectNameFromPaste('{"a":{"command":"x"},"b":{"command":"y"}}')).toBeNull()
  })
})

// ── buildMcpPayload ───────────────────────────────────────────────────────────

describe('buildMcpPayload — npx', () => {
  it('produces npx -y <package>', () => {
    expect(buildMcpPayload('npx', { package: '@modelcontextprotocol/server-github' })).toEqual({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
    })
  })

  it('trims package name', () => {
    const result = buildMcpPayload('npx', { package: '  my-pkg  ' })
    expect(result.args?.[1]).toBe('my-pkg')
  })

  it('handles empty package', () => {
    const result = buildMcpPayload('npx', { package: '' })
    expect(result.command).toBe('npx')
    expect(result.args).toEqual(['-y', ''])
  })
})

describe('buildMcpPayload — http', () => {
  it('produces url-only payload', () => {
    expect(buildMcpPayload('http', { url: 'https://mcp.example.com/sse' })).toEqual({
      url: 'https://mcp.example.com/sse',
    })
  })

  it('trims url', () => {
    const result = buildMcpPayload('http', { url: '  https://example.com  ' })
    expect(result.url).toBe('https://example.com')
  })
})

describe('buildMcpPayload — command', () => {
  it('splits args on whitespace', () => {
    expect(buildMcpPayload('command', { command: 'uvx', args: 'voice-mode --port 3000' })).toEqual({
      command: 'uvx',
      args: ['voice-mode', '--port', '3000'],
    })
  })

  it('empty args produces empty array', () => {
    const result = buildMcpPayload('command', { command: 'node', args: '' })
    expect(result.args).toEqual([])
  })

  it('trims command', () => {
    const result = buildMcpPayload('command', { command: '  node  ', args: 'server.js' })
    expect(result.command).toBe('node')
  })
})

describe('buildMcpPayload — docker', () => {
  it('wraps image in docker run args', () => {
    expect(buildMcpPayload('docker', { image: 'ghcr.io/org/mcp:latest', dockerArgs: '' })).toEqual({
      command: 'docker',
      args: ['run', '--rm', '-i', 'ghcr.io/org/mcp:latest'],
    })
  })

  it('appends extra docker args after image', () => {
    const result = buildMcpPayload('docker', { image: 'my-mcp:latest', dockerArgs: '--network host' })
    expect(result.args).toEqual(['run', '--rm', '-i', 'my-mcp:latest', '--network', 'host'])
  })
})

describe('buildMcpPayload — local', () => {
  it('uses path as command when no interpreter', () => {
    expect(buildMcpPayload('local', { path: '/usr/local/bin/my-mcp' })).toEqual({
      command: '/usr/local/bin/my-mcp',
      args: [],
    })
  })

  it('uses interpreter as command with path as first arg', () => {
    expect(buildMcpPayload('local', { path: '/scripts/mcp.py', interpreter: 'python3' })).toEqual({
      command: 'python3',
      args: ['/scripts/mcp.py'],
    })
  })

  it('ignores blank interpreter', () => {
    const result = buildMcpPayload('local', { path: '/bin/mcp', interpreter: '  ' })
    expect(result.command).toBe('/bin/mcp')
    expect(result.args).toEqual([])
  })
})

describe('buildMcpPayload — paste', () => {
  it('delegates to parsePasteJson', () => {
    const result = buildMcpPayload('paste', { json: '{"command":"uvx","args":["voice-mode"]}' })
    expect(result.command).toBe('uvx')
    expect(result.args).toEqual(['voice-mode'])
  })

  it('returns empty object for invalid json', () => {
    expect(buildMcpPayload('paste', { json: 'invalid' })).toEqual({})
  })

  it('returns empty object when json field missing', () => {
    expect(buildMcpPayload('paste', {})).toEqual({})
  })
})

// ── prefillTypeAndFields ──────────────────────────────────────────────────────

function cached(overrides: Partial<CachedMcp>): CachedMcp {
  return {
    name: 'test',
    command: null,
    args: [],
    url: null,
    sourceUrl: null,
    cachedAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe('prefillTypeAndFields', () => {
  it('detects http from url', () => {
    const result = prefillTypeAndFields(cached({ url: 'https://mcp.example.com/sse' }))
    expect(result.type).toBe('http')
    expect(result.fields.url).toBe('https://mcp.example.com/sse')
  })

  it('detects npx from command+args with -y', () => {
    const result = prefillTypeAndFields(cached({ command: 'npx', args: ['-y', '@scope/pkg'] }))
    expect(result.type).toBe('npx')
    expect(result.fields.package).toBe('@scope/pkg')
  })

  it('detects docker from command', () => {
    const result = prefillTypeAndFields(cached({ command: 'docker', args: ['run', '--rm', '-i', 'my-mcp:latest'] }))
    expect(result.type).toBe('docker')
    expect(result.fields.image).toBe('my-mcp:latest')
  })

  it('falls back to command type for unknown commands', () => {
    const result = prefillTypeAndFields(cached({ command: 'uvx', args: ['voice-mode', '--port', '3000'] }))
    expect(result.type).toBe('command')
    expect(result.fields.command).toBe('uvx')
    expect(result.fields.args).toBe('voice-mode --port 3000')
  })

  it('falls back to command for npx without -y', () => {
    const result = prefillTypeAndFields(cached({ command: 'npx', args: ['@scope/pkg'] }))
    expect(result.type).toBe('command')
  })

  it('url takes priority over command', () => {
    const result = prefillTypeAndFields(cached({ url: 'https://example.com', command: 'npx', args: ['-y', 'pkg'] }))
    expect(result.type).toBe('http')
  })
})
