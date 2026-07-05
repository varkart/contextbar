use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

fn strip_jsonc(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let chars: Vec<char> = s.chars().collect();
    let len = chars.len();
    let mut i = 0;
    let mut in_string = false;

    while i < len {
        let c = chars[i];
        if in_string {
            if c == '\\' && i + 1 < len {
                out.push(c);
                out.push(chars[i + 1]);
                i += 2;
                continue;
            }
            if c == '"' {
                in_string = false;
            }
            out.push(c);
            i += 1;
        } else if c == '"' {
            in_string = true;
            out.push(c);
            i += 1;
        } else if c == '/' && i + 1 < len && chars[i + 1] == '/' {
            while i < len && chars[i] != '\n' {
                i += 1;
            }
        } else if c == '/' && i + 1 < len && chars[i + 1] == '*' {
            i += 2;
            while i + 1 < len && !(chars[i] == '*' && chars[i + 1] == '/') {
                i += 1;
            }
            i += 2;
        } else {
            out.push(c);
            i += 1;
        }
    }
    out
}

/// Returns a per-path mutex so concurrent MCP toggles on the same config file
/// are serialized. Different config files get independent locks.
fn config_lock(path: &str) -> Arc<Mutex<()>> {
    static LOCKS: OnceLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> = OnceLock::new();
    let map = LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guard = map.lock().unwrap_or_else(|e| e.into_inner());
    guard
        .entry(path.to_string())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone()
}

/// Move an MCP entry between `active_key` and `disabled_key` sections in a JSON config file.
/// Uses a per-file mutex to prevent concurrent read-modify-write races, and writes
/// via a temp file + atomic rename to prevent torn writes.
pub fn move_mcp_in_config(
    config_path: &str,
    mcp_name: &str,
    active: bool,
    active_key: &str,
    disabled_key: &str,
) -> Result<(), String> {
    let lock = config_lock(config_path);
    let _guard = lock.lock().unwrap_or_else(|e| e.into_inner());

    if let Err(e) = crate::backup::snapshot(config_path) {
        eprintln!("[backup] snapshot failed for {config_path}: {e}");
    }

    let content = std::fs::read_to_string(config_path)
        .map_err(|e| format!("cannot read {config_path}: {e}"))?;
    let stripped = strip_jsonc(&content);
    let mut json: serde_json::Value =
        serde_json::from_str(&stripped).map_err(|e| format!("cannot parse {config_path}: {e}"))?;

    let obj = json.as_object_mut().ok_or("config is not a JSON object")?;

    let src_key = if active { disabled_key } else { active_key };
    let dst_key = if active { active_key } else { disabled_key };

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

    let updated =
        serde_json::to_string_pretty(&json).map_err(|e| format!("serialization error: {e}"))?;

    // Atomic write: write to sibling temp file, then rename.
    // On the same filesystem (always true for config files) rename is atomic.
    let tmp_path = format!("{config_path}.tmp");
    std::fs::write(&tmp_path, &updated).map_err(|e| format!("cannot write temp file: {e}"))?;
    std::fs::rename(&tmp_path, config_path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        format!("cannot atomically replace {config_path}: {e}")
    })?;

    Ok(())
}

/// Set `disabled: true/false` on a specific server in a plugin's mcp_config.json.
/// Creates the file if it doesn't exist. Used to toggle plugin-sourced MCPs.
pub fn set_plugin_mcp_disabled(
    config_path: &str,
    mcp_name: &str,
    disabled: bool,
) -> Result<(), String> {
    let lock = config_lock(config_path);
    let _guard = lock.lock().unwrap_or_else(|e| e.into_inner());

    if let Err(e) = crate::backup::snapshot(config_path) {
        eprintln!("[backup] snapshot failed for {config_path}: {e}");
    }

    let mut json: serde_json::Value = if std::path::Path::new(config_path).exists() {
        let raw = std::fs::read_to_string(config_path)
            .map_err(|e| format!("cannot read {config_path}: {e}"))?;
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            serde_json::json!({"mcpServers": {}})
        } else {
            serde_json::from_str(trimmed).map_err(|e| format!("cannot parse {config_path}: {e}"))?
        }
    } else {
        serde_json::json!({"mcpServers": {}})
    };

    let servers = json
        .as_object_mut()
        .ok_or("mcp_config.json is not an object")?
        .entry("mcpServers")
        .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()))
        .as_object_mut()
        .ok_or("mcpServers is not an object")?;

    let entry = servers
        .entry(mcp_name.to_string())
        .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));

    if let Some(obj) = entry.as_object_mut() {
        if disabled {
            obj.insert("disabled".to_string(), serde_json::Value::Bool(true));
        } else {
            obj.remove("disabled");
            // Remove the entry entirely if it has no other fields
            if obj.is_empty() {
                servers.remove(mcp_name);
            }
        }
    }

    let updated =
        serde_json::to_string_pretty(&json).map_err(|e| format!("serialization error: {e}"))?;
    let tmp = format!("{config_path}.tmp");
    std::fs::write(&tmp, &updated).map_err(|e| format!("cannot write {tmp}: {e}"))?;
    std::fs::rename(&tmp, config_path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("cannot rename to {config_path}: {e}")
    })?;

    Ok(())
}

/// Toggle an extension in extension-enablement.json.
/// Disabled entries are preserved under a `_disabled` key so re-enabling
/// restores any previous overrides.
pub fn toggle_extension_active(
    enablement_path: &str,
    extension_name: &str,
    active: bool,
) -> Result<(), String> {
    let lock = config_lock(enablement_path);
    let _guard = lock.lock().unwrap_or_else(|e| e.into_inner());

    if let Err(e) = crate::backup::snapshot(enablement_path) {
        eprintln!("[backup] snapshot failed for {enablement_path}: {e}");
    }

    // Read existing file; start with empty object if missing
    let json_str = std::fs::read_to_string(enablement_path).unwrap_or_else(|_| "{}".to_string());
    let mut json: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("cannot parse {enablement_path}: {e}"))?;

    let obj = json
        .as_object_mut()
        .ok_or("enablement file is not a JSON object")?;

    if active {
        // Move from _disabled back to root
        let entry = obj
            .get_mut("_disabled")
            .and_then(|d| d.as_object_mut())
            .and_then(|m| m.remove(extension_name))
            .unwrap_or_else(|| serde_json::json!({}));
        obj.insert(extension_name.to_string(), entry);
    } else {
        // Move from root to _disabled (preserve any existing overrides)
        let entry = obj
            .remove(extension_name)
            .ok_or_else(|| format!("extension '{extension_name}' not found in enablement file"))?;
        obj.entry("_disabled")
            .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()))
            .as_object_mut()
            .ok_or("_disabled section is not an object")?
            .insert(extension_name.to_string(), entry);
    }

    let updated =
        serde_json::to_string_pretty(&json).map_err(|e| format!("serialization error: {e}"))?;

    // Ensure parent directory exists (file may not exist yet)
    if let Some(parent) = std::path::Path::new(enablement_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("cannot create dir: {e}"))?;
    }

    let tmp_path = format!("{enablement_path}.tmp");
    std::fs::write(&tmp_path, &updated).map_err(|e| format!("cannot write temp file: {e}"))?;
    std::fs::rename(&tmp_path, enablement_path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        format!("cannot atomically replace {enablement_path}: {e}")
    })?;

    Ok(())
}

/// Read-modify-write a config file's permissions section under the per-file mutex.
/// Takes a backup before writing. The caller provides a closure that mutates a
/// `AgentPermissions` value in place.
pub fn update_permissions_file(
    config_path: &str,
    mutate: impl FnOnce(&mut crate::permissions::AgentPermissions),
    permissions_key: &str,
    allow_key: &str,
    deny_key: &str,
) -> Result<(), String> {
    let lock = config_lock(config_path);
    let _guard = lock.lock().unwrap_or_else(|e| e.into_inner());

    if let Err(e) = crate::backup::snapshot(config_path) {
        eprintln!("[backup] snapshot failed for {config_path}: {e}");
    }

    // Read existing file or start with empty object
    let raw = std::fs::read_to_string(config_path).unwrap_or_else(|_| "{}".to_string());
    let mut json: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("cannot parse {config_path}: {e}"))?;

    let obj = json.as_object_mut().ok_or("config is not a JSON object")?;

    // Extract current permissions (default empty)
    let perms_val = obj.get(permissions_key).cloned().unwrap_or_default();
    let mut perms = crate::permissions::AgentPermissions {
        allow: perms_val
            .get(allow_key)
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default(),
        deny: perms_val
            .get(deny_key)
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default(),
    };

    mutate(&mut perms);

    // Write back — use Map to support dynamic key names (e.g. "allowed"/"exclude" for Gemini)
    let mut perms_obj = serde_json::Map::new();
    perms_obj.insert(allow_key.to_string(), serde_json::json!(perms.allow));
    perms_obj.insert(deny_key.to_string(), serde_json::json!(perms.deny));
    obj.insert(
        permissions_key.to_string(),
        serde_json::Value::Object(perms_obj),
    );

    let updated =
        serde_json::to_string_pretty(&json).map_err(|e| format!("serialization error: {e}"))?;

    if let Some(parent) = std::path::Path::new(config_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("cannot create dir: {e}"))?;
    }

    let tmp = format!("{config_path}.tmp");
    std::fs::write(&tmp, &updated).map_err(|e| format!("cannot write temp file: {e}"))?;
    std::fs::rename(&tmp, config_path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("cannot atomically replace {config_path}: {e}")
    })?;

    Ok(())
}

/// Move a skill folder between active and .disabled locations.
/// Add a new MCP entry to the `active_key` section of a JSON config file.
/// Returns Err if an entry with the same name already exists.
pub fn add_mcp_to_config(
    config_path: &str,
    active_key: &str,
    name: &str,
    entry: serde_json::Value,
) -> Result<(), String> {
    let lock = config_lock(config_path);
    let _guard = lock.lock().unwrap_or_else(|e| e.into_inner());

    if let Err(e) = crate::backup::snapshot(config_path) {
        eprintln!("[backup] snapshot failed for {config_path}: {e}");
    }

    let content = std::fs::read_to_string(config_path).unwrap_or_else(|_| "{}".to_string());
    let stripped = strip_jsonc(&content);
    let mut json: serde_json::Value =
        serde_json::from_str(&stripped).map_err(|e| format!("cannot parse {config_path}: {e}"))?;

    let obj = json.as_object_mut().ok_or("config is not a JSON object")?;
    let section = obj
        .entry(active_key)
        .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
    let map = section
        .as_object_mut()
        .ok_or("mcpServers is not a JSON object")?;

    if map.contains_key(name) {
        return Err(format!("MCP '{name}' already exists"));
    }
    map.insert(name.to_string(), entry);

    let updated =
        serde_json::to_string_pretty(&json).map_err(|e| format!("serialization error: {e}"))?;

    if let Some(parent) = std::path::Path::new(config_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("cannot create dir: {e}"))?;
    }

    let tmp_path = format!("{config_path}.tmp");
    std::fs::write(&tmp_path, &updated).map_err(|e| format!("cannot write temp file: {e}"))?;
    std::fs::rename(&tmp_path, config_path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        format!("cannot atomically replace {config_path}: {e}")
    })?;

    Ok(())
}

/// Remove an MCP entry from both `active_key` and optionally `disabled_key` sections.
pub fn remove_mcp_from_config(
    config_path: &str,
    active_key: &str,
    disabled_key: Option<&str>,
    name: &str,
) -> Result<(), String> {
    let lock = config_lock(config_path);
    let _guard = lock.lock().unwrap_or_else(|e| e.into_inner());

    if let Err(e) = crate::backup::snapshot(config_path) {
        eprintln!("[backup] snapshot failed for {config_path}: {e}");
    }

    let content = std::fs::read_to_string(config_path)
        .map_err(|e| format!("cannot read {config_path}: {e}"))?;
    let stripped = strip_jsonc(&content);
    let mut json: serde_json::Value =
        serde_json::from_str(&stripped).map_err(|e| format!("cannot parse {config_path}: {e}"))?;

    let obj = json.as_object_mut().ok_or("config is not a JSON object")?;

    let mut found = false;
    if let Some(section) = obj.get_mut(active_key).and_then(|v| v.as_object_mut()) {
        if section.remove(name).is_some() {
            found = true;
        }
    }
    if let Some(dk) = disabled_key {
        if let Some(section) = obj.get_mut(dk).and_then(|v| v.as_object_mut()) {
            if section.remove(name).is_some() {
                found = true;
            }
        }
    }

    if !found {
        return Err(format!("MCP '{name}' not found in config"));
    }

    let updated =
        serde_json::to_string_pretty(&json).map_err(|e| format!("serialization error: {e}"))?;

    let tmp_path = format!("{config_path}.tmp");
    std::fs::write(&tmp_path, &updated).map_err(|e| format!("cannot write temp file: {e}"))?;
    std::fs::rename(&tmp_path, config_path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        format!("cannot atomically replace {config_path}: {e}")
    })?;

    Ok(())
}

/// Add a new MCP entry under `active_key.name` in a TOML config file.
pub fn add_mcp_to_toml_config(
    config_path: &str,
    active_key: &str,
    name: &str,
    command: Option<&str>,
    args: &[String],
    url: Option<&str>,
) -> Result<(), String> {
    let lock = config_lock(config_path);
    let _guard = lock.lock().unwrap_or_else(|e| e.into_inner());

    if let Err(e) = crate::backup::snapshot(config_path) {
        eprintln!("[backup] snapshot failed for {config_path}: {e}");
    }

    let raw = std::fs::read_to_string(config_path).unwrap_or_default();
    let mut doc: toml::Value = if raw.trim().is_empty() {
        toml::Value::Table(toml::map::Map::new())
    } else {
        toml::from_str(&raw).map_err(|e| format!("cannot parse {config_path}: {e}"))?
    };

    let root = doc.as_table_mut().ok_or("TOML root is not a table")?;
    let section = root
        .entry(active_key)
        .or_insert_with(|| toml::Value::Table(toml::map::Map::new()));
    let map = section
        .as_table_mut()
        .ok_or("MCP section is not a TOML table")?;

    if map.contains_key(name) {
        return Err(format!("MCP '{name}' already exists"));
    }

    let mut entry = toml::map::Map::new();
    if let Some(u) = url {
        entry.insert("url".into(), toml::Value::String(u.to_string()));
    } else {
        if let Some(cmd) = command {
            entry.insert("command".into(), toml::Value::String(cmd.to_string()));
        }
        entry.insert(
            "args".into(),
            toml::Value::Array(
                args.iter()
                    .map(|a| toml::Value::String(a.clone()))
                    .collect(),
            ),
        );
    }
    map.insert(name.to_string(), toml::Value::Table(entry));

    let updated =
        toml::to_string_pretty(&doc).map_err(|e| format!("TOML serialization error: {e}"))?;

    if let Some(parent) = std::path::Path::new(config_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("cannot create dir: {e}"))?;
    }

    let tmp_path = format!("{config_path}.tmp");
    std::fs::write(&tmp_path, &updated).map_err(|e| format!("cannot write temp file: {e}"))?;
    std::fs::rename(&tmp_path, config_path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        format!("cannot atomically replace {config_path}: {e}")
    })?;

    Ok(())
}

/// Set a boolean field (e.g. `enabled`) on a TOML MCP entry to toggle it without moving sections.
pub fn toggle_toml_mcp_enabled(
    config_path: &str,
    active_key: &str,
    mcp_name: &str,
    active: bool,
    toggle_field: &str,
) -> Result<(), String> {
    let lock = config_lock(config_path);
    let _guard = lock.lock().unwrap_or_else(|e| e.into_inner());

    if let Err(e) = crate::backup::snapshot(config_path) {
        eprintln!("[backup] snapshot failed for {config_path}: {e}");
    }

    let raw = std::fs::read_to_string(config_path)
        .map_err(|e| format!("cannot read {config_path}: {e}"))?;
    let mut doc: toml::Value =
        toml::from_str(&raw).map_err(|e| format!("cannot parse {config_path}: {e}"))?;

    let entry = doc
        .as_table_mut()
        .and_then(|root| root.get_mut(active_key))
        .and_then(|section| section.as_table_mut())
        .and_then(|map| map.get_mut(mcp_name))
        .and_then(|entry| entry.as_table_mut())
        .ok_or_else(|| format!("MCP '{mcp_name}' not found in [{active_key}]"))?;

    entry.insert(toggle_field.to_string(), toml::Value::Boolean(active));

    let updated =
        toml::to_string_pretty(&doc).map_err(|e| format!("TOML serialization error: {e}"))?;

    let tmp_path = format!("{config_path}.tmp");
    std::fs::write(&tmp_path, &updated).map_err(|e| format!("cannot write temp file: {e}"))?;
    std::fs::rename(&tmp_path, config_path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        format!("cannot atomically replace {config_path}: {e}")
    })?;

    Ok(())
}

/// Move an MCP entry between `active_key` and `disabled_key` sections in a TOML config file.
pub fn move_mcp_in_toml_config(
    config_path: &str,
    mcp_name: &str,
    active: bool,
    active_key: &str,
    disabled_key: &str,
) -> Result<(), String> {
    let lock = config_lock(config_path);
    let _guard = lock.lock().unwrap_or_else(|e| e.into_inner());

    if let Err(e) = crate::backup::snapshot(config_path) {
        eprintln!("[backup] snapshot failed for {config_path}: {e}");
    }

    let raw = std::fs::read_to_string(config_path)
        .map_err(|e| format!("cannot read {config_path}: {e}"))?;
    let mut doc: toml::Value =
        toml::from_str(&raw).map_err(|e| format!("cannot parse {config_path}: {e}"))?;

    let root = doc.as_table_mut().ok_or("TOML root is not a table")?;

    let src_key = if active { disabled_key } else { active_key };
    let dst_key = if active { active_key } else { disabled_key };

    let entry = root
        .get_mut(src_key)
        .and_then(|v| v.as_table_mut())
        .and_then(|m| m.remove(mcp_name))
        .ok_or_else(|| format!("MCP '{mcp_name}' not found in [{src_key}]"))?;

    root.entry(dst_key.to_string())
        .or_insert_with(|| toml::Value::Table(toml::map::Map::new()))
        .as_table_mut()
        .ok_or("destination section is not a TOML table")?
        .insert(mcp_name.to_string(), entry);

    let updated =
        toml::to_string_pretty(&doc).map_err(|e| format!("TOML serialization error: {e}"))?;

    let tmp_path = format!("{config_path}.tmp");
    std::fs::write(&tmp_path, &updated).map_err(|e| format!("cannot write temp file: {e}"))?;
    std::fs::rename(&tmp_path, config_path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        format!("cannot atomically replace {config_path}: {e}")
    })?;

    Ok(())
}

/// Remove an MCP entry from `active_key.name` in a TOML config file.
pub fn remove_mcp_from_toml_config(
    config_path: &str,
    active_key: &str,
    name: &str,
) -> Result<(), String> {
    let lock = config_lock(config_path);
    let _guard = lock.lock().unwrap_or_else(|e| e.into_inner());

    if let Err(e) = crate::backup::snapshot(config_path) {
        eprintln!("[backup] snapshot failed for {config_path}: {e}");
    }

    let raw = std::fs::read_to_string(config_path)
        .map_err(|e| format!("cannot read {config_path}: {e}"))?;
    let mut doc: toml::Value =
        toml::from_str(&raw).map_err(|e| format!("cannot parse {config_path}: {e}"))?;

    let found = doc
        .as_table_mut()
        .and_then(|root| root.get_mut(active_key))
        .and_then(|s| s.as_table_mut())
        .map(|map| map.remove(name).is_some())
        .unwrap_or(false);

    if !found {
        return Err(format!("MCP '{name}' not found in config"));
    }

    let updated =
        toml::to_string_pretty(&doc).map_err(|e| format!("TOML serialization error: {e}"))?;

    let tmp_path = format!("{config_path}.tmp");
    std::fs::write(&tmp_path, &updated).map_err(|e| format!("cannot write temp file: {e}"))?;
    std::fs::rename(&tmp_path, config_path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        format!("cannot atomically replace {config_path}: {e}")
    })?;

    Ok(())
}

/// Upsert a `[[key_path]]` entry in a TOML config file to set skill enabled state.
/// Used by Codex: each skill has an entry in `[[skills.config]]` with `path` and `enabled`.
pub fn toggle_toml_config_skill(
    config_path: &str,
    key_path: &[String],
    path_field: &str,
    enabled_field: &str,
    skill_dir: &str,
    active: bool,
) -> Result<(), String> {
    let lock = config_lock(config_path);
    let _guard = lock.lock().unwrap_or_else(|e| e.into_inner());

    if let Err(e) = crate::backup::snapshot(config_path) {
        eprintln!("[backup] snapshot failed for {config_path}: {e}");
    }

    let raw = std::fs::read_to_string(config_path).unwrap_or_default();
    let mut doc: toml::Value = if raw.trim().is_empty() {
        toml::Value::Table(toml::map::Map::new())
    } else {
        toml::from_str(&raw).map_err(|e| format!("cannot parse {config_path}: {e}"))?
    };

    // For directory skills the config stores path/SKILL.md; for flat .md files just the file path.
    let skill_path_obj = std::path::Path::new(skill_dir);
    let skill_md = if skill_path_obj.is_dir() {
        format!("{skill_dir}/SKILL.md")
    } else {
        skill_dir.to_string()
    };
    // Stale key that may exist if a flat file was previously written with the wrong /SKILL.md suffix
    let stale_skill_md = if !skill_path_obj.is_dir() {
        Some(format!("{skill_dir}/SKILL.md"))
    } else {
        None
    };

    // Navigate to the array, creating intermediate tables as needed
    let array = navigate_or_create_toml_array(
        doc.as_table_mut().ok_or("TOML root is not a table")?,
        key_path,
    )?;

    // Remove stale entry with wrong /SKILL.md suffix if it exists (flat file bug cleanup)
    if let Some(ref stale) = stale_skill_md {
        array.retain(|e| e.get(path_field).and_then(|v| v.as_str()) != Some(stale.as_str()));
    }

    // Find existing entry for this skill path
    if let Some(entry) = array
        .iter_mut()
        .find(|e| e.get(path_field).and_then(|v| v.as_str()) == Some(&skill_md))
    {
        // Update in place
        if let Some(t) = entry.as_table_mut() {
            t.insert(enabled_field.to_string(), toml::Value::Boolean(active));
        }
    } else if !active {
        // Only add an entry when disabling (enabled is the default, no entry needed)
        let mut entry = toml::map::Map::new();
        entry.insert(path_field.to_string(), toml::Value::String(skill_md));
        entry.insert(enabled_field.to_string(), toml::Value::Boolean(false));
        array.push(toml::Value::Table(entry));
    }
    // If active=true and no existing entry, nothing to write (default is enabled)

    let updated =
        toml::to_string_pretty(&doc).map_err(|e| format!("TOML serialization error: {e}"))?;

    if let Some(parent) = std::path::Path::new(config_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("cannot create dir: {e}"))?;
    }
    let tmp_path = format!("{config_path}.tmp");
    std::fs::write(&tmp_path, &updated).map_err(|e| format!("cannot write temp file: {e}"))?;
    std::fs::rename(&tmp_path, config_path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        format!("cannot atomically replace {config_path}: {e}")
    })?;

    Ok(())
}

fn navigate_or_create_toml_array<'a>(
    mut table: &'a mut toml::map::Map<String, toml::Value>,
    key_path: &[String],
) -> Result<&'a mut Vec<toml::Value>, String> {
    if key_path.is_empty() {
        return Err("key_path is empty".to_string());
    }
    for key in &key_path[..key_path.len() - 1] {
        let entry = table
            .entry(key.clone())
            .or_insert_with(|| toml::Value::Table(toml::map::Map::new()));
        table = entry
            .as_table_mut()
            .ok_or_else(|| format!("'{key}' is not a TOML table"))?;
    }
    let last = key_path.last().unwrap();
    let entry = table
        .entry(last.clone())
        .or_insert_with(|| toml::Value::Array(vec![]));
    entry
        .as_array_mut()
        .ok_or_else(|| format!("'{last}' is not a TOML array"))
}

pub fn move_skill_folder(skill_path: &str, skill_name: &str, active: bool) -> Result<(), String> {
    let current = std::path::Path::new(skill_path);
    // Use the actual filename from the path — preserves `.md` extension for flat files.
    let fname = current
        .file_name()
        .ok_or_else(|| format!("cannot get file name from: {skill_path}"))?;
    if active {
        let skills_dir = current
            .parent()
            .and_then(|p| p.parent())
            .ok_or_else(|| format!("cannot resolve skills dir from: {skill_path}"))?;
        let target = skills_dir.join(fname);
        std::fs::rename(current, &target)
            .map_err(|e| format!("failed to enable '{skill_name}': {e}"))
    } else {
        let skills_dir = current
            .parent()
            .ok_or_else(|| format!("cannot resolve skills dir from: {skill_path}"))?;
        let disabled_dir = skills_dir.join(".disabled");
        std::fs::create_dir_all(&disabled_dir)
            .map_err(|e| format!("failed to create .disabled dir: {e}"))?;
        let target = disabled_dir.join(fname);
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

    // ── add_mcp_to_config ───────────────────────────────────────────────────

    #[test]
    fn add_mcp_inserts_entry_into_active_key() {
        let tmp = TempDir::new().unwrap();
        let config_path = make_mcp_config(
            tmp.path(),
            "settings.json",
            serde_json::json!({ "mcpServers": {} }),
        );

        add_mcp_to_config(
            &config_path,
            "mcpServers",
            "new-server",
            serde_json::json!({ "command": "npx", "args": ["-y", "new-server"] }),
        )
        .unwrap();

        let content: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&config_path).unwrap()).unwrap();
        assert_eq!(content["mcpServers"]["new-server"]["command"], "npx");
    }

    #[test]
    fn add_mcp_creates_active_key_when_missing() {
        let tmp = TempDir::new().unwrap();
        let config_path = make_mcp_config(tmp.path(), "settings.json", serde_json::json!({}));

        add_mcp_to_config(
            &config_path,
            "mcpServers",
            "srv",
            serde_json::json!({ "command": "node", "args": [] }),
        )
        .unwrap();

        let content: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&config_path).unwrap()).unwrap();
        assert!(content["mcpServers"]["srv"].is_object());
    }

    #[test]
    fn add_mcp_fails_when_name_already_exists() {
        let tmp = TempDir::new().unwrap();
        let config_path = make_mcp_config(
            tmp.path(),
            "settings.json",
            serde_json::json!({ "mcpServers": { "existing": { "command": "npx", "args": [] } } }),
        );

        let result = add_mcp_to_config(
            &config_path,
            "mcpServers",
            "existing",
            serde_json::json!({ "command": "node", "args": [] }),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already exists"));
    }

    #[test]
    fn add_mcp_creates_file_when_missing() {
        let tmp = TempDir::new().unwrap();
        let config_path = tmp
            .path()
            .join("settings.json")
            .to_string_lossy()
            .to_string();

        add_mcp_to_config(
            &config_path,
            "mcpServers",
            "brand-new",
            serde_json::json!({ "command": "npx", "args": [] }),
        )
        .unwrap();

        assert!(std::path::Path::new(&config_path).exists());
    }

    // ── remove_mcp_from_config ──────────────────────────────────────────────

    #[test]
    fn remove_mcp_removes_from_active_key() {
        let tmp = TempDir::new().unwrap();
        let config_path = make_mcp_config(
            tmp.path(),
            "settings.json",
            serde_json::json!({
                "mcpServers": { "target": { "command": "npx", "args": [] } }
            }),
        );

        remove_mcp_from_config(
            &config_path,
            "mcpServers",
            Some("disabledMcpServers"),
            "target",
        )
        .unwrap();

        let content: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&config_path).unwrap()).unwrap();
        assert!(content["mcpServers"].get("target").is_none());
    }

    #[test]
    fn remove_mcp_removes_from_disabled_key() {
        let tmp = TempDir::new().unwrap();
        let config_path = make_mcp_config(
            tmp.path(),
            "settings.json",
            serde_json::json!({
                "mcpServers": {},
                "disabledMcpServers": { "target": { "command": "npx", "args": [] } }
            }),
        );

        remove_mcp_from_config(
            &config_path,
            "mcpServers",
            Some("disabledMcpServers"),
            "target",
        )
        .unwrap();

        let content: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&config_path).unwrap()).unwrap();
        assert!(content["disabledMcpServers"].get("target").is_none());
    }

    #[test]
    fn remove_mcp_not_found_returns_err() {
        let tmp = TempDir::new().unwrap();
        let config_path = make_mcp_config(
            tmp.path(),
            "settings.json",
            serde_json::json!({ "mcpServers": {} }),
        );

        let result = remove_mcp_from_config(
            &config_path,
            "mcpServers",
            Some("disabledMcpServers"),
            "ghost",
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    #[test]
    fn remove_mcp_works_without_disabled_key() {
        let tmp = TempDir::new().unwrap();
        let config_path = make_mcp_config(
            tmp.path(),
            "settings.json",
            serde_json::json!({
                "mcpServers": { "srv": { "command": "npx", "args": [] } }
            }),
        );

        remove_mcp_from_config(&config_path, "mcpServers", None, "srv").unwrap();

        let content: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&config_path).unwrap()).unwrap();
        assert!(content["mcpServers"].get("srv").is_none());
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
        let config_path = make_mcp_config(
            tmp.path(),
            "settings.json",
            serde_json::json!({
                "mcpServers": { "my-server": { "command": "npx", "args": [] } }
            }),
        );

        move_mcp_in_config(
            &config_path,
            "my-server",
            false,
            "mcpServers",
            "disabledMcpServers",
        )
        .unwrap();

        let content: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&config_path).unwrap()).unwrap();
        assert!(content["mcpServers"].get("my-server").is_none());
        assert!(content["disabledMcpServers"]["my-server"].is_object());
    }

    #[test]
    fn enable_mcp_moves_back_to_active_section() {
        let tmp = TempDir::new().unwrap();
        let config_path = make_mcp_config(
            tmp.path(),
            "settings.json",
            serde_json::json!({
                "disabledMcpServers": { "my-server": { "command": "npx", "args": [] } }
            }),
        );

        move_mcp_in_config(
            &config_path,
            "my-server",
            true,
            "mcpServers",
            "disabledMcpServers",
        )
        .unwrap();

        let content: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&config_path).unwrap()).unwrap();
        assert!(content["disabledMcpServers"].get("my-server").is_none());
        assert!(content["mcpServers"]["my-server"].is_object());
    }

    #[test]
    fn move_mcp_missing_returns_err() {
        let tmp = TempDir::new().unwrap();
        let config_path = make_mcp_config(
            tmp.path(),
            "settings.json",
            serde_json::json!({
                "mcpServers": {}
            }),
        );

        let result = move_mcp_in_config(
            &config_path,
            "ghost",
            false,
            "mcpServers",
            "disabledMcpServers",
        );
        assert!(result.is_err());
    }

    #[test]
    fn concurrent_mcp_toggles_do_not_corrupt_config() {
        use std::sync::Arc;
        let tmp = TempDir::new().unwrap();
        // Two distinct MCPs in the same config file
        let config_path = Arc::new(make_mcp_config(
            tmp.path(),
            "settings.json",
            serde_json::json!({
                "mcpServers": {
                    "alpha": { "command": "npx", "args": [] },
                    "beta":  { "command": "npx", "args": [] }
                }
            }),
        ));

        let p1 = config_path.clone();
        let p2 = config_path.clone();
        let t1 = std::thread::spawn(move || {
            move_mcp_in_config(&p1, "alpha", false, "mcpServers", "disabledMcpServers")
        });
        let t2 = std::thread::spawn(move || {
            move_mcp_in_config(&p2, "beta", false, "mcpServers", "disabledMcpServers")
        });

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
        let config_path = make_mcp_config(
            tmp.path(),
            "settings.json",
            serde_json::json!({
                "mcpServers": { "srv": { "command": "node", "args": [] } }
            }),
        );

        move_mcp_in_config(
            &config_path,
            "srv",
            false,
            "mcpServers",
            "disabledMcpServers",
        )
        .unwrap();

        assert!(!std::path::Path::new(&format!("{config_path}.tmp")).exists());
    }

    // ── toggle_extension_active ──────────────────────────────────────────────

    fn make_enablement(dir: &std::path::Path, val: serde_json::Value) -> String {
        let path = dir.join("extension-enablement.json");
        fs::write(&path, serde_json::to_string_pretty(&val).unwrap()).unwrap();
        path.to_string_lossy().to_string()
    }

    #[test]
    fn disable_extension_moves_to_disabled_section() {
        let tmp = TempDir::new().unwrap();
        let path = make_enablement(
            tmp.path(),
            serde_json::json!({
                "my-ext": { "overrides": ["/Users/*"] }
            }),
        );

        toggle_extension_active(&path, "my-ext", false).unwrap();

        let content: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert!(content.get("my-ext").is_none());
        assert!(content["_disabled"]["my-ext"].is_object());
        assert_eq!(content["_disabled"]["my-ext"]["overrides"][0], "/Users/*");
    }

    #[test]
    fn enable_extension_restores_from_disabled_section() {
        let tmp = TempDir::new().unwrap();
        let path = make_enablement(
            tmp.path(),
            serde_json::json!({
                "_disabled": { "my-ext": { "overrides": ["/Users/*"] } }
            }),
        );

        toggle_extension_active(&path, "my-ext", true).unwrap();

        let content: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert!(content["my-ext"].is_object());
        assert_eq!(content["my-ext"]["overrides"][0], "/Users/*");
        assert!(content["_disabled"].get("my-ext").is_none());
    }

    #[test]
    fn enable_extension_not_in_disabled_uses_empty_entry() {
        let tmp = TempDir::new().unwrap();
        // No _disabled section — enabling adds an empty entry
        let path = make_enablement(tmp.path(), serde_json::json!({}));

        toggle_extension_active(&path, "new-ext", true).unwrap();

        let content: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert!(content["new-ext"].is_object());
    }

    #[test]
    fn disable_extension_missing_returns_err() {
        let tmp = TempDir::new().unwrap();
        let path = make_enablement(tmp.path(), serde_json::json!({}));

        let result = toggle_extension_active(&path, "ghost-ext", false);
        assert!(result.is_err());
    }

    #[test]
    fn toggle_extension_creates_file_when_missing_on_enable() {
        let tmp = TempDir::new().unwrap();
        let path = tmp
            .path()
            .join("extension-enablement.json")
            .to_string_lossy()
            .to_string();
        // File does not exist — enable should create it
        toggle_extension_active(&path, "new-ext", true).unwrap();

        let content: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert!(content["new-ext"].is_object());
    }

    // ── add_mcp_to_toml_config ────────────────────────────────────────────────

    fn make_toml(dir: &std::path::Path, filename: &str, content: &str) -> String {
        let path = dir.join(filename);
        fs::write(&path, content).unwrap();
        path.to_string_lossy().to_string()
    }

    #[test]
    fn toml_add_mcp_inserts_entry() {
        let tmp = TempDir::new().unwrap();
        let path = make_toml(tmp.path(), "config.toml", "[mcpServers]\n");

        add_mcp_to_toml_config(
            &path,
            "mcpServers",
            "my-server",
            Some("npx"),
            &["mcp-pkg".to_string()],
            None,
        )
        .unwrap();

        let raw = fs::read_to_string(&path).unwrap();
        let doc: toml::Value = toml::from_str(&raw).unwrap();
        assert_eq!(
            doc["mcpServers"]["my-server"]["command"].as_str(),
            Some("npx")
        );
        assert_eq!(
            doc["mcpServers"]["my-server"]["args"][0].as_str(),
            Some("mcp-pkg")
        );
    }

    #[test]
    fn toml_add_mcp_with_url() {
        let tmp = TempDir::new().unwrap();
        let path = make_toml(tmp.path(), "config.toml", "");

        add_mcp_to_toml_config(
            &path,
            "mcpServers",
            "http-server",
            None,
            &[],
            Some("https://mcp.example.com/sse"),
        )
        .unwrap();

        let raw = fs::read_to_string(&path).unwrap();
        let doc: toml::Value = toml::from_str(&raw).unwrap();
        assert_eq!(
            doc["mcpServers"]["http-server"]["url"].as_str(),
            Some("https://mcp.example.com/sse")
        );
        assert!(doc["mcpServers"]["http-server"].get("command").is_none());
    }

    #[test]
    fn toml_add_mcp_fails_when_already_exists() {
        let tmp = TempDir::new().unwrap();
        let path = make_toml(
            tmp.path(),
            "config.toml",
            "[mcpServers]\n[mcpServers.existing]\ncommand = \"npx\"\n",
        );

        let result =
            add_mcp_to_toml_config(&path, "mcpServers", "existing", Some("node"), &[], None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already exists"));
    }

    #[test]
    fn toml_add_mcp_creates_section_when_missing() {
        let tmp = TempDir::new().unwrap();
        let path = make_toml(tmp.path(), "config.toml", "");

        add_mcp_to_toml_config(
            &path,
            "mcpServers",
            "new-server",
            Some("uvx"),
            &["tool".to_string()],
            None,
        )
        .unwrap();

        let raw = fs::read_to_string(&path).unwrap();
        let doc: toml::Value = toml::from_str(&raw).unwrap();
        assert!(doc["mcpServers"]["new-server"].is_table());
    }

    // ── toggle_toml_mcp_enabled ───────────────────────────────────────────────

    #[test]
    fn toml_toggle_mcp_sets_enabled_false() {
        let tmp = TempDir::new().unwrap();
        let path = make_toml(
            tmp.path(),
            "config.toml",
            "[mcpServers.my-server]\ncommand = \"npx\"\nenabled = true\n",
        );

        toggle_toml_mcp_enabled(&path, "mcpServers", "my-server", false, "enabled").unwrap();

        let raw = fs::read_to_string(&path).unwrap();
        let doc: toml::Value = toml::from_str(&raw).unwrap();
        assert_eq!(
            doc["mcpServers"]["my-server"]["enabled"].as_bool(),
            Some(false)
        );
    }

    #[test]
    fn toml_toggle_mcp_sets_enabled_true() {
        let tmp = TempDir::new().unwrap();
        let path = make_toml(
            tmp.path(),
            "config.toml",
            "[mcpServers.my-server]\ncommand = \"npx\"\nenabled = false\n",
        );

        toggle_toml_mcp_enabled(&path, "mcpServers", "my-server", true, "enabled").unwrap();

        let raw = fs::read_to_string(&path).unwrap();
        let doc: toml::Value = toml::from_str(&raw).unwrap();
        assert_eq!(
            doc["mcpServers"]["my-server"]["enabled"].as_bool(),
            Some(true)
        );
    }

    #[test]
    fn toml_toggle_mcp_missing_server_returns_err() {
        let tmp = TempDir::new().unwrap();
        let path = make_toml(tmp.path(), "config.toml", "[mcpServers]\n");

        let result = toggle_toml_mcp_enabled(&path, "mcpServers", "ghost", false, "enabled");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    // ── move_mcp_in_toml_config ───────────────────────────────────────────────

    #[test]
    fn toml_disable_mcp_moves_to_disabled_section() {
        let tmp = TempDir::new().unwrap();
        let path = make_toml(
            tmp.path(),
            "config.toml",
            "[mcpServers.target]\ncommand = \"npx\"\n",
        );

        move_mcp_in_toml_config(&path, "target", false, "mcpServers", "disabledMcpServers")
            .unwrap();

        let raw = fs::read_to_string(&path).unwrap();
        let doc: toml::Value = toml::from_str(&raw).unwrap();
        assert!(doc["mcpServers"].get("target").is_none());
        assert!(doc["disabledMcpServers"]["target"].is_table());
    }

    #[test]
    fn toml_enable_mcp_moves_back_to_active_section() {
        let tmp = TempDir::new().unwrap();
        let path = make_toml(
            tmp.path(),
            "config.toml",
            "[disabledMcpServers.target]\ncommand = \"npx\"\n",
        );

        move_mcp_in_toml_config(&path, "target", true, "mcpServers", "disabledMcpServers").unwrap();

        let raw = fs::read_to_string(&path).unwrap();
        let doc: toml::Value = toml::from_str(&raw).unwrap();
        assert!(doc["disabledMcpServers"].get("target").is_none());
        assert!(doc["mcpServers"]["target"].is_table());
    }

    #[test]
    fn toml_move_mcp_missing_returns_err() {
        let tmp = TempDir::new().unwrap();
        let path = make_toml(tmp.path(), "config.toml", "[mcpServers]\n");

        let result =
            move_mcp_in_toml_config(&path, "ghost", false, "mcpServers", "disabledMcpServers");
        assert!(result.is_err());
    }

    // ── remove_mcp_from_toml_config ───────────────────────────────────────────

    #[test]
    fn toml_remove_mcp_deletes_entry() {
        let tmp = TempDir::new().unwrap();
        let path = make_toml(
            tmp.path(),
            "config.toml",
            "[mcpServers.target]\ncommand = \"npx\"\n",
        );

        remove_mcp_from_toml_config(&path, "mcpServers", "target").unwrap();

        let raw = fs::read_to_string(&path).unwrap();
        let doc: toml::Value = toml::from_str(&raw).unwrap();
        assert!(doc["mcpServers"].get("target").is_none());
    }

    #[test]
    fn toml_remove_mcp_missing_returns_err() {
        let tmp = TempDir::new().unwrap();
        let path = make_toml(tmp.path(), "config.toml", "[mcpServers]\n");

        let result = remove_mcp_from_toml_config(&path, "mcpServers", "ghost");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    #[test]
    fn set_plugin_mcp_disabled_creates_file_and_sets_flag() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("mcp_config.json");

        // Disable on non-existent file → creates file with disabled: true
        set_plugin_mcp_disabled(&path.to_string_lossy(), "postman", true).unwrap();
        let v: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(
            v["mcpServers"]["postman"]["disabled"],
            serde_json::Value::Bool(true)
        );

        // Re-enable → removes disabled flag, cleans up empty entry
        set_plugin_mcp_disabled(&path.to_string_lossy(), "postman", false).unwrap();
        let v: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert!(v["mcpServers"].get("postman").is_none());
    }

    #[test]
    fn set_plugin_mcp_disabled_preserves_existing_config() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("mcp_config.json");
        fs::write(
            &path,
            r#"{"mcpServers":{"postman":{"command":"npx","args":["@postman/mcp"]}}}"#,
        )
        .unwrap();

        set_plugin_mcp_disabled(&path.to_string_lossy(), "postman", true).unwrap();
        let v: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        // Existing command/args preserved
        assert_eq!(v["mcpServers"]["postman"]["command"], "npx");
        assert_eq!(
            v["mcpServers"]["postman"]["disabled"],
            serde_json::Value::Bool(true)
        );
    }

    #[test]
    fn toml_remove_preserves_other_entries() {
        let tmp = TempDir::new().unwrap();
        let path = make_toml(
            tmp.path(),
            "config.toml",
            "[mcpServers.keep]\ncommand = \"node\"\n[mcpServers.remove-me]\ncommand = \"npx\"\n",
        );

        remove_mcp_from_toml_config(&path, "mcpServers", "remove-me").unwrap();

        let raw = fs::read_to_string(&path).unwrap();
        let doc: toml::Value = toml::from_str(&raw).unwrap();
        assert!(doc["mcpServers"]["keep"].is_table());
        assert!(doc["mcpServers"].get("remove-me").is_none());
    }
}
