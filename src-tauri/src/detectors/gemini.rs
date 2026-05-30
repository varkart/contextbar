use crate::models::AiTool;
use super::parse_mcp_servers;

fn not_installed() -> AiTool {
    AiTool {
        id: "gemini".to_string(),
        name: "Gemini CLI".to_string(),
        version: None,
        installed: false,
        install_path: None,
        skills: vec![],
        mcps: vec![],
        error: None,
    }
}

pub fn detect() -> AiTool {
    // Check if `gemini` is on PATH
    let which = std::process::Command::new("which")
        .arg("gemini")
        .output();

    let installed = match which {
        Ok(out) => out.status.success(),
        Err(_) => false,
    };

    if !installed {
        return not_installed();
    }

    // Get version
    let version = std::process::Command::new("gemini")
        .arg("--version")
        .output()
        .ok()
        .and_then(|out| {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            stdout.lines().next().map(|l| l.trim().to_string())
        })
        .filter(|s| !s.is_empty());

    // MCPs from ~/.config/gemini/settings.json
    let (mcps, error) = read_mcps();

    AiTool {
        id: "gemini".to_string(),
        name: "Gemini CLI".to_string(),
        version,
        installed: true,
        install_path: None,
        skills: vec![],
        mcps,
        error,
    }
}

fn read_mcps() -> (Vec<crate::models::McpServer>, Option<String>) {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return (vec![], None),
    };
    let settings_path = home.join(".config").join("gemini").join("settings.json");
    let content = match std::fs::read_to_string(&settings_path) {
        Ok(s) => s,
        Err(_) => return (vec![], None),
    };
    let json: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(e) => return (vec![], Some(format!("Failed to parse gemini settings.json: {}", e))),
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

    #[test]
    fn test_not_installed_no_panic() {
        // We can't mock `which` in unit tests, but we can verify that
        // detect() runs without panicking regardless of system state.
        let _ = detect();
    }

    #[test]
    fn test_read_mcps_missing_file() {
        // Should return empty without panicking
        let (mcps, err) = read_mcps();
        // If no gemini settings file exists, should be empty (or have an error if malformed)
        // Just ensure no panic
        let _ = (mcps, err);
    }
}
