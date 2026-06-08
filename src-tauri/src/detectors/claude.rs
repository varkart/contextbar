use crate::models::{AiTool, Skill};
use super::{parse_all_mcp_servers, parse_skill_description};

fn not_installed() -> AiTool {
    AiTool {
        id: "claude".to_string(),
        name: "Claude Code".to_string(),
        version: None,
        installed: false,
        install_path: None,
        skills: vec![],
        mcps: vec![],
        error: None,
    }
}

pub fn detect() -> AiTool {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return not_installed(),
    };

    let claude_dir = home.join(".claude");
    if !claude_dir.is_dir() {
        return not_installed();
    }

    let install_path = claude_dir.to_string_lossy().to_string();

    // Read settings.json
    let settings_path = claude_dir.join("settings.json");
    let settings_str = match std::fs::read_to_string(&settings_path) {
        Ok(s) => Some(s),
        Err(_) => None,
    };

    let (version, mcps, error) = match settings_str {
        None => (None, vec![], None),
        Some(s) => {
            let parsed: Result<serde_json::Value, _> = serde_json::from_str(&s);
            match parsed {
                Err(e) => {
                    (None, vec![], Some(format!("Failed to parse settings.json: {}", e)))
                }
                Ok(json) => {
                    let version = json
                        .get("version")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());

                    let mcps = parse_all_mcp_servers(&json);

                    (version, mcps, None)
                }
            }
        }
    };

    // Parse skills from ~/.claude/skills/
    let skills_dir = claude_dir.join("skills");
    let skills = parse_skills_dir(&skills_dir);

    AiTool {
        id: "claude".to_string(),
        name: "Claude Code".to_string(),
        version,
        installed: true,
        install_path: Some(install_path),
        skills,
        mcps,
        error,
    }
}

fn parse_skills_dir(skills_dir: &std::path::Path) -> Vec<Skill> {
    let mut skills = Vec::new();

    // Active skills
    if let Ok(entries) = std::fs::read_dir(skills_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') { continue; }
            let path = entry.path();
            let description = parse_skill_description(&path);
            skills.push(Skill {
                name,
                path: path.to_string_lossy().to_string(),
                description,
                active: true,
            });
        }
    }

    // Disabled skills from .disabled/ subdir
    let disabled_dir = skills_dir.join(".disabled");
    if let Ok(entries) = std::fs::read_dir(&disabled_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') { continue; }
            let path = entry.path();
            let description = parse_skill_description(&path);
            skills.push(Skill {
                name,
                path: path.to_string_lossy().to_string(),
                description,
                active: false,
            });
        }
    }

    skills.sort_by(|a, b| a.name.cmp(&b.name));
    skills
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    /// Helper: run detect() with a custom home dir by temporarily overriding the
    /// search path. Since `dirs::home_dir()` reads the real home, we test the
    /// internal helpers directly instead.

    fn make_installed(tmp: &TempDir) -> std::path::PathBuf {
        let claude_dir = tmp.path().join(".claude");
        fs::create_dir_all(&claude_dir).unwrap();
        claude_dir
    }

    fn run_detect_in(tmp_home: &std::path::Path) -> AiTool {
        let claude_dir = tmp_home.join(".claude");
        if !claude_dir.is_dir() {
            return AiTool {
                id: "claude".to_string(),
                name: "Claude Code".to_string(),
                version: None,
                installed: false,
                install_path: None,
                skills: vec![],
                mcps: vec![],
                error: None,
            };
        }

        let install_path = claude_dir.to_string_lossy().to_string();

        let settings_path = claude_dir.join("settings.json");
        let settings_str = std::fs::read_to_string(&settings_path).ok();

        let (version, mcps, error) = match settings_str {
            None => (None, vec![], None),
            Some(s) => {
                let parsed: Result<serde_json::Value, _> = serde_json::from_str(&s);
                match parsed {
                    Err(e) => (
                        None,
                        vec![],
                        Some(format!("Failed to parse settings.json: {}", e)),
                    ),
                    Ok(json) => {
                        let version = json
                            .get("version")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        let mcps = super::parse_all_mcp_servers(&json);
                        (version, mcps, None)
                    }
                }
            }
        };

        let skills_dir = claude_dir.join("skills");
        let skills = super::parse_skills_dir(&skills_dir);

        AiTool {
            id: "claude".to_string(),
            name: "Claude Code".to_string(),
            version,
            installed: true,
            install_path: Some(install_path),
            skills,
            mcps,
            error,
        }
    }

    #[test]
    fn test_not_installed() {
        let tmp = TempDir::new().unwrap();
        // No .claude dir — simulate not installed
        let tool = run_detect_in(tmp.path());
        assert!(!tool.installed);
        assert!(tool.skills.is_empty());
        assert!(tool.mcps.is_empty());
        assert!(tool.error.is_none());
    }

    #[test]
    fn test_installed_no_config() {
        let tmp = TempDir::new().unwrap();
        make_installed(&tmp);
        let tool = run_detect_in(tmp.path());
        assert!(tool.installed);
        assert!(tool.mcps.is_empty());
        assert!(tool.error.is_none());
    }

    #[test]
    fn test_mcps_parsed() {
        let tmp = TempDir::new().unwrap();
        let claude_dir = make_installed(&tmp);
        let settings = serde_json::json!({
            "version": "1.2.3",
            "mcpServers": {
                "server1": {
                    "command": "npx",
                    "args": ["-y", "server1-pkg"]
                },
                "server2": {
                    "command": "python3",
                    "args": ["-m", "server2"]
                }
            }
        });
        fs::write(
            claude_dir.join("settings.json"),
            serde_json::to_string(&settings).unwrap(),
        )
        .unwrap();
        let tool = run_detect_in(tmp.path());
        assert!(tool.installed);
        assert_eq!(tool.mcps.len(), 2);
        assert_eq!(tool.version, Some("1.2.3".to_string()));
    }

    #[test]
    fn test_secrets_not_exposed() {
        let tmp = TempDir::new().unwrap();
        let claude_dir = make_installed(&tmp);
        let settings = serde_json::json!({
            "mcpServers": {
                "secret-server": {
                    "command": "node",
                    "args": ["server.js"],
                    "env": {
                        "TOKEN": "secret123",
                        "API_KEY": "supersecret"
                    }
                }
            }
        });
        fs::write(
            claude_dir.join("settings.json"),
            serde_json::to_string(&settings).unwrap(),
        )
        .unwrap();
        let tool = run_detect_in(tmp.path());
        assert_eq!(tool.mcps.len(), 1);
        let mcp = &tool.mcps[0];
        assert!(mcp.has_secrets);
        assert!(mcp.secret_key_names.contains(&"TOKEN".to_string()));
        assert!(mcp.secret_key_names.contains(&"API_KEY".to_string()));

        // Verify secret values are never in any serialized output
        let serialized = serde_json::to_string(&tool).unwrap();
        assert!(!serialized.contains("secret123"));
        assert!(!serialized.contains("supersecret"));
    }

    #[test]
    fn test_malformed_json() {
        let tmp = TempDir::new().unwrap();
        let claude_dir = make_installed(&tmp);
        fs::write(claude_dir.join("settings.json"), "{ this is not valid json }")
            .unwrap();
        let tool = run_detect_in(tmp.path());
        assert!(tool.installed);
        assert!(tool.error.is_some());
        assert!(tool.mcps.is_empty());
        assert!(tool.skills.is_empty());
    }

    // ── skill enable/disable detection ───────────────────────────────────────

    fn make_skill(skills_dir: &std::path::Path, name: &str) {
        let p = skills_dir.join(name);
        fs::create_dir_all(&p).unwrap();
        fs::write(p.join("SKILL.md"), format!("# {name}")).unwrap();
    }

    #[test]
    fn test_active_skills_detected() {
        let tmp = TempDir::new().unwrap();
        let claude_dir = make_installed(&tmp);
        let skills_dir = claude_dir.join("skills");
        fs::create_dir_all(&skills_dir).unwrap();
        make_skill(&skills_dir, "impeccable");
        make_skill(&skills_dir, "graphify");

        let tool = run_detect_in(tmp.path());
        assert_eq!(tool.skills.len(), 2);
        assert!(tool.skills.iter().all(|s| s.active));
    }

    #[test]
    fn test_disabled_skills_included_with_active_false() {
        let tmp = TempDir::new().unwrap();
        let claude_dir = make_installed(&tmp);
        let skills_dir = claude_dir.join("skills");
        let disabled_dir = skills_dir.join(".disabled");
        fs::create_dir_all(&skills_dir).unwrap();
        fs::create_dir_all(&disabled_dir).unwrap();
        make_skill(&skills_dir, "impeccable");      // active
        make_skill(&disabled_dir, "graphify");      // disabled

        let tool = run_detect_in(tmp.path());
        assert_eq!(tool.skills.len(), 2);

        let impeccable = tool.skills.iter().find(|s| s.name == "impeccable").unwrap();
        let graphify   = tool.skills.iter().find(|s| s.name == "graphify").unwrap();
        assert!(impeccable.active);
        assert!(!graphify.active);
    }

    #[test]
    fn test_disabled_skill_path_points_to_disabled_dir() {
        let tmp = TempDir::new().unwrap();
        let claude_dir = make_installed(&tmp);
        let skills_dir = claude_dir.join("skills");
        let disabled_dir = skills_dir.join(".disabled");
        fs::create_dir_all(&disabled_dir).unwrap();
        make_skill(&disabled_dir, "graphify");

        let tool = run_detect_in(tmp.path());
        let graphify = tool.skills.iter().find(|s| s.name == "graphify").unwrap();
        assert!(graphify.path.contains(".disabled"), "path must point inside .disabled/");
    }

    #[test]
    fn test_skills_sorted_alphabetically() {
        let tmp = TempDir::new().unwrap();
        let claude_dir = make_installed(&tmp);
        let skills_dir = claude_dir.join("skills");
        fs::create_dir_all(&skills_dir).unwrap();
        make_skill(&skills_dir, "zebra");
        make_skill(&skills_dir, "alpha");
        make_skill(&skills_dir, "mango");

        let tool = run_detect_in(tmp.path());
        let names: Vec<&str> = tool.skills.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, vec!["alpha", "mango", "zebra"]);
    }
}
