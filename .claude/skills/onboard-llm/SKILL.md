---
name: onboard-llm
description: Research and onboard a new LLM tool into LLM Manager — web research, manifest creation, version detection, validation, and release monitoring setup
---

# Onboard a New LLM Tool

**Invoke:** `/onboard-llm <tool-name>`

Works as both an interactive slash command and is validated by the pre-commit hook at `scripts/pre-commit-check.sh`.

---

## Phase 1 — Research (required before writing any code)

Do web searches for each of the following. Do not proceed to Phase 2 until all are answered.

**1.1 Installation paths on macOS**
- [ ] Where does the tool install on macOS? (`~/.toolname/`, `/Applications/`, `~/Library/`, binary in PATH)
- [ ] Is there a stable detection path (dir, file, or binary name) that exists only when the tool is installed?
- [ ] Does the install path differ between brew install vs official installer vs VS Code extension?

**1.2 MCP server config**
- [ ] Does the tool support MCP servers?
- [ ] What file stores MCP config? (exact path, e.g. `~/.tool/mcp.json`)
- [ ] What is the JSON/YAML/TOML key that holds the server map? (e.g. `mcpServers`, `servers`, `mcp.servers`)
- [ ] Is there a separate key for disabled servers?
- [ ] Is the file JSON, JSONC (with `//` comments), YAML, or TOML?
- [ ] Are there multiple config files (workspace + global)?

**1.3 Skills / slash commands**
- [ ] Does the tool support user-defined skills or slash commands stored as files?
- [ ] What directory? (e.g. `~/.tool/skills/`)
- [ ] What file format? (SKILL.md with YAML frontmatter, JSON manifest, plain markdown)
- [ ] Is there a disabled/inactive subdirectory convention?

**1.4 Version detection**
- [ ] Does the tool have a `--version` flag? What does the output look like?
- [ ] Is there a JSON file on disk that stores the installed version? (e.g. `~/.tool/argv.json`)
- [ ] For VS Code extensions: version is in the extension dir name suffix

**1.5 Version history of config paths**
- [ ] Has the MCP config path or key name changed across versions?
- [ ] Has the skills directory changed across versions?
- [ ] If yes: what version introduced each change? (needed for min_version / max_version gating)
- [ ] Check the tool's GitHub releases and CHANGELOG for path changes

**Research sources to check (in order):**
1. Official docs site
2. GitHub repo in `.claude/llm-repos.md` — check README, CHANGELOG, releases
3. Web search: `"<tool-name>" "mcp" "config" "path" site:github.com OR site:docs.<tool>.com`
4. Web search: `"<tool-name>" skills directory path`

---

## Phase 2 — Manifest Creation

**2.1 Check no conflict**
- [ ] No existing manifest with this ID: `ls src-tauri/src/engine/manifests/`
- [ ] Chosen `id` is lowercase, no spaces, matches the filename you'll create

**2.2 Create manifest file**

Create `src-tauri/src/engine/manifests/<id>.toml`. Required fields:

```toml
schema_version = 1
id = "<id>"          # must match filename exactly
name = "<Human Name>"

[[detection]]
type = "binary"      # or "dir", "file", "vscode_extension"
name = "<binary>"    # or path = "~/.tool/"

[version]
type = "command"     # or "json_key"
binary = "<binary>"
args = ["--version"]
timeout_ms = 1500
parse = "first_token"  # or "first_line"

# Add [[mcp_sources]] only if tool supports MCP
[[mcp_sources]]
type = "json_key_pair"   # or yaml_key_pair, toml_key_pair, json_nested
file = "~/.tool/mcp.json"
active_key = "mcpServers"
# disabled_key = "disabledMcpServers"   # if applicable
# jsonc = true                           # if file allows // comments

# Add [[skill_sources]] only if tool has skills dirs
[[skill_sources]]
type = "directory"
path = "~/.tool/skills"
disabled_subdir = ".disabled"   # if applicable
```

**2.3 Version gating** — if config paths changed across versions:

```toml
[[mcp_sources]]
type = "json_key_pair"
file = "~/.tool/new-mcp.json"
min_version = "3.0"             # only applies >= 3.0

[[mcp_sources]]
type = "json_key_pair"
file = "~/.tool/old-mcp.json"
max_version = "2.99"            # fallback for older installs
```

**2.4 Register in engine**
- [ ] Add `("<id>", manifest_toml!("<id>"))` to `all_manifest_strs()` in `src-tauri/src/engine/mod.rs`

---

## Phase 3 — Validation

Run each check and confirm it passes:

- [ ] `source "$HOME/.cargo/env" && cargo check` — no errors
- [ ] `source "$HOME/.cargo/env" && cargo test` — all pass, especially `all_manifests_parse_without_error` and `all_manifests_have_correct_id`
- [ ] Manifest `id` field matches filename (the test catches this)
- [ ] Tool installed locally? Run `npm run tauri dev` briefly and confirm tool appears in the UI with correct name and version
- [ ] Version detection: if tool installed, confirm version string appears (not blank)
- [ ] MCP sources: if tool installed and has MCPs configured, confirm they appear
- [ ] Skills: if tool installed and has skills, confirm they appear

---

## Phase 4 — Release Monitoring Setup

- [ ] Find the tool's GitHub repo (or release notes page if closed-source)
- [ ] Add an entry to `.claude/llm-repos.md`:

```markdown
| Tool Name | <id> | https://github.com/org/repo | https://github.com/org/repo/releases | note if closed-source |
```

- [ ] If no public GitHub repo, add the changelog/release notes URL instead

---

## Phase 5 — Commit

- [ ] Stage manifest file, updated `mod.rs`, and updated `.claude/llm-repos.md`
- [ ] Commit message format: `add <name> manifest — MCP via <path>, skills via <path>`
- [ ] Pre-commit hook will warn if anything is missing (non-blocking)

---

## Quick reference — source types

| Format | Source type | Use when |
|--------|-------------|----------|
| JSON `{ "mcpServers": {...} }` | `json_key_pair` | Claude, Cursor, most tools |
| JSON nested at key path | `json_nested` | Windsurf, Copilot (VS Code settings) |
| JSONC (with `//` comments) | `json_key_pair` + `jsonc = true` | Gemini settings.json |
| YAML | `yaml_key_pair` | Continue.dev config.yaml |
| TOML | `toml_key_pair` | Codex config.toml |
| Zed context_servers schema | `zed_context_servers` | Zed only |
| Extension dir with manifests | `extension_dir` | Gemini extensions |
| Claude plugin system | `claude_plugins` | Claude Code plugins only |
