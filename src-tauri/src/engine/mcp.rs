use crate::models::McpServer;
use crate::detectors::parse_mcp_servers;
use super::manifest::McpSourceSpec;
use super::resolve::{expand_home, replace_var};
use super::jsonc::strip_comments;

pub fn collect(sources: &[McpSourceSpec], home: &std::path::Path) -> (Vec<McpServer>, Option<String>) {
    let mut all = Vec::new();
    let mut first_error: Option<String> = None;

    for source in sources {
        let (mcps, err) = read_source(source, home);
        all.extend(mcps);
        if first_error.is_none() {
            first_error = err;
        }
    }

    all.sort_by(|a, b| a.name.cmp(&b.name));
    (all, first_error)
}

fn read_source(source: &McpSourceSpec, home: &std::path::Path) -> (Vec<McpServer>, Option<String>) {
    match source {
        McpSourceSpec::JsonKeyPair { file, active_key, disabled_key, jsonc } => {
            read_json_key_pair(
                &expand_home(file, home),
                active_key,
                disabled_key.as_deref(),
                *jsonc,
            )
        }
        McpSourceSpec::JsonNested { file, key_path, jsonc } => {
            read_json_nested(&expand_home(file, home), key_path, *jsonc)
        }
        McpSourceSpec::ZedContextServers { file, key_path } => {
            read_zed_context_servers(&expand_home(file, home), key_path)
        }
        McpSourceSpec::ExtensionDir { dir, manifest_file, enablement_file, extension_path_var } => {
            read_extension_dir(
                &expand_home(dir, home),
                manifest_file,
                enablement_file.as_deref().map(|f| expand_home(f, home)).as_deref(),
                extension_path_var.as_deref(),
            )
        }
        McpSourceSpec::ClaudePlugins { installed_plugins_file, mcp_filename } => {
            read_claude_plugins(&expand_home(installed_plugins_file, home), mcp_filename)
        }
        McpSourceSpec::YamlKeyPair { file, active_key } => {
            read_yaml_key_pair(&expand_home(file, home), active_key)
        }
        McpSourceSpec::TomlKeyPair { file, active_key } => {
            read_toml_key_pair(&expand_home(file, home), active_key)
        }
    }
}

fn parse_json(path: &std::path::Path, jsonc: bool) -> Result<serde_json::Value, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|e| format!("cannot read {}: {}", path.display(), e))?;
    let content = if jsonc { strip_comments(&raw) } else { raw };
    serde_json::from_str(&content)
        .map_err(|e| format!("cannot parse {}: {}", path.display(), e))
}

fn read_json_key_pair(
    path: &std::path::Path,
    active_key: &str,
    disabled_key: Option<&str>,
    jsonc: bool,
) -> (Vec<McpServer>, Option<String>) {
    if !path.exists() {
        return (vec![], None);
    }
    let json = match parse_json(path, jsonc) {
        Ok(v) => v,
        Err(e) => return (vec![], Some(e)),
    };

    let mut mcps = Vec::new();
    if let Some(active) = json.get(active_key) {
        mcps.extend(parse_mcp_servers(active, true));
    }
    if let Some(key) = disabled_key {
        if let Some(disabled) = json.get(key) {
            mcps.extend(parse_mcp_servers(disabled, false));
        }
    }
    (mcps, None)
}

fn read_json_nested(
    path: &std::path::Path,
    key_path: &[String],
    jsonc: bool,
) -> (Vec<McpServer>, Option<String>) {
    if !path.exists() {
        return (vec![], None);
    }
    let json = match parse_json(path, jsonc) {
        Ok(v) => v,
        Err(e) => return (vec![], Some(e)),
    };

    // Navigate the key path
    let mut node = &json;
    for key in key_path {
        match node.get(key) {
            Some(v) => node = v,
            None => return (vec![], None),
        }
    }
    (parse_mcp_servers(node, true), None)
}

fn read_zed_context_servers(
    path: &std::path::Path,
    key_path: &[String],
) -> (Vec<McpServer>, Option<String>) {
    if !path.exists() {
        return (vec![], None);
    }
    let json = match parse_json(path, false) {
        Ok(v) => v,
        Err(e) => return (vec![], Some(e)),
    };

    let mut node = &json;
    for key in key_path {
        match node.get(key) {
            Some(v) => node = v,
            None => return (vec![], None),
        }
    }

    // Zed schema: { "name": { "command": { "path": "...", "args": [...], "env": {...} } } }
    // Normalize to generic: { "name": { "command": "...", "args": [...] } }
    let normalized = normalize_zed_servers(node);
    (parse_mcp_servers(&normalized, true), None)
}

fn normalize_zed_servers(servers: &serde_json::Value) -> serde_json::Value {
    let obj = match servers.as_object() {
        Some(o) => o,
        None => return serde_json::Value::Object(serde_json::Map::new()),
    };
    let mut out = serde_json::Map::new();
    for (name, cfg) in obj {
        let path = cfg.get("command").and_then(|c| c.get("path"))
            .and_then(|v| v.as_str()).unwrap_or("").to_string();
        let args = cfg.get("command").and_then(|c| c.get("args"))
            .cloned().unwrap_or(serde_json::Value::Array(vec![]));
        let mut entry = serde_json::json!({ "command": path, "args": args });
        if let Some(env) = cfg.get("command").and_then(|c| c.get("env")) {
            entry["env"] = env.clone();
        }
        out.insert(name.clone(), entry);
    }
    serde_json::Value::Object(out)
}

fn read_extension_dir(
    dir: &std::path::Path,
    manifest_file: &str,
    enablement_file: Option<&std::path::Path>,
    extension_path_var: Option<&str>,
) -> (Vec<McpServer>, Option<String>) {
    if !dir.is_dir() {
        return (vec![], None);
    }

    // Load enablement map: extension_name → enabled
    let enablement = load_enablement(enablement_file);

    let mut mcps = Vec::new();

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return (vec![], None),
    };

    for entry in entries.flatten() {
        let ext_dir = entry.path();
        if !ext_dir.is_dir() {
            continue;
        }
        let ext_name = entry.file_name().to_string_lossy().to_string();
        if ext_name.starts_with('.') {
            continue;
        }

        let manifest_path = ext_dir.join(manifest_file);
        if !manifest_path.exists() {
            continue;
        }

        let content = match std::fs::read_to_string(&manifest_path) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let manifest: serde_json::Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let active = enablement.as_ref()
            .map(|e| e.contains_key(&ext_name))
            .unwrap_or(true); // if no enablement file, all active

        let servers_val = match manifest.get("mcpServers") {
            Some(v) => v,
            None => continue,
        };

        let ext_path_str = ext_dir.to_string_lossy();

        // Resolve headers secrets and httpUrl for each server
        let obj = match servers_val.as_object() {
            Some(o) => o,
            None => continue,
        };

        for (name, cfg) in obj {
            let url = cfg.get("httpUrl").and_then(|v| v.as_str()).map(|s| s.to_string());

            // Resolve ${extensionPath} in command args
            let command = cfg.get("command").and_then(|v| v.as_str())
                .map(|s| maybe_replace_var(s, extension_path_var, &ext_path_str))
                .unwrap_or_default();

            let args: Vec<String> = cfg.get("args")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|a| a.as_str())
                        .map(|s| maybe_replace_var(s, extension_path_var, &ext_path_str))
                        .collect()
                })
                .unwrap_or_default();

            let description = cfg.get("description").and_then(|v| v.as_str())
                .map(|s| s.to_string()).filter(|s| !s.trim().is_empty());

            // Secrets: headers object (e.g. Authorization: Bearer $TOKEN)
            let headers = cfg.get("headers");
            let (has_secrets, secret_key_names) = match headers {
                Some(serde_json::Value::Object(h)) if !h.is_empty() => {
                    let keys: Vec<String> = h.keys().cloned().collect();
                    (true, keys)
                }
                _ => {
                    // Also check env
                    match cfg.get("env") {
                        Some(serde_json::Value::Object(e)) if !e.is_empty() => {
                            (true, e.keys().cloned().collect())
                        }
                        _ => (false, vec![])
                    }
                }
            };

            mcps.push(McpServer {
                name: name.clone(),
                command,
                args,
                url,
                description,
                active,
                has_secrets,
                secret_key_names,
                extension_name: Some(ext_name.clone()),
            });
        }
    }

    mcps.sort_by(|a, b| a.name.cmp(&b.name));
    (mcps, None)
}

fn load_enablement(
    path: Option<&std::path::Path>,
) -> Option<std::collections::HashMap<String, serde_json::Value>> {
    let path = path?;
    let content = std::fs::read_to_string(path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;
    let map = json.as_object()?;
    Some(map.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
}

fn maybe_replace_var(s: &str, var: Option<&str>, value: &str) -> String {
    match var {
        Some(v) => replace_var(s, v, value),
        None => s.to_string(),
    }
}

fn read_yaml_key_pair(
    path: &std::path::Path,
    active_key: &str,
) -> (Vec<McpServer>, Option<String>) {
    if !path.exists() {
        return (vec![], None);
    }
    let raw = match std::fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) => return (vec![], Some(format!("cannot read {}: {}", path.display(), e))),
    };
    let yaml: serde_yaml::Value = match serde_yaml::from_str(&raw) {
        Ok(v) => v,
        Err(e) => return (vec![], Some(format!("cannot parse YAML {}: {}", path.display(), e))),
    };
    let servers = match yaml.get(active_key) {
        Some(v) => v,
        None => return (vec![], None),
    };
    // Convert yaml → json for reuse of parse_mcp_servers
    let json_str = match serde_json::to_string(&servers) {
        Ok(s) => s,
        Err(e) => return (vec![], Some(format!("yaml→json conversion failed: {e}"))),
    };
    let json: serde_json::Value = match serde_json::from_str(&json_str) {
        Ok(v) => v,
        Err(e) => return (vec![], Some(format!("yaml→json parse failed: {e}"))),
    };
    (parse_mcp_servers(&json, true), None)
}

fn read_toml_key_pair(
    path: &std::path::Path,
    active_key: &str,
) -> (Vec<McpServer>, Option<String>) {
    if !path.exists() {
        return (vec![], None);
    }
    let raw = match std::fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) => return (vec![], Some(format!("cannot read {}: {}", path.display(), e))),
    };
    let toml_val: toml::Value = match toml::from_str(&raw) {
        Ok(v) => v,
        Err(e) => return (vec![], Some(format!("cannot parse TOML {}: {}", path.display(), e))),
    };
    let servers = match toml_val.get(active_key) {
        Some(v) => v,
        None => return (vec![], None),
    };
    // Convert toml → json for reuse of parse_mcp_servers
    let json_str = match serde_json::to_string(servers) {
        Ok(s) => s,
        Err(e) => return (vec![], Some(format!("toml→json conversion failed: {e}"))),
    };
    let json: serde_json::Value = match serde_json::from_str(&json_str) {
        Ok(v) => v,
        Err(e) => return (vec![], Some(format!("toml→json parse failed: {e}"))),
    };
    (parse_mcp_servers(&json, true), None)
}

fn read_claude_plugins(
    installed_plugins_path: &std::path::Path,
    mcp_filename: &str,
) -> (Vec<McpServer>, Option<String>) {
    let raw = match std::fs::read_to_string(installed_plugins_path) {
        Ok(s) => s,
        Err(_) => return (vec![], None),
    };
    let json: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => return (vec![], Some(format!("cannot parse installed_plugins.json: {e}"))),
    };

    let plugins = match json.get("plugins").and_then(|p| p.as_object()) {
        Some(p) => p,
        None => return (vec![], None),
    };

    let mut all = Vec::new();

    for (_plugin_id, versions) in plugins {
        // Take the last (most recent) installed version entry
        let entry = match versions.as_array().and_then(|a| a.last()) {
            Some(e) => e,
            None => continue,
        };
        let install_path = match entry.get("installPath").and_then(|p| p.as_str()) {
            Some(p) => std::path::PathBuf::from(p),
            None => continue,
        };

        let mcp_path = install_path.join(mcp_filename);
        if !mcp_path.exists() {
            continue;
        }

        let mcp_raw = match std::fs::read_to_string(&mcp_path) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let mcp_json: serde_json::Value = match serde_json::from_str(&mcp_raw) {
            Ok(v) => v,
            Err(_) => continue,
        };

        // Support both {"mcpServers": {...}} and direct {"name": {...}} formats
        let servers = if let Some(obj) = mcp_json.get("mcpServers").and_then(|v| v.as_object()) {
            obj.clone()
        } else if let Some(obj) = mcp_json.as_object() {
            obj.clone()
        } else {
            continue
        };

        let mcps = crate::detectors::parse_mcp_servers(&serde_json::Value::Object(servers), true);
        all.extend(mcps);
    }

    (all, None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn write_json(dir: &std::path::Path, name: &str, val: serde_json::Value) -> std::path::PathBuf {
        let p = dir.join(name);
        fs::write(&p, serde_json::to_string_pretty(&val).unwrap()).unwrap();
        p
    }

    fn home_with_source(source: McpSourceSpec) -> (TempDir, Vec<McpServer>, Option<String>) {
        let tmp = TempDir::new().unwrap();
        let (mcps, err) = collect(&[source], tmp.path());
        (tmp, mcps, err)
    }

    // ── json_key_pair ────────────────────────────────────────────────────────

    #[test]
    fn json_key_pair_reads_active_and_disabled() {
        let tmp = TempDir::new().unwrap();
        let settings = serde_json::json!({
            "mcpServers": { "alpha": { "command": "node", "args": [] } },
            "disabledMcpServers": { "beta": { "command": "python", "args": [] } }
        });
        write_json(tmp.path(), "settings.json", settings);

        let source = McpSourceSpec::JsonKeyPair {
            file: tmp.path().join("settings.json").to_string_lossy().to_string(),
            active_key: "mcpServers".to_string(),
            disabled_key: Some("disabledMcpServers".to_string()),
            jsonc: false,
        };
        let (mcps, err) = collect(&[source], tmp.path());
        assert!(err.is_none());
        assert_eq!(mcps.len(), 2);
        let alpha = mcps.iter().find(|m| m.name == "alpha").unwrap();
        let beta  = mcps.iter().find(|m| m.name == "beta").unwrap();
        assert!(alpha.active);
        assert!(!beta.active);
    }

    #[test]
    fn json_key_pair_missing_file_returns_empty() {
        let tmp = TempDir::new().unwrap();
        let source = McpSourceSpec::JsonKeyPair {
            file: tmp.path().join("missing.json").to_string_lossy().to_string(),
            active_key: "mcpServers".to_string(),
            disabled_key: None,
            jsonc: false,
        };
        let (mcps, err) = collect(&[source], tmp.path());
        assert!(mcps.is_empty());
        assert!(err.is_none());
    }

    #[test]
    fn json_key_pair_jsonc_strips_comments() {
        let tmp = TempDir::new().unwrap();
        let jsonc = r#"{
  "mcpServers": {
    "active": { "command": "node", "args": [] }
    // "commented": { "command": "node", "args": [] }
  }
}"#;
        fs::write(tmp.path().join("settings.json"), jsonc).unwrap();
        let source = McpSourceSpec::JsonKeyPair {
            file: tmp.path().join("settings.json").to_string_lossy().to_string(),
            active_key: "mcpServers".to_string(),
            disabled_key: None,
            jsonc: true,
        };
        let (mcps, err) = collect(&[source], tmp.path());
        assert!(err.is_none(), "error: {:?}", err);
        assert_eq!(mcps.len(), 1);
        assert_eq!(mcps[0].name, "active");
    }

    #[test]
    fn secrets_not_exposed_in_serialized_output() {
        let tmp = TempDir::new().unwrap();
        let settings = serde_json::json!({
            "mcpServers": {
                "srv": {
                    "command": "node", "args": [],
                    "env": { "TOKEN": "supersecret", "KEY": "alsoSecret" }
                }
            }
        });
        write_json(tmp.path(), "settings.json", settings);
        let source = McpSourceSpec::JsonKeyPair {
            file: tmp.path().join("settings.json").to_string_lossy().to_string(),
            active_key: "mcpServers".to_string(),
            disabled_key: None,
            jsonc: false,
        };
        let (mcps, _) = collect(&[source], tmp.path());
        assert_eq!(mcps.len(), 1);
        assert!(mcps[0].has_secrets);
        assert!(mcps[0].secret_key_names.contains(&"TOKEN".to_string()));
        let serialized = serde_json::to_string(&mcps[0]).unwrap();
        assert!(!serialized.contains("supersecret"));
        assert!(!serialized.contains("alsoSecret"));
    }

    // ── json_nested ──────────────────────────────────────────────────────────

    #[test]
    fn json_nested_reads_servers_at_key_path() {
        let tmp = TempDir::new().unwrap();
        let settings = serde_json::json!({
            "mcp": {
                "servers": {
                    "my-srv": { "command": "npx", "args": ["-y", "my-srv"] }
                }
            }
        });
        write_json(tmp.path(), "settings.json", settings);
        let source = McpSourceSpec::JsonNested {
            file: tmp.path().join("settings.json").to_string_lossy().to_string(),
            key_path: vec!["mcp".to_string(), "servers".to_string()],
            jsonc: false,
        };
        let (mcps, err) = collect(&[source], tmp.path());
        assert!(err.is_none());
        assert_eq!(mcps.len(), 1);
        assert_eq!(mcps[0].name, "my-srv");
        assert!(mcps[0].active);
    }

    #[test]
    fn json_nested_missing_key_path_returns_empty() {
        let tmp = TempDir::new().unwrap();
        write_json(tmp.path(), "settings.json", serde_json::json!({ "other": {} }));
        let source = McpSourceSpec::JsonNested {
            file: tmp.path().join("settings.json").to_string_lossy().to_string(),
            key_path: vec!["mcp".to_string(), "servers".to_string()],
            jsonc: false,
        };
        let (mcps, err) = collect(&[source], tmp.path());
        assert!(mcps.is_empty());
        assert!(err.is_none());
    }

    // ── zed_context_servers ─────────────────────────────────────────────────

    #[test]
    fn zed_context_servers_normalizes_nested_command() {
        let tmp = TempDir::new().unwrap();
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
        write_json(tmp.path(), "settings.json", settings);
        let source = McpSourceSpec::ZedContextServers {
            file: tmp.path().join("settings.json").to_string_lossy().to_string(),
            key_path: vec!["assistant".to_string(), "context_servers".to_string()],
        };
        let (mcps, err) = collect(&[source], tmp.path());
        assert!(err.is_none());
        assert_eq!(mcps.len(), 1);
        assert_eq!(mcps[0].command, "/usr/bin/node");
        assert_eq!(mcps[0].args, vec!["mcp-server.js"]);
    }

    // ── extension_dir ────────────────────────────────────────────────────────

    #[test]
    fn extension_dir_reads_mcp_from_manifest() {
        let tmp = TempDir::new().unwrap();
        let ext_dir = tmp.path().join("extensions");
        let my_ext = ext_dir.join("my-ext");
        fs::create_dir_all(&my_ext).unwrap();
        write_json(&my_ext, "gemini-extension.json", serde_json::json!({
            "name": "my-ext",
            "version": "1.0.0",
            "mcpServers": {
                "my-tool": { "command": "node", "args": ["server.js"] }
            }
        }));

        let source = McpSourceSpec::ExtensionDir {
            dir: ext_dir.to_string_lossy().to_string(),
            manifest_file: "gemini-extension.json".to_string(),
            enablement_file: None,
            extension_path_var: None,
        };
        let (mcps, err) = collect(&[source], tmp.path());
        assert!(err.is_none());
        assert_eq!(mcps.len(), 1);
        assert_eq!(mcps[0].name, "my-tool");
        assert!(mcps[0].active); // no enablement file → all active
    }

    #[test]
    fn extension_dir_active_status_from_enablement_file() {
        let tmp = TempDir::new().unwrap();
        let ext_dir = tmp.path().join("extensions");
        let enabled_ext  = ext_dir.join("enabled-ext");
        let disabled_ext = ext_dir.join("disabled-ext");
        fs::create_dir_all(&enabled_ext).unwrap();
        fs::create_dir_all(&disabled_ext).unwrap();

        let manifest = serde_json::json!({
            "mcpServers": { "tool": { "command": "node", "args": [] } }
        });
        write_json(&enabled_ext,  "ext.json", manifest.clone());
        write_json(&disabled_ext, "ext.json", manifest);

        // Only enabled-ext is in the enablement file
        write_json(&ext_dir, "enablement.json", serde_json::json!({
            "enabled-ext": { "overrides": ["/Users/*"] }
        }));

        let source = McpSourceSpec::ExtensionDir {
            dir: ext_dir.to_string_lossy().to_string(),
            manifest_file: "ext.json".to_string(),
            enablement_file: Some(ext_dir.join("enablement.json").to_string_lossy().to_string()),
            extension_path_var: None,
        };
        let (mcps, _) = collect(&[source], tmp.path());
        assert_eq!(mcps.len(), 2);
        // Both extensions have a "tool" server, one active one not
        let active_count   = mcps.iter().filter(|m| m.active).count();
        let inactive_count = mcps.iter().filter(|m| !m.active).count();
        assert_eq!(active_count, 1);
        assert_eq!(inactive_count, 1);
    }

    #[test]
    fn extension_dir_resolves_extension_path_var() {
        let tmp = TempDir::new().unwrap();
        let ext_dir = tmp.path().join("extensions");
        let my_ext  = ext_dir.join("my-ext");
        fs::create_dir_all(&my_ext).unwrap();
        write_json(&my_ext, "ext.json", serde_json::json!({
            "mcpServers": {
                "tool": { "command": "node", "args": ["${extensionPath}/dist/index.js"] }
            }
        }));

        let source = McpSourceSpec::ExtensionDir {
            dir: ext_dir.to_string_lossy().to_string(),
            manifest_file: "ext.json".to_string(),
            enablement_file: None,
            extension_path_var: Some("${extensionPath}".to_string()),
        };
        let (mcps, _) = collect(&[source], tmp.path());
        assert_eq!(mcps.len(), 1);
        let expected_arg = format!("{}/dist/index.js", my_ext.display());
        assert_eq!(mcps[0].args[0], expected_arg);
    }

    #[test]
    fn extension_dir_http_mcp_sets_url() {
        let tmp = TempDir::new().unwrap();
        let ext_dir = tmp.path().join("extensions");
        let my_ext  = ext_dir.join("github-ext");
        fs::create_dir_all(&my_ext).unwrap();
        write_json(&my_ext, "ext.json", serde_json::json!({
            "mcpServers": {
                "github": {
                    "httpUrl": "https://api.github.com/mcp/",
                    "headers": { "Authorization": "Bearer $TOKEN" }
                }
            }
        }));

        let source = McpSourceSpec::ExtensionDir {
            dir: ext_dir.to_string_lossy().to_string(),
            manifest_file: "ext.json".to_string(),
            enablement_file: None,
            extension_path_var: None,
        };
        let (mcps, _) = collect(&[source], tmp.path());
        assert_eq!(mcps.len(), 1);
        assert_eq!(mcps[0].url.as_deref(), Some("https://api.github.com/mcp/"));
        assert_eq!(mcps[0].command, "");
        assert!(mcps[0].has_secrets);
        assert!(mcps[0].secret_key_names.contains(&"Authorization".to_string()));
        // Secret value must not be serialised
        let serialized = serde_json::to_string(&mcps[0]).unwrap();
        assert!(!serialized.contains("$TOKEN"));
    }

    #[test]
    fn extension_dir_skips_subdir_without_manifest() {
        let tmp = TempDir::new().unwrap();
        let ext_dir = tmp.path().join("extensions");
        // One ext with manifest, one without
        let good_ext = ext_dir.join("good-ext");
        let bad_ext  = ext_dir.join("no-manifest-ext");
        fs::create_dir_all(&good_ext).unwrap();
        fs::create_dir_all(&bad_ext).unwrap();
        write_json(&good_ext, "ext.json", serde_json::json!({
            "mcpServers": { "tool": { "command": "node", "args": [] } }
        }));
        // bad_ext has no ext.json

        let source = McpSourceSpec::ExtensionDir {
            dir: ext_dir.to_string_lossy().to_string(),
            manifest_file: "ext.json".to_string(),
            enablement_file: None,
            extension_path_var: None,
        };
        let (mcps, err) = collect(&[source], tmp.path());
        assert!(err.is_none(), "should not error on missing manifest: {:?}", err);
        assert_eq!(mcps.len(), 1);
        assert_eq!(mcps[0].name, "tool");
    }

    #[test]
    fn multiple_sources_aggregate_mcps() {
        let tmp = TempDir::new().unwrap();
        let settings_a = serde_json::json!({
            "mcpServers": { "alpha": { "command": "node", "args": [] } }
        });
        let settings_b = serde_json::json!({
            "mcpServers": { "beta": { "command": "python", "args": [] } }
        });
        write_json(tmp.path(), "a.json", settings_a);
        write_json(tmp.path(), "b.json", settings_b);

        let sources = vec![
            McpSourceSpec::JsonKeyPair {
                file: tmp.path().join("a.json").to_string_lossy().to_string(),
                active_key: "mcpServers".to_string(),
                disabled_key: None,
                jsonc: false,
            },
            McpSourceSpec::JsonKeyPair {
                file: tmp.path().join("b.json").to_string_lossy().to_string(),
                active_key: "mcpServers".to_string(),
                disabled_key: None,
                jsonc: false,
            },
        ];
        let (mcps, err) = collect(&sources, tmp.path());
        assert!(err.is_none());
        assert_eq!(mcps.len(), 2);
        assert!(mcps.iter().any(|m| m.name == "alpha"));
        assert!(mcps.iter().any(|m| m.name == "beta"));
    }
}
