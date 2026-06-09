use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

/// Returns a per-path mutex so concurrent MCP toggles on the same config file
/// are serialized. Different config files get independent locks.
fn config_lock(path: &str) -> Arc<Mutex<()>> {
    static LOCKS: OnceLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> = OnceLock::new();
    let map = LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guard = map.lock().unwrap();
    guard
        .entry(path.to_string())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone()
}

/// Move an MCP entry between `mcpServers` and `disabledMcpServers` in a JSON config file.
/// Uses a per-file mutex to prevent concurrent read-modify-write races, and writes
/// via a temp file + atomic rename to prevent torn writes.
pub fn move_mcp_in_config(config_path: &str, mcp_name: &str, active: bool) -> Result<(), String> {
    let lock = config_lock(config_path);
    let _guard = lock.lock().unwrap();

    let content = std::fs::read_to_string(config_path)
        .map_err(|e| format!("cannot read {config_path}: {e}"))?;
    let mut json: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("cannot parse {config_path}: {e}"))?;

    let obj = json.as_object_mut().ok_or("config is not a JSON object")?;

    let src_key = if active { "disabledMcpServers" } else { "mcpServers" };
    let dst_key = if active { "mcpServers" } else { "disabledMcpServers" };

    let entry = obj
        .get_mut(src_key)
        .and_then(|v| v.as_object_mut())
        .and_then(|m| m.remove(mcp_name))
        .ok_or_else(|| format!("MCP '{mcp_name}' not found in {src_key}"))?;

    obj.entry(dst_key)
        .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()))
        .as_object_mut()
        .ok_or("destination section is not an object")?
        .insert(mcp_name.to_string(), entry);

    let updated = serde_json::to_string_pretty(&json)
        .map_err(|e| format!("serialization error: {e}"))?;

    // Atomic write: write to sibling temp file, then rename.
    // On the same filesystem (always true for config files) rename is atomic.
    let tmp_path = format!("{config_path}.tmp");
    std::fs::write(&tmp_path, &updated)
        .map_err(|e| format!("cannot write temp file: {e}"))?;
    std::fs::rename(&tmp_path, config_path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        format!("cannot atomically replace {config_path}: {e}")
    })?;

    Ok(())
}

/// Move a skill folder between active and .disabled locations.
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

    fn make_mcp_config(dir: &std::path::Path, filename: &str, json: serde_json::Value) -> String {
        let path = dir.join(filename);
        fs::write(&path, serde_json::to_string_pretty(&json).unwrap()).unwrap();
        path.to_string_lossy().to_string()
    }

    // ── move_skill_folder ────────────────────────────────────────────────────

    #[test]
    fn disable_moves_to_disabled_dir() {
        let tmp = TempDir::new().unwrap();
        let skills_dir = tmp.path().join("skills");
        fs::create_dir_all(&skills_dir).unwrap();
        let skill_path = make_skill(&skills_dir, "impeccable");

        move_skill_folder(skill_path.to_str().unwrap(), "impeccable", false).unwrap();

        assert!(!skill_path.exists());
        assert!(skills_dir.join(".disabled").join("impeccable").exists());
    }

    #[test]
    fn enable_moves_back_from_disabled_dir() {
        let tmp = TempDir::new().unwrap();
        let skills_dir = tmp.path().join("skills");
        let disabled_dir = skills_dir.join(".disabled");
        fs::create_dir_all(&disabled_dir).unwrap();
        let disabled_path = make_skill(&disabled_dir, "impeccable");

        move_skill_folder(disabled_path.to_str().unwrap(), "impeccable", true).unwrap();

        assert!(!disabled_path.exists());
        assert!(skills_dir.join("impeccable").exists());
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
    fn disable_creates_disabled_dir_if_missing() {
        let tmp = TempDir::new().unwrap();
        let skills_dir = tmp.path().join("skills");
        fs::create_dir_all(&skills_dir).unwrap();
        let skill_path = make_skill(&skills_dir, "graphify");

        assert!(!skills_dir.join(".disabled").exists());
        move_skill_folder(skill_path.to_str().unwrap(), "graphify", false).unwrap();

        assert!(skills_dir.join(".disabled").exists());
        assert!(skills_dir.join(".disabled").join("graphify").exists());
    }

    // ── move_mcp_in_config ───────────────────────────────────────────────────

    #[test]
    fn disable_mcp_moves_to_disabled_section() {
        let tmp = TempDir::new().unwrap();
        let config_path = make_mcp_config(&tmp.path(), "settings.json", serde_json::json!({
            "mcpServers": { "my-server": { "command": "npx", "args": [] } }
        }));

        move_mcp_in_config(&config_path, "my-server", false).unwrap();

        let content: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&config_path).unwrap()).unwrap();
        assert!(content["mcpServers"].get("my-server").is_none());
        assert!(content["disabledMcpServers"]["my-server"].is_object());
    }

    #[test]
    fn enable_mcp_moves_back_to_active_section() {
        let tmp = TempDir::new().unwrap();
        let config_path = make_mcp_config(&tmp.path(), "settings.json", serde_json::json!({
            "disabledMcpServers": { "my-server": { "command": "npx", "args": [] } }
        }));

        move_mcp_in_config(&config_path, "my-server", true).unwrap();

        let content: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&config_path).unwrap()).unwrap();
        assert!(content["disabledMcpServers"].get("my-server").is_none());
        assert!(content["mcpServers"]["my-server"].is_object());
    }

    #[test]
    fn move_mcp_missing_returns_err() {
        let tmp = TempDir::new().unwrap();
        let config_path = make_mcp_config(&tmp.path(), "settings.json", serde_json::json!({
            "mcpServers": {}
        }));

        let result = move_mcp_in_config(&config_path, "ghost", false);
        assert!(result.is_err());
    }

    #[test]
    fn concurrent_mcp_toggles_do_not_corrupt_config() {
        use std::sync::Arc;
        let tmp = TempDir::new().unwrap();
        // Two distinct MCPs in the same config file
        let config_path = Arc::new(make_mcp_config(&tmp.path(), "settings.json", serde_json::json!({
            "mcpServers": {
                "alpha": { "command": "npx", "args": [] },
                "beta":  { "command": "npx", "args": [] }
            }
        })));

        let p1 = config_path.clone();
        let p2 = config_path.clone();
        let t1 = std::thread::spawn(move || move_mcp_in_config(&p1, "alpha", false));
        let t2 = std::thread::spawn(move || move_mcp_in_config(&p2, "beta", false));

        t1.join().unwrap().unwrap();
        t2.join().unwrap().unwrap();

        let content: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(config_path.as_str()).unwrap()).unwrap();
        // Both MCPs must have moved — neither write should clobber the other
        assert!(content["mcpServers"].get("alpha").is_none());
        assert!(content["mcpServers"].get("beta").is_none());
        assert!(content["disabledMcpServers"]["alpha"].is_object());
        assert!(content["disabledMcpServers"]["beta"].is_object());
    }

    #[test]
    fn atomic_write_leaves_no_tmp_file_on_success() {
        let tmp = TempDir::new().unwrap();
        let config_path = make_mcp_config(&tmp.path(), "settings.json", serde_json::json!({
            "mcpServers": { "srv": { "command": "node", "args": [] } }
        }));

        move_mcp_in_config(&config_path, "srv", false).unwrap();

        assert!(!std::path::Path::new(&format!("{config_path}.tmp")).exists());
    }
}
