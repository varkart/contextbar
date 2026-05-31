import type { AiTool } from './types'

export interface ToolMatch {
  tool: AiTool
  matchedSkills: Set<string>   // skill paths that matched
  matchedMcps: Set<string>     // mcp names that matched
  score: number
}

function scoreText(query: string, text: string | undefined): number {
  if (!text || !query) return 0
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (t === q) return 10
  if (t.startsWith(q)) return 7
  if (t.includes(q)) return 5
  // fuzzy: all query chars appear in order in text
  let qi = 0
  for (const c of t) {
    if (c === q[qi]) qi++
    if (qi === q.length) return 2
  }
  return 0
}

export function searchTools(tools: AiTool[], query: string): ToolMatch[] {
  if (!query.trim()) return tools.map(t => ({
    tool: t,
    matchedSkills: new Set<string>(),
    matchedMcps: new Set<string>(),
    score: 1,
  }))

  const results: ToolMatch[] = []

  for (const tool of tools) {
    const toolScore = Math.max(
      scoreText(query, tool.name) * 2,
      scoreText(query, tool.id) * 2,
    )

    const matchedSkills = new Set<string>()
    let skillScore = 0
    for (const skill of tool.skills) {
      const s = Math.max(
        scoreText(query, skill.name),
        scoreText(query, skill.description),
      )
      if (s > 0) {
        matchedSkills.add(skill.path)
        skillScore = Math.max(skillScore, s)
      }
    }

    const matchedMcps = new Set<string>()
    let mcpScore = 0
    for (const mcp of tool.mcps) {
      const s = Math.max(
        scoreText(query, mcp.name),
        scoreText(query, mcp.command),
        scoreText(query, mcp.description),
      )
      if (s > 0) {
        matchedMcps.add(mcp.name)
        mcpScore = Math.max(mcpScore, s)
      }
    }

    const totalScore = toolScore + skillScore + mcpScore
    if (totalScore > 0) {
      results.push({ tool, matchedSkills, matchedMcps, score: totalScore })
    }
  }

  return results.sort((a, b) => b.score - a.score)
}

export function highlight(text: string, query: string): Array<{ text: string; match: boolean }> {
  if (!query.trim()) return [{ text, match: false }]
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return [{ text, match: false }]
  return [
    { text: text.slice(0, idx), match: false },
    { text: text.slice(idx, idx + query.length), match: true },
    { text: text.slice(idx + query.length), match: false },
  ].filter(p => p.text.length > 0)
}
