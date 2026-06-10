---
name: check-llm-versions
description: Check GitHub releases for all tracked LLM tools and report which have new versions or changed config paths since last known state
---

# Check LLM Tool Versions

**Invoke:** `/check-llm-versions`

Reads `.claude/llm-repos.md`, fetches latest releases from GitHub for each tool, and reports any tools with new releases or version gaps that may affect manifest correctness.

---

## Steps

**1. Load the repo list**

Read `.claude/llm-repos.md`. For each row, note:
- Tool ID (maps to manifest filename)
- GitHub repo URL (if open source)
- Release page URL (fallback for closed-source)

**2. For each tool with a GitHub repo — fetch latest release**

Use WebFetch on `https://api.github.com/repos/<owner>/<repo>/releases/latest`

Extract:
- `tag_name` — latest release version
- `published_at` — release date
- `body` — release notes (scan for keywords: `mcp`, `skill`, `config`, `path`, `breaking`)

Flag if release notes mention:
- Changes to config file paths
- Changes to MCP key names
- New skills directory support
- Breaking changes to any file format

**3. For closed-source tools — fetch changelog page**

Use WebFetch on the changelog URL from `.claude/llm-repos.md`. Scan for:
- New version numbers
- Config path changes
- MCP or skills format changes

**4. Compare against current manifest**

For each tool, open `src-tauri/src/engine/manifests/<id>.toml` and check:
- Does the manifest have a `[version]` section? If not, note it.
- Do any `mcp_sources` paths or keys look outdated given release notes?
- If the latest release is much newer than the version we detect locally, flag it.

**5. Report**

Output a table:

```
Tool          | Latest Release | Manifest Status        | Action Needed
--------------|----------------|------------------------|-----------------------------
Claude Code   | 2.5.0          | version detected ✓     | none
Gemini CLI    | 0.1.12         | version detected ✓     | none
Continue      | 1.2.0          | no version detection   | add [version] to manifest
Aider         | 0.80.0         | version detected ✓     | check: release notes mention new config path
Codex CLI     | 0.3.0          | not installed locally  | manifest exists, verify paths
```

**6. For any tool with "Action Needed"**

Run `/onboard-llm <tool-id>` to re-research and update the manifest. Focus the research on what changed in the flagged release.

---

## Frequency

Run this:
- Before each release of aicontextbar
- When a major AI tool announces a new version
- When the app shows unexpected empty MCP or skills lists for a tool

---

## Adding a new tool to monitoring

After `/onboard-llm` completes, the tool should already be in `.claude/llm-repos.md`. If not, add it manually following the format in that file.
