// Synthetic, demo-quality data for the README gif recorder. Distinct from
// expanded-data.ts (which stays minimal and test-focused) — this one is
// tuned to look good on screen: more sessions, varied agents, full
// per-project/per-session token shapes, and a driver breakdown for the
// session the walkthrough drills into. No real paths or usernames —
// everything lives under /Users/demo.
import type { ExpandedMockData } from './tauri-mock'

const now = Date.now()
const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

export const demoFixture: ExpandedMockData = {
  sessions: [
    {
      agent: 'claude', sessionId: 'demo-claude-live', display: 'wire up the token drill-down panel',
      timestamp: now - 4 * MIN, project: '/Users/demo/contextbar', projectName: 'contextbar',
      totalTokens: 0, model: 'claude-sonnet-4-5', durationMinutes: null, isLive: true, errorCount: 0, promptCount: 9,
    },
    {
      agent: 'claude', sessionId: 'demo-claude-heavy', display: 'refactor the session driver attribution pass',
      timestamp: now - 2 * HOUR, project: '/Users/demo/contextbar', projectName: 'contextbar',
      totalTokens: 842_000, model: 'claude-sonnet-4-5', durationMinutes: 46, isLive: false, errorCount: 0, promptCount: 46,
    },
    {
      agent: 'codex', sessionId: 'demo-codex-1', display: 'add retry backoff to the payments client',
      timestamp: now - 5 * HOUR, project: '/Users/demo/checkout-service', projectName: 'checkout-service',
      totalTokens: 431_000, model: 'gpt-5-codex', durationMinutes: 22, isLive: false, errorCount: 0, promptCount: 12,
    },
    {
      agent: 'gemini', sessionId: 'demo-gemini-1', display: 'write integration tests for the CSV parser',
      timestamp: now - 9 * HOUR, project: '/Users/demo/data-pipeline', projectName: 'data-pipeline',
      totalTokens: 205_000, model: 'gemini-2.5-pro', durationMinutes: 15, isLive: false, errorCount: 0, promptCount: 7,
    },
    {
      agent: 'kiro', sessionId: 'demo-kiro-1', display: 'explain the MCP resources vs tools payload shape',
      timestamp: now - 1 * DAY, project: '/Users/demo/contextbar', projectName: 'contextbar',
      totalTokens: 88_000, model: null, durationMinutes: 6, isLive: false, errorCount: 0, promptCount: 3,
    },
    {
      agent: 'agy', sessionId: 'demo-agy-1', display: 'add weekday/weekend filters to the activity search',
      timestamp: now - 1 * DAY - 4 * HOUR, project: '/Users/demo/data-pipeline', projectName: 'data-pipeline',
      totalTokens: 132_000, model: null, durationMinutes: 18, isLive: false, errorCount: 0, promptCount: 8,
    },
    {
      agent: 'claude', sessionId: 'demo-claude-old', display: 'set up the release workflow and changelog',
      timestamp: now - 3 * DAY, project: '/Users/demo/checkout-service', projectName: 'checkout-service',
      totalTokens: 610_000, model: 'claude-opus-4-8', durationMinutes: 38, isLive: false, errorCount: 1, promptCount: 21,
    },
  ],

  sessionDetails: {
    'demo-claude-heavy': {
      agent: 'claude', sessionId: 'demo-claude-heavy',
      messages: [
        { role: 'user', content: [{ blockType: 'text', text: 'refactor the session driver attribution pass so it splits input and output', isError: false }], timestamp: now - 2 * HOUR, model: null, usage: null },
        { role: 'assistant', content: [{ blockType: 'tool_use', toolName: 'Read', toolInput: '{"file_path":"stats.rs"}', isError: false }], timestamp: now - 2 * HOUR + 4000, model: 'claude-sonnet-4-5', usage: null },
        { role: 'assistant', content: [{ blockType: 'text', text: 'Split compute_drivers into a per-agent attribution module with input/output sides.', isError: false }], timestamp: now - 2 * HOUR + 9000, model: 'claude-sonnet-4-5', usage: null },
      ],
      totalTokens: { inputTokens: 620_000, outputTokens: 222_000, cacheReadTokens: 380_000, cacheCreationTokens: 90_000 },
      model: 'claude-sonnet-4-5', durationMs: 46 * 60_000,
      project: '/Users/demo/contextbar', projectName: 'contextbar', timestamp: now - 2 * HOUR,
    },
    'demo-codex-1': {
      agent: 'codex', sessionId: 'demo-codex-1',
      messages: [
        { role: 'user', content: [{ blockType: 'text', text: 'add retry backoff to the payments client', isError: false }], timestamp: now - 5 * HOUR, model: null, usage: null },
        { role: 'assistant', content: [{ blockType: 'tool_use', toolName: 'exec_command', toolInput: '{"cmd":"rg retry src/payments"}', isError: false }], timestamp: now - 5 * HOUR + 5000, model: null, usage: null },
        { role: 'assistant', content: [{ blockType: 'text', text: 'Added exponential backoff with jitter, capped at 5 retries.', isError: false }], timestamp: now - 5 * HOUR + 9000, model: null, usage: null },
      ],
      totalTokens: { inputTokens: 300_000, outputTokens: 131_000, cacheReadTokens: 0, cacheCreationTokens: 0 },
      model: 'gpt-5-codex', durationMs: 22 * 60_000,
      project: '/Users/demo/checkout-service', projectName: 'checkout-service', timestamp: now - 5 * HOUR,
    },
  },

  sessionDrivers: {
    'demo-claude-heavy': {
      sessionId: 'demo-claude-heavy', model: 'claude-sonnet-4-5',
      inputTokens: 620_000, outputTokens: 222_000, totalCostUsd: 4.62, coarse: false,
      drivers: [
        { side: 'input', kind: 'tool', name: 'Read', calls: 14, tokens: 210_000, createdTokens: 58_000, rereadTokens: 152_000, approxCostUsd: 0.64, pct: 34, hint: 'Read added 34% of this session’s context — narrow it (offset/limit, head, tighter globs).' },
        { side: 'input', kind: 'growth', name: 'Conversation growth', calls: 0, tokens: 180_000, createdTokens: 48_000, rereadTokens: 132_000, approxCostUsd: 0.55, pct: 29, hint: null },
        { side: 'input', kind: 'initial', name: 'Initial prompt + system', calls: 0, tokens: 120_000, createdTokens: 120_000, rereadTokens: 0, approxCostUsd: 0.36, pct: 19, hint: null },
        { side: 'input', kind: 'skill', name: 'ship', calls: 1, tokens: 68_000, createdTokens: 14_000, rereadTokens: 54_000, approxCostUsd: 0.21, pct: 11, hint: null },
        { side: 'input', kind: 'prompt', name: 'Your prompts', calls: 0, tokens: 42_000, createdTokens: 42_000, rereadTokens: 0, approxCostUsd: 0.13, pct: 7, hint: null },
        { side: 'output', kind: 'answer', name: 'Written answers', calls: 0, tokens: 134_000, createdTokens: null, rereadTokens: null, approxCostUsd: 2.01, pct: 60, hint: null },
        { side: 'output', kind: 'edit', name: 'File edits', calls: 9, tokens: 58_000, createdTokens: null, rereadTokens: null, approxCostUsd: 0.87, pct: 26, hint: null },
        { side: 'output', kind: 'shell', name: 'Shell commands', calls: 4, tokens: 20_000, createdTokens: null, rereadTokens: null, approxCostUsd: 0.30, pct: 9, hint: null },
        { side: 'output', kind: 'search', name: 'Searches / reads', calls: 3, tokens: 10_000, createdTokens: null, rereadTokens: null, approxCostUsd: 0.15, pct: 5, hint: null },
      ],
    },
  },

  repos: [
    {
      repoName: 'contextbar', repoPath: '/Users/demo/contextbar', baseBranch: 'main',
      agentFiles: ['CLAUDE.md', '.mcp.json'], repoSkills: ['ship'],
      worktrees: [
        { path: '/Users/demo/contextbar', branch: 'main', isPrimary: true, isDetached: false, isDirty: false, ahead: 0, behind: 0, isMerged: false, lastCommitTs: Math.floor((now - 2 * HOUR) / 1000), lastCommitSubject: 'feat: input/output token attribution', hasRemote: true },
        { path: '/Users/demo/contextbar-wt-tokens', branch: 'feature/token-drilldown', isPrimary: false, isDetached: false, isDirty: true, ahead: 3, behind: 0, isMerged: false, lastCommitTs: Math.floor((now - 4 * MIN) / 1000), lastCommitSubject: 'wip: prompts column', hasRemote: false },
        { path: '/Users/demo/contextbar-wt-done', branch: 'feature/session-header', isPrimary: false, isDetached: false, isDirty: false, ahead: 0, behind: 1, isMerged: true, lastCommitTs: Math.floor((now - 2 * DAY) / 1000), lastCommitSubject: 'feat: card layout header', hasRemote: true },
      ],
      bareBranches: [
        { name: 'feature/queued-idea', isMerged: false, ahead: 2, lastCommitTs: Math.floor((now - 6 * DAY) / 1000), lastCommitSubject: 'wip: queued, not checked out', hasRemote: false },
      ],
      remoteBranches: [
        { name: 'feature/teammate-spike', remote: 'origin', lastCommitTs: Math.floor((now - 3 * DAY) / 1000), lastCommitSubject: 'spike: exploring a caching layer' },
      ],
    },
    {
      repoName: 'checkout-service', repoPath: '/Users/demo/checkout-service', baseBranch: 'main',
      agentFiles: ['AGENTS.md'], repoSkills: [],
      worktrees: [
        { path: '/Users/demo/checkout-service', branch: 'main', isPrimary: true, isDetached: false, isDirty: false, ahead: 0, behind: 0, isMerged: false, lastCommitTs: Math.floor((now - 5 * HOUR) / 1000), lastCommitSubject: 'fix: retry backoff jitter', hasRemote: true },
      ],
      bareBranches: [],
      remoteBranches: [],
    },
  ],

  insights: {
    sessionsAnalyzed: 7, inputTokens: 2_308_000, outputTokens: 665_000,
    cacheReadTokens: 1_400_000, cacheCreationTokens: 260_000, estCostUsd: 18.4,
    cacheReadRatio: 0.62, avgToolCalls: 27,
    perModel: [
      { model: 'claude-sonnet-4-5', sessions: 3, inputTokens: 1_100_000, outputTokens: 300_000, cacheReadTokens: 700_000, cacheCreationTokens: 150_000, estCostUsd: 9.8 },
      { model: 'claude-opus-4-8', sessions: 1, inputTokens: 400_000, outputTokens: 120_000, cacheReadTokens: 300_000, cacheCreationTokens: 60_000, estCostUsd: 5.2 },
      { model: 'gpt-5-codex', sessions: 1, inputTokens: 300_000, outputTokens: 131_000, cacheReadTokens: 0, cacheCreationTokens: 0, estCostUsd: 1.9 },
    ],
    perProject: [
      { project: '/Users/demo/contextbar', projectName: 'contextbar', tokens: 1_762_000, inputTokens: 1_240_000, outputTokens: 522_000, prompts: 58, sessions: 3, estCostUsd: 11.1 },
      { project: '/Users/demo/checkout-service', projectName: 'checkout-service', tokens: 1_041_000, inputTokens: 700_000, outputTokens: 341_000, prompts: 33, sessions: 2, estCostUsd: 5.9 },
      { project: '/Users/demo/data-pipeline', projectName: 'data-pipeline', tokens: 337_000, inputTokens: 230_000, outputTokens: 107_000, prompts: 15, sessions: 2, estCostUsd: 1.4 },
    ],
    perSession: [
      { sessionId: 'demo-claude-heavy', display: 'refactor the session driver attribution pass', project: '/Users/demo/contextbar', projectName: 'contextbar', agent: 'claude', model: 'claude-sonnet-4-5', ts: now - 2 * HOUR, tokens: 842_000, inputTokens: 620_000, outputTokens: 222_000, prompts: 46, estCostUsd: 4.62 },
      { sessionId: 'demo-claude-old', display: 'set up the release workflow and changelog', project: '/Users/demo/checkout-service', projectName: 'checkout-service', agent: 'claude', model: 'claude-opus-4-8', ts: now - 3 * DAY, tokens: 610_000, inputTokens: 430_000, outputTokens: 180_000, prompts: 21, estCostUsd: 5.2 },
      { sessionId: 'demo-codex-1', display: 'add retry backoff to the payments client', project: '/Users/demo/checkout-service', projectName: 'checkout-service', agent: 'codex', model: 'gpt-5-codex', ts: now - 5 * HOUR, tokens: 431_000, inputTokens: 300_000, outputTokens: 131_000, prompts: 12, estCostUsd: 1.9 },
      { sessionId: 'demo-gemini-1', display: 'write integration tests for the CSV parser', project: '/Users/demo/data-pipeline', projectName: 'data-pipeline', agent: 'gemini', model: 'gemini-2.5-pro', ts: now - 9 * HOUR, tokens: 205_000, inputTokens: 140_000, outputTokens: 65_000, prompts: 7, estCostUsd: 0.8 },
      { sessionId: 'demo-agy-1', display: 'add weekday/weekend filters to the activity search', project: '/Users/demo/data-pipeline', projectName: 'data-pipeline', agent: 'agy', model: null, ts: now - 1 * DAY - 4 * HOUR, tokens: 132_000, inputTokens: 90_000, outputTokens: 42_000, prompts: 8, estCostUsd: 0.6 },
      { sessionId: 'demo-kiro-1', display: 'explain the MCP resources vs tools payload shape', project: '/Users/demo/contextbar', projectName: 'contextbar', agent: 'kiro', model: null, ts: now - 1 * DAY, tokens: 88_000, inputTokens: 60_000, outputTokens: 28_000, prompts: 3, estCostUsd: 0.3 },
      { sessionId: 'demo-claude-live', display: 'wire up the token drill-down panel', project: '/Users/demo/contextbar', projectName: 'contextbar', agent: 'claude', model: 'claude-sonnet-4-5', ts: now - 4 * MIN, tokens: 0, inputTokens: 0, outputTokens: 0, prompts: 9, estCostUsd: null },
    ],
    toolCounts: [
      { name: 'Read', count: 96 }, { name: 'Edit', count: 61 }, { name: 'Bash', count: 44 }, { name: 'Grep', count: 28 },
    ],
    mcpToolCounts: [{ name: 'github', count: 22 }, { name: 'context7', count: 9 }],
    skillCounts: [{ name: 'ship', count: 5 }, { name: 'code-review', count: 2 }],
    heaviest: { sessionId: 'demo-claude-heavy', display: 'refactor the session driver attribution pass', tokens: 842_000 },
  },

  tokenPoints: Array.from({ length: 14 }, (_, i) => ({ tsMs: now - i * DAY, tokens: 180_000 + (i % 5) * 60_000 })),
  promptTimestamps: Array.from({ length: 50 }, (_, i) => now - i * 4 * HOUR),
  commitTimestamps: Array.from({ length: 24 }, (_, i) => Math.floor((now - i * 10 * HOUR) / 1000)),
  openPrs: [
    { number: 212, title: 'Input/output token attribution with a per-agent facade', url: 'https://github.com/demo/contextbar/pull/212', author: 'demo', isDraft: false },
    { number: 209, title: 'WIP: repo-scoped skills', url: 'https://github.com/demo/contextbar/pull/209', author: 'demo', isDraft: true },
  ],
  agentActivity: Array.from({ length: 24 }, (_, i) => ({
    tsMs: now - i * 14 * HOUR,
    agent: ['claude', 'codex', 'gemini', 'kiro', 'agy'][i % 5],
    minutes: 15 + (i % 6) * 12,
  })),
}
