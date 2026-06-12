use super::parse_mcp_servers;
use crate::models::AiTool;

const PREFIX: &str = "github.copilot-chat-";

fn not_installed() -> AiTool {
    AiTool {
        id: "copilot".to_string(),
        name: "GitHub Copilot".to_string(),
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

    let extensions_dir = home.join(".vscode").join("extensions");
    let (install_path, version) = find_latest_extension(&extensions_dir, PREFIX);

    if install_path.is_none() {
        return not_installed();
    }

    let (mcps, error) = read_mcps(&home);

    AiTool {
        id: "copilot".to_string(),
        name: "GitHub Copilot".to_string(),
        version,
        installed: true,
        install_path,
        skills: vec![],
        mcps,
        error,
    }
}

/// Find the extension directory matching `<prefix><version>` with the latest
/// version. Returns (install_path, version).
pub fn find_latest_extension(
    extensions_dir: &std::path::Path,
    prefix: &str,
) -> (Option<String>, Option<String>) {
    let entries = match std::fs::read_dir(extensions_dir) {
        Ok(e) => e,
        Err(_) => return (None, None),
    };

    let mut candidates: Vec<(String, String)> = Vec::new(); // (dirname, version)
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if let Some(ver) = name.strip_prefix(prefix) {
            if entry.path().is_dir() {
                candidates.push((name.clone(), ver.to_string()));
            }
        }
    }

    if candidates.is_empty() {
        return (None, None);
    }

    // Sort by version string — good enough for semver comparisons in practice
    candidates.sort_by(|a, b| {
        version_compare(&b.1, &a.1) // descending
    });

    let (best_name, best_ver) = &candidates[0];
    let path = extensions_dir.join(best_name).to_string_lossy().to_string();
    (Some(path), Some(best_ver.clone()))
}

/// Simple semver-like comparison: split by '.' and compare numerically.
fn version_compare(a: &str, b: &str) -> std::cmp::Ordering {
    let parse = |s: &str| -> Vec<u64> {
        s.split('.')
            .map(|p| p.parse::<u64>().unwrap_or(0))
            .collect()
    };
    let va = parse(a);
    let vb = parse(b);
    va.cmp(&vb)
}

fn read_mcps(home: &std::path::Path) -> (Vec<crate::models::McpServer>, Option<String>) {
    let settings_path = home
        .join("Library")
        .join("Application Support")
        .join("Code")
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
                Some(format!("Failed to parse VSCode settings.json: {}", e)),
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

    #[test]
    fn test_not_installed() {
        let tmp = TempDir::new().unwrap();
        // No .vscode/extensions dir
        let (path, ver) = find_latest_extension(tmp.path(), PREFIX);
        assert!(path.is_none());
        assert!(ver.is_none());
    }

    #[test]
    fn test_no_panics_on_empty_dir() {
        let tmp = TempDir::new().unwrap();
        let ext_dir = tmp.path().join("extensions");
        fs::create_dir_all(&ext_dir).unwrap();
        let (path, ver) = find_latest_extension(&ext_dir, PREFIX);
        assert!(path.is_none());
        assert!(ver.is_none());
    }

    #[test]
    fn test_finds_latest_version() {
        let tmp = TempDir::new().unwrap();
        let ext_dir = tmp.path().join("extensions");
        fs::create_dir_all(ext_dir.join("github.copilot-chat-0.23.1")).unwrap();
        fs::create_dir_all(ext_dir.join("github.copilot-chat-0.24.0")).unwrap();
        fs::create_dir_all(ext_dir.join("github.copilot-chat-0.22.5")).unwrap();
        let (path, ver) = find_latest_extension(&ext_dir, PREFIX);
        assert!(path.is_some());
        assert_eq!(ver, Some("0.24.0".to_string()));
    }

    #[test]
    fn test_detect_no_panic() {
        // Should never panic regardless of system state
        let _ = detect();
    }
}
