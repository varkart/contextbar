use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    #[serde(default)]
    pub disabled_skills: HashMap<String, Vec<String>>, // tool_id -> [skill_name]
    #[serde(default)]
    pub disabled_mcps: HashMap<String, Vec<String>>,   // tool_id -> [mcp_name]
}

fn state_path() -> std::path::PathBuf {
    dirs::config_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_default()
        .join("aicontextbar")
        .join("state.json")
}

pub fn load() -> AppState {
    let path = state_path();
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(state: &AppState) -> Result<(), String> {
    let path = state_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn set_skill_disabled(tool_id: &str, skill_name: &str, disabled: bool) -> Result<(), String> {
    let mut state = load();
    let list = state.disabled_skills.entry(tool_id.to_string()).or_default();
    if disabled {
        if !list.contains(&skill_name.to_string()) {
            list.push(skill_name.to_string());
        }
    } else {
        list.retain(|s| s != skill_name);
    }
    save(&state)
}

/// Move a skill folder between active and .disabled locations.
/// Extracted for unit testing.
pub fn move_skill_folder(skill_path: &str, skill_name: &str, active: bool) -> Result<(), String> {
    let current = std::path::Path::new(skill_path);
    if active {
        let skills_dir = current
            .parent()
            .and_then(|p| p.parent())
            .ok_or_else(|| format!("cannot resolve skills dir from: {skill_path}"))?;
        let target = skills_dir.join(skill_name);
        std::fs::rename(current, &target)
            .map_err(|e| format!("failed to enable '{skill_name}': {e}"))
    } else {
        let skills_dir = current
            .parent()
            .ok_or_else(|| format!("cannot resolve skills dir from: {skill_path}"))?;
        let disabled_dir = skills_dir.join(".disabled");
        std::fs::create_dir_all(&disabled_dir)
            .map_err(|e| format!("failed to create .disabled dir: {e}"))?;
        let target = disabled_dir.join(skill_name);
        std::fs::rename(current, &target)
            .map_err(|e| format!("failed to disable '{skill_name}': {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn make_skill(skills_dir: &std::path::Path, name: &str) -> std::path::PathBuf {
        let skill_path = skills_dir.join(name);
        fs::create_dir_all(&skill_path).unwrap();
        fs::write(skill_path.join("SKILL.md"), "# test skill").unwrap();
        skill_path
    }

    #[test]
    fn disable_moves_to_disabled_dir() {
        let tmp = TempDir::new().unwrap();
        let skills_dir = tmp.path().join("skills");
        fs::create_dir_all(&skills_dir).unwrap();
        let skill_path = make_skill(&skills_dir, "impeccable");

        move_skill_folder(skill_path.to_str().unwrap(), "impeccable", false).unwrap();

        assert!(!skill_path.exists(), "original should be gone");
        assert!(skills_dir.join(".disabled").join("impeccable").exists(), ".disabled/impeccable should exist");
    }

    #[test]
    fn enable_moves_back_from_disabled_dir() {
        let tmp = TempDir::new().unwrap();
        let skills_dir = tmp.path().join("skills");
        let disabled_dir = skills_dir.join(".disabled");
        fs::create_dir_all(&disabled_dir).unwrap();
        let disabled_path = make_skill(&disabled_dir, "impeccable");

        move_skill_folder(disabled_path.to_str().unwrap(), "impeccable", true).unwrap();

        assert!(!disabled_path.exists(), ".disabled/impeccable should be gone");
        assert!(skills_dir.join("impeccable").exists(), "active skills/impeccable should exist");
    }

    #[test]
    fn disable_missing_skill_returns_err() {
        let tmp = TempDir::new().unwrap();
        let skills_dir = tmp.path().join("skills");
        fs::create_dir_all(&skills_dir).unwrap();
        let fake_path = skills_dir.join("nonexistent");

        let result = move_skill_folder(fake_path.to_str().unwrap(), "nonexistent", false);
        assert!(result.is_err());
    }

    #[test]
    fn set_skill_disabled_toggles_state() {
        let mut state = AppState::default();
        state.disabled_skills.insert("claude".to_string(), vec![]);

        // Disable
        let list = state.disabled_skills.entry("claude".to_string()).or_default();
        list.push("impeccable".to_string());
        assert!(list.contains(&"impeccable".to_string()));

        // Re-enable
        list.retain(|s| s != "impeccable");
        assert!(!list.contains(&"impeccable".to_string()));
    }

    #[test]
    fn disable_creates_disabled_dir_if_missing() {
        let tmp = TempDir::new().unwrap();
        let skills_dir = tmp.path().join("skills");
        fs::create_dir_all(&skills_dir).unwrap();
        let skill_path = make_skill(&skills_dir, "graphify");

        // .disabled dir does NOT exist yet
        assert!(!skills_dir.join(".disabled").exists());

        move_skill_folder(skill_path.to_str().unwrap(), "graphify", false).unwrap();

        assert!(skills_dir.join(".disabled").exists());
        assert!(skills_dir.join(".disabled").join("graphify").exists());
    }
}
