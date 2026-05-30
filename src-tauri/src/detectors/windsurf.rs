use crate::models::AiTool;
use super::parse_mcp_servers;

fn not_installed() -> AiTool {
    AiTool {
        id: "windsurf".to_string(),
        name: "Windsurf".to_string(),
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

    let bin_path = home.join(".codeium").join("windsurf").join("bin").join("windsurf");
    if !bin_path.exists() {
        return not_installed();
    }

    let install_path = bin_path.to_string_lossy().to_string();

    // Version from ~/.windsurf/argv.json
    let version = read_version(&home);

    // MCPs from ~/Library/Application Support/Windsurf/User/settings.json
    let (mcps, error) = read_mcps(&home);

    AiTool {
        id: "windsurf".to_string(),
        name: "Windsurf".to_string(),
        version,
        installed: true,
        install_path: Some(install_path),
        skills: vec![],
        mcps,
        error,
    }
}

fn read_version(home: &std::path::Path) -> Option<String> {
    let argv_path = home.join(".windsurf").join("argv.json");
    let content = std::fs::read_to_string(&argv_path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;
    json.get("version")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn read_mcps(home: &std::path::Path) -> (Vec<crate::models::McpServer>, Option<String>) {
    let settings_path = home
        .join("Library")
        .join("Application Support")
        .join("Windsurf")
        .join("User")
        .join("settings.json");

    let content = match std::fs::read_to_string(&settings_path) {
        Ok(s) => s,
        Err(_) => return (vec![], None),
    };
    let json: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(e) => {
            return (
                vec![],
                Some(format!("Failed to parse Windsurf settings.json: {}", e)),
            )
        }
    };

    let mcps = json
        .get("mcp")
        .and_then(|v| v.get("servers"))
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
        let bin_path = tmp_home
            .join(".codeium")
            .join("windsurf")
            .join("bin")
            .join("windsurf");
        if !bin_path.exists() {
            return not_installed();
        }
        let install_path = bin_path.to_string_lossy().to_string();
        let version = read_version(tmp_home);
        let (mcps, error) = read_mcps(tmp_home);
        AiTool {
            id: "windsurf".to_string(),
            name: "Windsurf".to_string(),
            version,
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
        assert!(tool.skills.is_empty());
        assert!(tool.mcps.is_empty());
    }

    #[test]
    fn test_no_panics_on_empty_dir() {
        let tmp = TempDir::new().unwrap();
        let bin_dir = tmp
            .path()
            .join(".codeium")
            .join("windsurf")
            .join("bin");
        fs::create_dir_all(&bin_dir).unwrap();
        // Create the binary file (empty)
        fs::write(bin_dir.join("windsurf"), b"").unwrap();
        let tool = run_detect_in(tmp.path());
        assert!(tool.installed);
        assert!(tool.mcps.is_empty());
    }

    #[test]
    fn test_detect_no_panic() {
        let _ = detect();
    }
}
