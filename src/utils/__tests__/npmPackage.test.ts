import { describe, it, expect } from 'vitest'
import { extractNpmPackage } from '../npmPackage'
import type { McpServer } from '../../types'

function mcp(command: string, args: string[]): McpServer {
  return { name: 'test', command, args, active: true, hasSecrets: false, secretKeyNames: [], sourceId: 'x' }
}

describe('extractNpmPackage', () => {
  it('returns null for non-npx commands', () => {
    expect(extractNpmPackage(mcp('node', ['server.js']))).toBeNull()
    expect(extractNpmPackage(mcp('python3', ['-m', 'mcp']))).toBeNull()
    expect(extractNpmPackage(mcp('', []))).toBeNull()
  })

  it('extracts simple package name', () => {
    expect(extractNpmPackage(mcp('npx', ['my-mcp-server']))).toBe('my-mcp-server')
  })

  it('extracts package name after -y flag', () => {
    expect(
      extractNpmPackage(mcp('npx', ['-y', '@modelcontextprotocol/server-github']))
    ).toBe('@modelcontextprotocol/server-github')
  })

  it('strips version specifier from scoped package', () => {
    expect(extractNpmPackage(mcp('npx', ['-y', '@scope/pkg@1.2.3']))).toBe('@scope/pkg')
  })

  it('keeps leading @ for scoped package without version', () => {
    expect(extractNpmPackage(mcp('npx', ['-y', '@anthropic/mcp-server']))).toBe('@anthropic/mcp-server')
  })

  it('skips -p flag value and takes next positional', () => {
    expect(extractNpmPackage(mcp('npx', ['-p', 'typescript', 'tsc']))).toBe('tsc')
  })

  it('skips --package flag value', () => {
    expect(extractNpmPackage(mcp('npx', ['--package', 'typescript', 'tsc']))).toBe('tsc')
  })

  it('skips --node-arg flag value', () => {
    expect(extractNpmPackage(mcp('npx', ['--node-arg', '--experimental-vm-modules', 'my-pkg']))).toBe('my-pkg')
  })

  it('returns null when no positional arg exists', () => {
    expect(extractNpmPackage(mcp('npx', []))).toBeNull()
    expect(extractNpmPackage(mcp('npx', ['-y', '--yes']))).toBeNull()
  })

  it('ignores extra args after package name', () => {
    expect(
      extractNpmPackage(mcp('npx', ['-y', '@modelcontextprotocol/server-filesystem', '/home/user']))
    ).toBe('@modelcontextprotocol/server-filesystem')
  })
})
