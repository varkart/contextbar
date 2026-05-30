mod claude;
mod chatgpt;
mod copilot;
mod cursor;
mod gemini;
mod windsurf;

use crate::models::AiTool;

pub fn detect_all() -> Vec<AiTool> {
    vec![
        claude::detect(),
        cursor::detect(),
        gemini::detect(),
        copilot::detect(),
        windsurf::detect(),
        chatgpt::detect(),
    ]
}

/// Parse a skill description from a skill directory or file.
///
/// Tries `<skill_path>/SKILL.md`, then `<skill_path>.md`.
/// Looks for YAML frontmatter (--- ... ---) and extracts the `description:` field.
/// Falls back to the first non-empty, non-heading, non-separator line.
/// Truncates to 120 characters.
pub fn parse_skill_description(skill_path: &std::path::Path) -> Option<String> {
    let candidates = [
        skill_path.join("SKILL.md"),
        {
            let mut p = skill_path.to_path_buf();
            let stem = p.file_name()?.to_string_lossy().into_owned();
            p.set_file_name(format!("{}.md", stem));
            p
        },
    ];

    for candidate in &candidates {
        if !candidate.exists() {
            continue;
        }
        let content = std::fs::read_to_string(candidate).ok()?;
        let desc = extract_description(&content);
        if desc.is_some() {
            return desc;
        }
    }
    None
}

fn extract_description(content: &str) -> Option<String> {
    let lines: Vec<&str> = content.lines().collect();

    // Check for YAML frontmatter
    if lines.first().map(|l| l.trim()) == Some("---") {
        let end = lines[1..].iter().position(|l| l.trim() == "---");
        if let Some(end_idx) = end {
            let frontmatter = &lines[1..=end_idx];
            for line in frontmatter {
                let trimmed = line.trim();
                if let Some(rest) = trimmed.strip_prefix("description:") {
                    let val = rest.trim().trim_matches('"').trim_matches('\'').to_string();
                    if !val.is_empty() {
                        return Some(truncate(val, 120));
                    }
                }
            }
        }
    }

    // Fallback: first non-empty line that doesn't start with # or ---
    for line in &lines {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with("---") {
            continue;
        }
        return Some(truncate(trimmed.to_string(), 120));
    }

    None
}

fn truncate(s: String, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        s
    } else {
        s.chars().take(max_chars).collect()
    }
}

/// Parse MCP servers from a JSON value representing a `mcpServers` object.
/// Returns (mcps, error_string).
pub fn parse_mcp_servers(
    servers_obj: &serde_json::Value,
) -> Vec<crate::models::McpServer> {
    let mut mcps = Vec::new();
    if let Some(obj) = servers_obj.as_object() {
        for (name, cfg) in obj {
            let command = cfg
                .get("command")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let args: Vec<String> = cfg
                .get("args")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|a| a.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            let description = Some(format!(
                "{} {}",
                command,
                args.join(" ")
            ))
            .filter(|s| !s.trim().is_empty());

            let env = cfg.get("env");
            let (has_secrets, secret_key_names) = match env {
                Some(serde_json::Value::Object(env_map)) if !env_map.is_empty() => {
                    let keys: Vec<String> = env_map.keys().cloned().collect();
                    (true, keys)
                }
                _ => (false, vec![]),
            };

            mcps.push(crate::models::McpServer {
                name: name.clone(),
                command,
                args,
                description,
                active: true,
                has_secrets,
                secret_key_names,
            });
        }
    }
    mcps
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_parse_skill_description_frontmatter() {
        let dir = TempDir::new().unwrap();
        let skill_dir = dir.path().join("my_skill");
        fs::create_dir(&skill_dir).unwrap();
        fs::write(
            skill_dir.join("SKILL.md"),
            "---\ndescription: \"A test skill\"\n---\n# Heading\nsome content",
        )
        .unwrap();
        let desc = parse_skill_description(&skill_dir);
        assert_eq!(desc, Some("A test skill".to_string()));
    }

    #[test]
    fn test_parse_skill_description_fallback() {
        let dir = TempDir::new().unwrap();
        let skill_dir = dir.path().join("my_skill");
        fs::create_dir(&skill_dir).unwrap();
        fs::write(
            skill_dir.join("SKILL.md"),
            "# Heading\n\nThis is the first real line.",
        )
        .unwrap();
        let desc = parse_skill_description(&skill_dir);
        assert_eq!(desc, Some("This is the first real line.".to_string()));
    }

    #[test]
    fn test_parse_skill_description_not_found() {
        let dir = TempDir::new().unwrap();
        let skill_dir = dir.path().join("nonexistent");
        let desc = parse_skill_description(&skill_dir);
        assert!(desc.is_none());
    }

    #[test]
    fn test_truncate() {
        let s = "a".repeat(200);
        assert_eq!(truncate(s, 120).len(), 120);
    }
}
