use super::parse_mcp_servers;
use crate::models::AiTool;

fn not_installed() -> AiTool {
    AiTool {
        id: "zed".to_string(),
        name: "Zed".to_string(),
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

    let settings_path = home.join(".config").join("zed").join("settings.json");
    let local_bin = home.join(".local").join("bin").join("zed");
    let app_bundle = std::path::Path::new("/Applications/Zed.app");

    let installed = settings_path.exists() || local_bin.exists() || app_bundle.exists();

    if !installed {
        return not_installed();
    }

    // Prefer the config file path as the install path; fall back to binary / app bundle
    let install_path = if settings_path.exists() {
        Some(settings_path.to_string_lossy().to_string())
    } else if local_bin.exists() {
        Some(local_bin.to_string_lossy().to_string())
    } else {
        Some(app_bundle.to_string_lossy().to_string())
    };

    // Read MCPs from settings.json → assistant.context_servers
    let (mcps, error) = if settings_path.exists() {
        parse_mcps_from_settings(&settings_path)
    } else {
        (vec![], None)
    };

    AiTool {
        id: "zed".to_string(),
        name: "Zed".to_string(),
        version: None,
        installed: true,
        install_path,
        skills: vec![],
        mcps,
        error,
    }
}

/// Parse context servers from Zed's settings.json.
///
/// The structure is:
/// ```json
/// {
///   "assistant": {
///     "context_servers": {
///       "server-name": {
///         "command": {
///           "path": "/usr/bin/node",
///           "args": ["server.js"]
///         }
///       }
///     }
///   }
/// }
/// ```
fn parse_mcps_from_settings(
    settings_path: &std::path::Path,
) -> (Vec<crate::models::McpServer>, Option<String>) {
    let content = match std::fs::read_to_string(settings_path) {
        Ok(s) => s,
        Err(_) => return (vec![], None),
    };
    let json: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(e) => {
            return (
                vec![],
                Some(format!("Failed to parse settings.json: {}", e)),
            )
        }
    };

    let context_servers = match json.get("assistant").and_then(|a| a.get("context_servers")) {
        Some(v) => v,
        None => return (vec![], None),
    };

    // Convert Zed's context_servers format to the generic mcpServers format
    // so we can reuse parse_mcp_servers.
    //
    // Zed:    { "name": { "command": { "path": "...", "args": [...] } } }
    // Generic: { "name": { "command": "...", "args": [...] } }
    let normalized = normalize_context_servers(context_servers);
    let mcps = parse_mcp_servers(&normalized);
    (mcps, None)
}

fn normalize_context_servers(servers: &serde_json::Value) -> serde_json::Value {
    let obj = match servers.as_object() {
        Some(o) => o,
        None => return serde_json::Value::Object(serde_json::Map::new()),
    };

    let mut normalized = serde_json::Map::new();
    for (name, cfg) in obj {
        let command_path = cfg
            .get("command")
            .and_then(|c| c.get("path"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let args = cfg
            .get("command")
            .and_then(|c| c.get("args"))
            .cloned()
            .unwrap_or(serde_json::Value::Array(vec![]));

        let env = cfg.get("command").and_then(|c| c.get("env")).cloned();

        let mut entry = serde_json::json!({
            "command": command_path,
            "args": args,
        });
        if let Some(env_val) = env {
            entry["env"] = env_val;
        }

        normalized.insert(name.clone(), entry);
    }
    serde_json::Value::Object(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn run_detect_in(tmp_home: &std::path::Path) -> AiTool {
        let settings_path = tmp_home.join(".config").join("zed").join("settings.json");
        let local_bin = tmp_home.join(".local").join("bin").join("zed");

        let installed = settings_path.exists() || local_bin.exists();
        if !installed {
            return not_installed();
        }

        let install_path = if settings_path.exists() {
            Some(settings_path.to_string_lossy().to_string())
        } else {
            Some(local_bin.to_string_lossy().to_string())
        };

        let (mcps, error) = if settings_path.exists() {
            parse_mcps_from_settings(&settings_path)
        } else {
            (vec![], None)
        };

        AiTool {
            id: "zed".to_string(),
            name: "Zed".to_string(),
            version: None,
            installed: true,
            install_path,
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
    }

    #[test]
    fn test_installed_via_local_bin() {
        let tmp = TempDir::new().unwrap();
        let bin_dir = tmp.path().join(".local").join("bin");
        fs::create_dir_all(&bin_dir).unwrap();
        fs::write(bin_dir.join("zed"), "").unwrap();
        let tool = run_detect_in(tmp.path());
        assert!(tool.installed);
        assert!(tool.mcps.is_empty());
    }

    #[test]
    fn test_installed_no_context_servers() {
        let tmp = TempDir::new().unwrap();
        let zed_dir = tmp.path().join(".config").join("zed");
        fs::create_dir_all(&zed_dir).unwrap();
        fs::write(
            zed_dir.join("settings.json"),
            serde_json::to_string(&serde_json::json!({"theme": "One Dark"})).unwrap(),
        )
        .unwrap();
        let tool = run_detect_in(tmp.path());
        assert!(tool.installed);
        assert!(tool.mcps.is_empty());
        assert!(tool.error.is_none());
    }

    #[test]
    fn test_context_servers_parsed() {
        let tmp = TempDir::new().unwrap();
        let zed_dir = tmp.path().join(".config").join("zed");
        fs::create_dir_all(&zed_dir).unwrap();
        let settings = serde_json::json!({
            "assistant": {
                "context_servers": {
                    "my-mcp": {
                        "command": {
                            "path": "/usr/bin/node",
                            "args": ["mcp-server.js"]
                        }
                    }
                }
            }
        });
        fs::write(
            zed_dir.join("settings.json"),
            serde_json::to_string(&settings).unwrap(),
        )
        .unwrap();
        let tool = run_detect_in(tmp.path());
        assert!(tool.installed);
        assert_eq!(tool.mcps.len(), 1);
        assert_eq!(tool.mcps[0].name, "my-mcp");
        assert_eq!(tool.mcps[0].command, "/usr/bin/node");
        assert_eq!(tool.mcps[0].args, vec!["mcp-server.js"]);
    }

    #[test]
    fn test_malformed_settings() {
        let tmp = TempDir::new().unwrap();
        let zed_dir = tmp.path().join(".config").join("zed");
        fs::create_dir_all(&zed_dir).unwrap();
        fs::write(zed_dir.join("settings.json"), "{ not valid }").unwrap();
        let tool = run_detect_in(tmp.path());
        assert!(tool.installed);
        assert!(tool.error.is_some());
        assert!(tool.mcps.is_empty());
    }
}
