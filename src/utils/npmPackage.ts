import type { McpServer } from '../types'

/**
 * Extracts the npm package name from an npx-style MCP server definition.
 * Returns null for non-npx commands or when no package is identifiable.
 * Mirrors the logic in installer.rs::npm_package_from_mcp.
 */
export function extractNpmPackage(mcp: McpServer): string | null {
  if (mcp.command !== 'npx') return null
  let skipNext = false
  for (const arg of mcp.args) {
    if (skipNext) { skipNext = false; continue }
    if (arg === '-p' || arg === '--package' || arg === '--node-arg') { skipNext = true; continue }
    if (arg.startsWith('-')) continue
    const atIdx = arg.lastIndexOf('@')
    return atIdx > 0 ? arg.slice(0, atIdx) : arg
  }
  return null
}
