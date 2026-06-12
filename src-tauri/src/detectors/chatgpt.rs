use super::copilot::find_latest_extension;
use crate::models::AiTool;

const PREFIX: &str = "openai.chatgpt-";

fn not_installed() -> AiTool {
    AiTool {
        id: "chatgpt".to_string(),
        name: "ChatGPT".to_string(),
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

    AiTool {
        id: "chatgpt".to_string(),
        name: "ChatGPT".to_string(),
        version,
        installed: true,
        install_path,
        skills: vec![],
        mcps: vec![],
        error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn run_detect_in(tmp_home: &std::path::Path) -> AiTool {
        let extensions_dir = tmp_home.join(".vscode").join("extensions");
        let (install_path, version) = find_latest_extension(&extensions_dir, PREFIX);
        if install_path.is_none() {
            return not_installed();
        }
        AiTool {
            id: "chatgpt".to_string(),
            name: "ChatGPT".to_string(),
            version,
            installed: true,
            install_path,
            skills: vec![],
            mcps: vec![],
            error: None,
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
        let ext_dir = tmp.path().join(".vscode").join("extensions");
        fs::create_dir_all(&ext_dir).unwrap();
        let tool = run_detect_in(tmp.path());
        assert!(!tool.installed);
    }

    #[test]
    fn test_finds_extension() {
        let tmp = TempDir::new().unwrap();
        let ext_dir = tmp.path().join(".vscode").join("extensions");
        fs::create_dir_all(ext_dir.join("openai.chatgpt-1.0.0")).unwrap();
        let tool = run_detect_in(tmp.path());
        assert!(tool.installed);
        assert_eq!(tool.version, Some("1.0.0".to_string()));
    }

    #[test]
    fn test_detect_no_panic() {
        let _ = detect();
    }
}
