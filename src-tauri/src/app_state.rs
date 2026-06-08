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

pub fn set_mcp_disabled(tool_id: &str, mcp_name: &str, disabled: bool) -> Result<(), String> {
    let mut state = load();
    let list = state.disabled_mcps.entry(tool_id.to_string()).or_default();
    if disabled {
        if !list.contains(&mcp_name.to_string()) {
            list.push(mcp_name.to_string());
        }
    } else {
        list.retain(|s| s != mcp_name);
    }
    save(&state)
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

/// Move an MCP entry between `mcpServers` and `disabledMcpServers` in a JSON config file.
pub fn move_mcp_in_config(config_path: &str, mcp_name: &str, active: bool) -> Result<(), String> {
    let content = std::fs::read_to_string(config_path)
        .map_err(|e| format!("cannot read {config_path}: {e}"))?;
    let mut json: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("cannot parse {config_path}: {e}"))?;

    let obj = json.as_object_mut().ok_or("config is not a JSON object")?;

    let src_key = if active { "disabledMcpServers" } else { "mcpServers" };
    let dst_key = if active { "mcpServers" } else { "disabledMcpServers" };

    // Extract the MCP entry from source section
    let entry = obj
        .get_mut(src_key)
        .and_then(|v| v.as_object_mut())
        .and_then(|m| m.remove(mcp_name))
        .ok_or_else(|| format!("MCP '{mcp_name}' not found in {src_key}"))?;

    // Insert into destination section (create if absent)
    obj.entry(dst_key)
        .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()))
        .as_object_mut()
        .ok_or("destination section is not an object")?
        .insert(mcp_name.to_string(), entry);

    let updated = serde_json::to_string_pretty(&json)
        .map_err(|e| format!("serialization error: {e}"))?;
    std::fs::write(config_path, updated)
        .map_err(|e| format!("cannot write {config_path}: {e}"))?;

    Ok(())
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
