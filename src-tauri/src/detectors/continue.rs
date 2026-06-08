use crate::models::AiTool;
use super::parse_mcp_servers;

fn not_installed() -> AiTool {
    AiTool {
        id: "continue".to_string(),
        name: "Continue".to_string(),
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

    let continue_dir = home.join(".continue");
    if !continue_dir.is_dir() {
        return not_installed();
    }

    let install_path = continue_dir.to_string_lossy().to_string();

    // Read MCPs from ~/.continue/config.json → mcpServers object
    let config_path = continue_dir.join("config.json");
    let (mcps, error) = parse_mcps_from_config(&config_path);

    AiTool {
        id: "continue".to_string(),
        name: "Continue".to_string(),
        version: None,
        installed: true,
        install_path: Some(install_path),
        skills: vec![],
        mcps,
        error,
    }
}

fn parse_mcps_from_config(
    config_path: &std::path::Path,
) -> (Vec<crate::models::McpServer>, Option<String>) {
    let content = match std::fs::read_to_string(config_path) {
        Ok(s) => s,
        Err(_) => return (vec![], None),
    };
    let json: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(e) => {
            return (
                vec![],
                Some(format!("Failed to parse config.json: {}", e)),
            )
        }
    };
    let mcps = json
        .get("mcpServers")
        .map(|v| parse_mcp_servers(v, true))
        .unwrap_or_default();
    (mcps, None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn run_detect_in(tmp_home: &std::path::Path) -> AiTool {
        let continue_dir = tmp_home.join(".continue");
        if !continue_dir.is_dir() {
            return not_installed();
        }
        let install_path = continue_dir.to_string_lossy().to_string();
        let config_path = continue_dir.join("config.json");
        let (mcps, error) = parse_mcps_from_config(&config_path);
        AiTool {
            id: "continue".to_string(),
            name: "Continue".to_string(),
            version: None,
            installed: true,
            install_path: Some(install_path),
            skills: vec![],
            mcps,
            error,
        }
    }

    #[test]
    fn test_not_installed() {
        let tmp = TempDir::new().unwrap();
        let tool = run_detect_in(tmp.path());
        assert!(!tool.installed);
        assert!(tool.mcps.is_empty());
        assert!(tool.error.is_none());
    }

    #[test]
    fn test_installed_no_config() {
        let tmp = TempDir::new().unwrap();
        fs::create_dir_all(tmp.path().join(".continue")).unwrap();
        let tool = run_detect_in(tmp.path());
        assert!(tool.installed);
        assert!(tool.mcps.is_empty());
        assert!(tool.error.is_none());
    }

    #[test]
    fn test_mcps_parsed() {
        let tmp = TempDir::new().unwrap();
        let continue_dir = tmp.path().join(".continue");
        fs::create_dir_all(&continue_dir).unwrap();
        let config = serde_json::json!({
            "mcpServers": {
                "my-server": {
                    "command": "node",
                    "args": ["server.js"]
                }
            }
        });
        fs::write(
            continue_dir.join("config.json"),
            serde_json::to_string(&config).unwrap(),
        )
        .unwrap();
        let tool = run_detect_in(tmp.path());
        assert!(tool.installed);
        assert_eq!(tool.mcps.len(), 1);
        assert_eq!(tool.mcps[0].name, "my-server");
    }

    #[test]
    fn test_malformed_config() {
        let tmp = TempDir::new().unwrap();
        let continue_dir = tmp.path().join(".continue");
        fs::create_dir_all(&continue_dir).unwrap();
        fs::write(continue_dir.join("config.json"), "{ not valid json }").unwrap();
        let tool = run_detect_in(tmp.path());
        assert!(tool.installed);
        assert!(tool.error.is_some());
        assert!(tool.mcps.is_empty());
    }
}
