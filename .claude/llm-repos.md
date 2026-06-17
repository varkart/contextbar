# LLM Tool GitHub Repos

Used by `/check-llm-versions` to monitor for new releases and config path changes.

Format: Tool | manifest ID | GitHub repo | Release/changelog URL | Notes

| Tool | ID | GitHub Repo | Releases / Changelog | Notes |
|------|----|-------------|----------------------|-------|
| Claude Code | claude | https://github.com/anthropics/claude-code | https://github.com/anthropics/claude-code/releases | Open source |
| Cursor | cursor | n/a (closed source) | https://cursor.com/changelog | Check changelog for MCP/skills path changes |
| Gemini CLI | gemini | https://github.com/google-gemini/gemini-cli | https://github.com/google-gemini/gemini-cli/releases | Open source |
| Windsurf | windsurf | n/a (closed source) | https://windsurf.com/changelog | Check for MCP config path changes |
| Continue | continue | https://github.com/continuedev/continue | https://github.com/continuedev/continue/releases | Open source; config migrated to YAML in 0.9 |
| GitHub Copilot | copilot | n/a (closed source) | https://marketplace.visualstudio.com/items/GitHub.copilot-chat/changelog | VS Code extension; version from extension dir name |
| ChatGPT | chatgpt | n/a (closed source) | https://marketplace.visualstudio.com/items/openai.chatgpt/changelog | VS Code extension |
| Aider | aider | https://github.com/Aider-AI/aider | https://github.com/Aider-AI/aider/releases | Open source |
| Kiro | kiro | n/a (check AWS) | https://kiro.dev/changelog | Replaced Amazon Q; new tool, paths may change |
| Codex CLI | codex | https://github.com/openai/codex | https://github.com/openai/codex/releases | Open source |
| Zed | zed | https://github.com/zed-industries/zed | https://github.com/zed-industries/zed/releases | Open source |

## How to use

When running `/check-llm-versions`, fetch each GitHub release URL and scan release notes for:
- `mcp` — MCP config path or key changes
- `skill` — skills directory changes
- `config` — config file location changes  
- `breaking` — any breaking changes
- `migration` — migration guides that affect file paths

For closed-source tools, fetch the changelog URL and scan for the same keywords.

## Updating this file

When onboarding a new LLM via `/onboard-llm`, add a row here before committing.
The pre-commit hook warns if a new manifest is staged without a matching update to this file.
