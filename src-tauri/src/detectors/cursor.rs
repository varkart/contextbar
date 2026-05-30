use crate::models::{AiTool, Skill};
use super::{parse_mcp_servers, parse_skill_description};

fn not_installed() -> AiTool {
    AiTool {
        id: "cursor".to_string(),
        name: "Cursor".to_string(),
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

    let cursor_dir = home.join(".cursor");
    if !cursor_dir.is_dir() {
        return not_installed();
    }

    let install_path = cursor_dir.to_string_lossy().to_string();

    // Version from ~/.cursor/argv.json
    let version = read_version_from_argv(&cursor_dir);

    // Skills from ~/.cursor/skills-cursor/
    let skills_dir = cursor_dir.join("skills-cursor");
    let skills = parse_skills_dir(&skills_dir);

    // MCPs from ~/.cursor/mcp.json
    let mcp_path = cursor_dir.join("mcp.json");
    let (mcps, error) = parse_mcps_from_file(&mcp_path);

    AiTool {
        id: "cursor".to_string(),
        name: "Cursor".to_string(),
        version,
        installed: true,
        install_path: Some(install_path),
        skills,
        mcps,
        error,
    }
}

fn read_version_from_argv(cursor_dir: &std::path::Path) -> Option<String> {
    let argv_path = cursor_dir.join("argv.json");
    let content = std::fs::read_to_string(&argv_path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;
    json.get("version")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn parse_skills_dir(skills_dir: &std::path::Path) -> Vec<Skill> {
    let mut skills = Vec::new();
    let entries = match std::fs::read_dir(skills_dir) {
        Ok(e) => e,
        Err(_) => return skills,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let description = parse_skill_description(&path);
        skills.push(Skill {
            name,
            path: path.to_string_lossy().to_string(),
            description,
            active: true,
        });
    }
    skills
}

fn parse_mcps_from_file(path: &std::path::Path) -> (Vec<crate::models::McpServer>, Option<String>) {
    let content = match std::fs::read_to_string(path) {
        Ok(s) => s,
        Err(_) => return (vec![], None),
    };
    let json: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(e) => return (vec![], Some(format!("Failed to parse mcp.json: {}", e))),
    };
    let mcps = json
        .get("mcpServers")
        .map(|v| parse_mcp_servers(v))
        .unwrap_or_default();
    (mcps, None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn run_detect_in(tmp_home: &std::path::Path) -> AiTool {
        let cursor_dir = tmp_home.join(".cursor");
        if !cursor_dir.is_dir() {
            return not_installed();
        }
        let install_path = cursor_dir.to_string_lossy().to_string();
        let version = read_version_from_argv(&cursor_dir);
        let skills_dir = cursor_dir.join("skills-cursor");
        let skills = parse_skills_dir(&skills_dir);
        let mcp_path = cursor_dir.join("mcp.json");
        let (mcps, error) = parse_mcps_from_file(&mcp_path);
        AiTool {
            id: "cursor".to_string(),
            name: "Cursor".to_string(),
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
        let tool = run_detect_in(tmp.path());
        assert!(!tool.installed);
        assert!(tool.skills.is_empty());
        assert!(tool.mcps.is_empty());
    }

    #[test]
    fn test_no_panics_on_empty_dir() {
        let tmp = TempDir::new().unwrap();
        fs::create_dir_all(tmp.path().join(".cursor")).unwrap();
        let tool = run_detect_in(tmp.path());
        assert!(tool.installed);
        assert!(tool.mcps.is_empty());
        assert!(tool.skills.is_empty());
    }

    #[test]
    fn test_mcps_parsed() {
        let tmp = TempDir::new().unwrap();
        let cursor_dir = tmp.path().join(".cursor");
        fs::create_dir_all(&cursor_dir).unwrap();
        let mcp = serde_json::json!({
            "mcpServers": {
                "tool1": { "command": "npx", "args": ["-y", "tool1"] }
            }
        });
        fs::write(cursor_dir.join("mcp.json"), serde_json::to_string(&mcp).unwrap()).unwrap();
        let tool = run_detect_in(tmp.path());
        assert_eq!(tool.mcps.len(), 1);
    }
}
