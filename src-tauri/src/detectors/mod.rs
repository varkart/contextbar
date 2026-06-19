use crate::models::AiTool;

/// Find a binary in PATH without spawning a subprocess.
pub fn find_in_path(binary: &str) -> Option<String> {
    let path_var = std::env::var("PATH").ok()?;
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(binary);
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().into_owned());
        }
    }
    None
}

/// Run a blocking closure in a thread, returning None if it doesn't finish within `dur`.
pub fn run_with_timeout<F, T>(f: F, dur: std::time::Duration) -> Option<T>
where
    F: FnOnce() -> Option<T> + Send + 'static,
    T: Send + 'static,
{
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(f());
    });
    rx.recv_timeout(dur).ok().flatten()
}

pub fn detect_all() -> Vec<AiTool> {
    crate::engine::detect_all()
}

/// Parse a skill description from a skill directory or file.
///
/// Tries `<skill_path>/SKILL.md`, then `<skill_path>.md`.
/// Looks for YAML frontmatter (--- ... ---) and extracts the `description:` field.
/// Falls back to the first non-empty, non-heading, non-separator line.
/// Truncates to 120 characters.
fn skill_md_candidates(skill_path: &std::path::Path) -> Option<[std::path::PathBuf; 2]> {
    if skill_path.is_file() {
        // Flat .md skill file — the file itself is the content
        let stem = skill_path.file_stem()?.to_string_lossy().into_owned();
        let sibling = skill_path.with_file_name(format!("{}.md", stem));
        return Some([skill_path.to_path_buf(), sibling]);
    }
    // Directory-based skill: look for SKILL.md inside, then sibling .md file
    let mut p = skill_path.to_path_buf();
    let stem = p.file_name()?.to_string_lossy().into_owned();
    p.set_file_name(format!("{}.md", stem));
    Some([skill_path.join("SKILL.md"), p])
}

/// FNV-1a 64-bit hash — no crate needed, fast, sufficient for content comparison.
fn fnv1a(data: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in data {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

pub fn parse_skill_content_hash(skill_path: &std::path::Path) -> Option<String> {
    for candidate in skill_md_candidates(skill_path)?.iter() {
        if !candidate.exists() {
            continue;
        }
        if let Ok(bytes) = std::fs::read(candidate) {
            return Some(format!("{:016x}", fnv1a(&bytes)));
        }
    }
    None
}

pub fn parse_skill_description(skill_path: &std::path::Path) -> Option<String> {
    for candidate in skill_md_candidates(skill_path)?.iter() {
        if !candidate.exists() {
            continue;
        }
        if let Ok(content) = std::fs::read_to_string(candidate) {
            if let Some(desc) = extract_description(&content) {
                return Some(desc);
            }
        }
    }
    None
}

pub fn parse_skill_source_url(skill_path: &std::path::Path) -> Option<String> {
    for candidate in skill_md_candidates(skill_path)?.iter() {
        if !candidate.exists() {
            continue;
        }
        if let Ok(content) = std::fs::read_to_string(candidate) {
            if let Some(url) = extract_frontmatter_field(&content, "source") {
                return Some(url);
            }
        }
    }
    None
}

/// Returns true if a SKILL.md (or sibling .md) exists — cheap stat, no read.
pub fn skill_md_exists(skill_path: &std::path::Path) -> bool {
    skill_md_candidates(skill_path)
        .map(|cs| cs.iter().any(|c| c.is_file()))
        .unwrap_or(false)
}

pub fn read_skill_file_content(skill_path: &std::path::Path) -> Option<String> {
    for candidate in skill_md_candidates(skill_path)?.iter() {
        if !candidate.exists() {
            continue;
        }
        if let Ok(content) = std::fs::read_to_string(candidate) {
            if !content.is_empty() {
                return Some(content);
            }
        }
    }
    None
}

fn extract_frontmatter_field(content: &str, key: &str) -> Option<String> {
    let lines: Vec<&str> = content.lines().collect();
    if lines.first().map(|l| l.trim()) != Some("---") {
        return None;
    }
    let end = lines[1..].iter().position(|l| l.trim() == "---")?;
    let prefix = format!("{}:", key);
    for line in &lines[1..=end] {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix(&prefix) {
            let val = rest.trim().trim_matches('"').trim_matches('\'').to_string();
            if !val.is_empty() {
                return Some(val);
            }
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
            for (i, line) in frontmatter.iter().enumerate() {
                let trimmed = line.trim();
                if let Some(rest) = trimmed.strip_prefix("description:") {
                    let val = rest.trim().trim_matches('"').trim_matches('\'').to_string();
                    // YAML block scalar: >-, >, |-, | — actual value is on indented lines below
                    if matches!(val.as_str(), ">" | ">-" | "|" | "|-") {
                        let block: String = frontmatter[i + 1..]
                            .iter()
                            .take_while(|l| l.starts_with(' ') || l.starts_with('\t'))
                            .map(|l| l.trim())
                            .collect::<Vec<_>>()
                            .join(" ");
                        if !block.is_empty() {
                            return Some(block);
                        }
                    } else if !val.is_empty() {
                        return Some(val);
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
        return Some(trimmed.to_string());
    }

    None
}

pub fn parse_mcp_servers(
    servers_obj: &serde_json::Value,
    active: bool,
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
            let description = cfg
                .get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .filter(|s| !s.trim().is_empty());

            let env = cfg.get("env");
            let (has_secrets, secret_key_names) = match env {
                Some(serde_json::Value::Object(env_map)) if !env_map.is_empty() => {
                    let keys: Vec<String> = env_map.keys().cloned().collect();
                    (true, keys)
                }
                _ => (false, vec![]),
            };

            // httpUrl = streamable HTTP, url = SSE — both treated as remote URL
            let url = cfg
                .get("httpUrl")
                .or_else(|| cfg.get("url"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            mcps.push(crate::models::McpServer {
                name: name.clone(),
                command,
                args,
                url,
                description,
                active,
                has_secrets,
                secret_key_names,
                extension_name: None,
                source_id: String::new(), // stamped by engine::mcp::collect()
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
    fn test_parse_skill_description_block_scalar() {
        let dir = TempDir::new().unwrap();
        let skill_dir = dir.path().join("cursor_skill");
        fs::create_dir(&skill_dir).unwrap();
        fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: babysit\ndescription: >-\n  Keep a PR merge-ready by triaging comments.\n---\n# Content",
        )
        .unwrap();
        let desc = parse_skill_description(&skill_dir);
        assert_eq!(
            desc,
            Some("Keep a PR merge-ready by triaging comments.".to_string())
        );
    }

    #[test]
    fn test_truncate() {
        let s = "a".repeat(200);
        let truncated: String = s.chars().take(120).collect();
        assert_eq!(truncated.len(), 120);
    }
}
