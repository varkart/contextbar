use super::jsonc::strip_comments;
use super::manifest::{McpSource, McpSourceSpec};
use super::resolve::{expand_home, replace_var, version_in_range};
use crate::detectors::parse_mcp_servers;
use crate::models::McpServer;

pub fn collect(
    sources: &[McpSource],
    version: Option<&str>,
    home: &std::path::Path,
) -> (Vec<McpServer>, Option<String>) {
    let mut all = Vec::new();
    let mut first_error: Option<String> = None;

    for (idx, entry) in sources.iter().enumerate() {
        if !version_in_range(
            version,
            entry.min_version.as_deref(),
            entry.max_version.as_deref(),
        ) {
            continue;
        }
        let source_id = entry
            .id
            .clone()
            .unwrap_or_else(|| format!("source_{}", idx));
        let (mut mcps, err) = read_source(&entry.spec, home);

        for mcp in &mut mcps {
            mcp.source_id = source_id.clone();
        }

        // Deduplicate by server name across all sources (first source wins).
        // ClaudeMcpList additionally deduplicates by URL.
        let existing_names: std::collections::HashSet<String> =
            all.iter().map(|m: &McpServer| m.name.clone()).collect();
        if matches!(entry.spec, McpSourceSpec::ClaudeMcpList { .. }) {
            let existing_urls: std::collections::HashSet<String> = all
                .iter()
                .filter_map(|m: &McpServer| m.url.clone())
                .collect();
            for mcp in mcps {
                let name_seen = existing_names.contains(&mcp.name);
                let url_seen = mcp.url.as_ref().is_some_and(|u| existing_urls.contains(u));
                if !name_seen && !url_seen {
                    all.push(mcp);
                }
            }
        } else {
            for mcp in mcps {
                if !existing_names.contains(&mcp.name) {
                    all.push(mcp);
                }
            }
        }

        if first_error.is_none() {
            first_error = err;
        }
    }

    all.sort_by(|a, b| a.name.cmp(&b.name));
    (all, first_error)
}

fn read_source(source: &McpSourceSpec, home: &std::path::Path) -> (Vec<McpServer>, Option<String>) {
    match source {
        McpSourceSpec::JsonKeyPair {
            file,
            active_key,
            disabled_key,
            jsonc,
        } => read_json_key_pair(
            &expand_home(file, home),
            active_key,
            disabled_key.as_deref(),
            *jsonc,
        ),
        McpSourceSpec::JsonNested {
            file,
            key_path,
            jsonc,
        } => read_json_nested(&expand_home(file, home), key_path, *jsonc),
        McpSourceSpec::ZedContextServers { file, key_path } => {
            read_zed_context_servers(&expand_home(file, home), key_path)
        }
        McpSourceSpec::ExtensionDir {
            dir,
            manifest_file,
            enablement_file,
            extension_path_var,
        } => read_extension_dir(
            &expand_home(dir, home),
            manifest_file,
            enablement_file
                .as_deref()
                .map(|f| expand_home(f, home))
                .as_deref(),
            extension_path_var.as_deref(),
        ),
        McpSourceSpec::ClaudePlugins {
            installed_plugins_file,
            mcp_filename,
        } => read_claude_plugins(&expand_home(installed_plugins_file, home), mcp_filename),
        McpSourceSpec::YamlKeyPair { file, active_key } => {
            read_yaml_key_pair(&expand_home(file, home), active_key)
        }
        McpSourceSpec::TomlKeyPair {
            file, active_key, ..
        } => read_toml_key_pair(&expand_home(file, home), active_key),
        McpSourceSpec::ClaudeDotfile { file } => read_claude_dotfile(&expand_home(file, home)),
        McpSourceSpec::ClaudeMcpList { binary, timeout_ms } => {
            read_claude_mcp_list(binary, *timeout_ms, home)
        }
    }
}

fn parse_json(path: &std::path::Path, jsonc: bool) -> Result<serde_json::Value, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|e| format!("cannot read {}: {}", path.display(), e))?;
    let content = if jsonc { strip_comments(&raw) } else { raw };
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Ok(serde_json::Value::Object(serde_json::Map::new()));
    }
    serde_json::from_str(trimmed).map_err(|e| format!("cannot parse {}: {}", path.display(), e))
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
        let path = cfg
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

        let active = enablement
            .as_ref()
            .map(|e| e.contains_key(&ext_name))
            .unwrap_or(true); // if no enablement file, all active

        let servers_val = match manifest.get("mcpServers") {
            Some(v) => v,
            None => continue,
        };

        let ext_path_str = ext_dir.to_string_lossy();

        // Load per-server disabled overrides from mcp_config.json (sibling to manifest).
        // Allows toggling individual servers even when manifest_file is gemini-extension.json.
        let disabled_overrides: std::collections::HashSet<String> = {
            let override_path = ext_dir.join("mcp_config.json");
            if override_path.exists() && override_path != manifest_path {
                std::fs::read_to_string(&override_path)
                    .ok()
                    .and_then(|raw| {
                        let t = raw.trim().to_string();
                        if t.is_empty() {
                            return None;
                        }
                        serde_json::from_str::<serde_json::Value>(&t).ok()
                    })
                    .and_then(|v| v.get("mcpServers").cloned())
                    .and_then(|s| s.as_object().cloned())
                    .map(|m| {
                        m.into_iter()
                            .filter(|(_, v)| {
                                v.get("disabled").and_then(|d| d.as_bool()).unwrap_or(false)
                            })
                            .map(|(k, _)| k)
                            .collect()
                    })
                    .unwrap_or_default()
            } else {
                std::collections::HashSet::new()
            }
        };

        // Resolve headers secrets and httpUrl for each server
        let obj = match servers_val.as_object() {
            Some(o) => o,
            None => continue,
        };

        for (name, cfg) in obj {
            let url = cfg
                .get("httpUrl")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            // Resolve ${extensionPath} in command args
            let command = cfg
                .get("command")
                .and_then(|v| v.as_str())
                .map(|s| maybe_replace_var(s, extension_path_var, &ext_path_str))
                .unwrap_or_default();

            let args: Vec<String> = cfg
                .get("args")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|a| a.as_str())
                        .map(|s| maybe_replace_var(s, extension_path_var, &ext_path_str))
                        .collect()
                })
                .unwrap_or_default();

            let description = cfg
                .get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .filter(|s| !s.trim().is_empty());

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
                        _ => (false, vec![]),
                    }
                }
            };

            mcps.push(McpServer {
                name: name.clone(),
                command,
                args,
                url,
                description,
                active: active && !disabled_overrides.contains(name),
                has_secrets,
                secret_key_names,
                extension_name: Some(ext_name.clone()),
                source_id: String::new(), // stamped by collect()
                disabled_tools: vec![],
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
        Err(e) => {
            return (
                vec![],
                Some(format!("cannot read {}: {}", path.display(), e)),
            )
        }
    };
    let yaml: serde_yaml::Value = match serde_yaml::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            return (
                vec![],
                Some(format!("cannot parse YAML {}: {}", path.display(), e)),
            )
        }
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
        Err(e) => {
            return (
                vec![],
                Some(format!("cannot read {}: {}", path.display(), e)),
            )
        }
    };
    let toml_val: toml::Value = match toml::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            return (
                vec![],
                Some(format!("cannot parse TOML {}: {}", path.display(), e)),
            )
        }
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
    // Split on per-entry `enabled` field (defaults to true when absent)
    let mut active_map = serde_json::Map::new();
    let mut inactive_map = serde_json::Map::new();
    if let Some(obj) = json.as_object() {
        for (name, cfg) in obj {
            let is_enabled = cfg.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
            if is_enabled {
                active_map.insert(name.clone(), cfg.clone());
            } else {
                inactive_map.insert(name.clone(), cfg.clone());
            }
        }
    }
    let mut mcps = parse_mcp_servers(&serde_json::Value::Object(active_map), true);
    mcps.extend(parse_mcp_servers(
        &serde_json::Value::Object(inactive_map),
        false,
    ));
    (mcps, None)
}

type ClaudeCacheType = Option<(Vec<McpServer>, std::time::Instant)>;
static CLAUDE_MCP_CACHE: std::sync::OnceLock<std::sync::Mutex<ClaudeCacheType>> =
    std::sync::OnceLock::new();

static CLAUDE_MCP_WARMING: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

fn claude_mcp_cache() -> &'static std::sync::Mutex<Option<(Vec<McpServer>, std::time::Instant)>> {
    CLAUDE_MCP_CACHE.get_or_init(|| std::sync::Mutex::new(None))
}

/// Returns true when the cache has no valid entry and no warmup is in progress.
pub fn is_claude_mcp_cache_cold() -> bool {
    const TTL: std::time::Duration = std::time::Duration::from_secs(60);
    if CLAUDE_MCP_WARMING.load(std::sync::atomic::Ordering::Acquire) {
        return false; // warmup already running
    }
    if let Ok(guard) = claude_mcp_cache().lock() {
        if let Some((_, ts)) = *guard {
            return ts.elapsed() >= TTL;
        }
    }
    true
}

/// Runs `claude mcp list`, populates the cache.
/// Intended to be called from a background thread; guards against concurrent runs.
pub fn warm_claude_mcp_list(home: &std::path::Path) {
    use std::sync::atomic::Ordering;
    if CLAUDE_MCP_WARMING
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return; // another thread is already warming
    }
    run_claude_mcp_list("claude", 6000, home);
    CLAUDE_MCP_WARMING.store(false, Ordering::Release);
}

fn read_claude_mcp_list(
    _binary: &str,
    _timeout_ms: u64,
    _home: &std::path::Path,
) -> (Vec<McpServer>, Option<String>) {
    const TTL: std::time::Duration = std::time::Duration::from_secs(60);
    // Return cached result if still fresh.
    if let Ok(guard) = claude_mcp_cache().lock() {
        if let Some((ref cached, ts)) = *guard {
            if ts.elapsed() < TTL {
                return (cached.clone(), None);
            }
        }
    }
    // Cache is cold — return empty; lib.rs spawns a background warmup.
    (vec![], None)
}

fn run_claude_mcp_list(binary: &str, timeout_ms: u64, home: &std::path::Path) {
    // Try the given binary, then common install paths if it fails
    let candidates: Vec<std::path::PathBuf> = {
        let mut v = vec![std::path::PathBuf::from(binary)];
        if binary == "claude" {
            v.push(std::path::PathBuf::from("/usr/local/bin/claude"));
            v.push(std::path::PathBuf::from("/opt/homebrew/bin/claude"));
            v.push(home.join(".npm").join("bin").join("claude"));
            v.push(home.join(".local").join("bin").join("claude"));
        }
        v
    };

    let bin = candidates.into_iter().find(|p| {
        if p.components().count() == 1 {
            // bare name — check via `which`
            std::process::Command::new("which")
                .arg(p)
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        } else {
            p.exists()
        }
    });

    let bin = match bin {
        Some(b) => b,
        None => return, // claude not found — silent skip
    };

    let timeout = std::time::Duration::from_millis(timeout_ms);
    let output = match crate::detectors::run_with_timeout(
        move || {
            std::process::Command::new(&bin)
                .args(["mcp", "list"])
                .output()
                .ok()
        },
        timeout,
    ) {
        Some(o) => o,
        None => return,
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mcps = parse_mcp_list_output(&stdout);
    if let Ok(mut guard) = claude_mcp_cache().lock() {
        *guard = Some((mcps, std::time::Instant::now()));
    }
}

/// Parse `claude mcp list` stdout into McpServer entries.
/// Line format: `{name}: {url_or_stdio}[ (TYPE)] - {status}`
fn parse_mcp_list_output(output: &str) -> Vec<McpServer> {
    let mut mcps = Vec::new();
    for line in output.lines() {
        let line = line.trim();
        // Skip blank lines and the "Checking…" header
        if line.is_empty() || line.starts_with("Checking") {
            continue;
        }
        // Split on first `: ` to get name
        let (name, rest) = match line.split_once(": ") {
            Some(p) => p,
            None => continue,
        };
        // Split rest on last ` - ` to separate url_part from status
        let (url_part, status) = match rest.rfind(" - ") {
            Some(idx) => (&rest[..idx], &rest[idx + 3..]),
            None => continue,
        };
        // Strip transport annotation e.g. " (HTTP)" or " (SSE)"
        let url_clean = url_part
            .trim_end_matches([')', ' '])
            .rsplit_once(" (")
            .map(|(u, _)| u)
            .unwrap_or(url_part)
            .trim();

        let active = status.contains("Connected");

        // Only set url if it looks like a URL; stdio MCPs have command we don't know
        let (url, command) =
            if url_clean.starts_with("http://") || url_clean.starts_with("https://") {
                (Some(url_clean.to_string()), String::new())
            } else {
                (None, String::new())
            };

        mcps.push(McpServer {
            name: name.trim().to_string(),
            command,
            args: vec![],
            url,
            description: None,
            active,
            has_secrets: false,
            secret_key_names: vec![],
            extension_name: None,
            source_id: String::new(), // stamped by collect()
            disabled_tools: vec![],
        });
    }
    mcps
}

fn read_claude_dotfile(path: &std::path::Path) -> (Vec<McpServer>, Option<String>) {
    if !path.exists() {
        return (vec![], None);
    }
    let json = match parse_json(path, false) {
        Ok(v) => v,
        Err(e) => return (vec![], Some(e)),
    };

    let projects = match json.get("projects").and_then(|v| v.as_object()) {
        Some(p) => p,
        None => return (vec![], None),
    };

    let mut seen = std::collections::HashSet::new();
    let mut all = Vec::new();

    for (_proj_path, proj_val) in projects {
        let servers = match proj_val.get("mcpServers").and_then(|v| v.as_object()) {
            Some(s) => s,
            None => continue,
        };
        for mcp in parse_mcp_servers(&serde_json::Value::Object(servers.clone()), true) {
            if seen.insert(mcp.name.clone()) {
                all.push(mcp);
            }
        }
    }

    (all, None)
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
        Err(e) => {
            return (
                vec![],
                Some(format!("cannot parse installed_plugins.json: {e}")),
            )
        }
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
            continue;
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

    fn wrap(spec: McpSourceSpec) -> super::super::manifest::McpSource {
        super::super::manifest::McpSource {
            id: None,
            min_version: None,
            max_version: None,
            spec,
        }
    }

    #[allow(dead_code)]
    fn home_with_source(source: McpSourceSpec) -> (TempDir, Vec<McpServer>, Option<String>) {
        let tmp = TempDir::new().unwrap();
        let (mcps, err) = collect(&[wrap(source)], None, tmp.path());
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
            file: tmp
                .path()
                .join("settings.json")
                .to_string_lossy()
                .to_string(),
            active_key: "mcpServers".to_string(),
            disabled_key: Some("disabledMcpServers".to_string()),
            jsonc: false,
        };
        let (mcps, err) = collect(&[wrap(source)], None, tmp.path());
        assert!(err.is_none());
        assert_eq!(mcps.len(), 2);
        let alpha = mcps.iter().find(|m| m.name == "alpha").unwrap();
        let beta = mcps.iter().find(|m| m.name == "beta").unwrap();
        assert!(alpha.active);
        assert!(!beta.active);
    }

    #[test]
    fn json_key_pair_missing_file_returns_empty() {
        let tmp = TempDir::new().unwrap();
        let source = McpSourceSpec::JsonKeyPair {
            file: tmp
                .path()
                .join("missing.json")
                .to_string_lossy()
                .to_string(),
            active_key: "mcpServers".to_string(),
            disabled_key: None,
            jsonc: false,
        };
        let (mcps, err) = collect(&[wrap(source)], None, tmp.path());
        assert!(mcps.is_empty());
        assert!(err.is_none());
    }

    #[test]
    fn json_key_pair_empty_file_returns_empty() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("empty.json");
        std::fs::write(&path, "").unwrap();
        let source = McpSourceSpec::JsonKeyPair {
            file: path.to_string_lossy().to_string(),
            active_key: "mcpServers".to_string(),
            disabled_key: None,
            jsonc: false,
        };
        let (mcps, err) = collect(&[wrap(source)], None, tmp.path());
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
            file: tmp
                .path()
                .join("settings.json")
                .to_string_lossy()
                .to_string(),
            active_key: "mcpServers".to_string(),
            disabled_key: None,
            jsonc: true,
        };
        let (mcps, err) = collect(&[wrap(source)], None, tmp.path());
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
            file: tmp
                .path()
                .join("settings.json")
                .to_string_lossy()
                .to_string(),
            active_key: "mcpServers".to_string(),
            disabled_key: None,
            jsonc: false,
        };
        let (mcps, _) = collect(&[wrap(source)], None, tmp.path());
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
            file: tmp
                .path()
                .join("settings.json")
                .to_string_lossy()
                .to_string(),
            key_path: vec!["mcp".to_string(), "servers".to_string()],
            jsonc: false,
        };
        let (mcps, err) = collect(&[wrap(source)], None, tmp.path());
        assert!(err.is_none());
        assert_eq!(mcps.len(), 1);
        assert_eq!(mcps[0].name, "my-srv");
        assert!(mcps[0].active);
    }

    #[test]
    fn json_nested_missing_key_path_returns_empty() {
        let tmp = TempDir::new().unwrap();
        write_json(
            tmp.path(),
            "settings.json",
            serde_json::json!({ "other": {} }),
        );
        let source = McpSourceSpec::JsonNested {
            file: tmp
                .path()
                .join("settings.json")
                .to_string_lossy()
                .to_string(),
            key_path: vec!["mcp".to_string(), "servers".to_string()],
            jsonc: false,
        };
        let (mcps, err) = collect(&[wrap(source)], None, tmp.path());
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
            file: tmp
                .path()
                .join("settings.json")
                .to_string_lossy()
                .to_string(),
            key_path: vec!["assistant".to_string(), "context_servers".to_string()],
        };
        let (mcps, err) = collect(&[wrap(source)], None, tmp.path());
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
        write_json(
            &my_ext,
            "gemini-extension.json",
            serde_json::json!({
                "name": "my-ext",
                "version": "1.0.0",
                "mcpServers": {
                    "my-tool": { "command": "node", "args": ["server.js"] }
                }
            }),
        );

        let source = McpSourceSpec::ExtensionDir {
            dir: ext_dir.to_string_lossy().to_string(),
            manifest_file: "gemini-extension.json".to_string(),
            enablement_file: None,
            extension_path_var: None,
        };
        let (mcps, err) = collect(&[wrap(source)], None, tmp.path());
        assert!(err.is_none());
        assert_eq!(mcps.len(), 1);
        assert_eq!(mcps[0].name, "my-tool");
        assert!(mcps[0].active); // no enablement file → all active
    }

    #[test]
    fn extension_dir_active_status_from_enablement_file() {
        let tmp = TempDir::new().unwrap();
        let ext_dir = tmp.path().join("extensions");
        let enabled_ext = ext_dir.join("enabled-ext");
        let disabled_ext = ext_dir.join("disabled-ext");
        fs::create_dir_all(&enabled_ext).unwrap();
        fs::create_dir_all(&disabled_ext).unwrap();

        let manifest = serde_json::json!({
            "mcpServers": { "tool": { "command": "node", "args": [] } }
        });
        write_json(&enabled_ext, "ext.json", manifest.clone());
        write_json(&disabled_ext, "ext.json", manifest);

        // Only enabled-ext is in the enablement file
        write_json(
            &ext_dir,
            "enablement.json",
            serde_json::json!({
                "enabled-ext": { "overrides": ["/Users/*"] }
            }),
        );

        let source = McpSourceSpec::ExtensionDir {
            dir: ext_dir.to_string_lossy().to_string(),
            manifest_file: "ext.json".to_string(),
            enablement_file: Some(
                ext_dir
                    .join("enablement.json")
                    .to_string_lossy()
                    .to_string(),
            ),
            extension_path_var: None,
        };
        let (mcps, _) = collect(&[wrap(source)], None, tmp.path());
        assert_eq!(mcps.len(), 2);
        // Both extensions have a "tool" server, one active one not
        let active_count = mcps.iter().filter(|m| m.active).count();
        let inactive_count = mcps.iter().filter(|m| !m.active).count();
        assert_eq!(active_count, 1);
        assert_eq!(inactive_count, 1);
    }

    #[test]
    fn extension_dir_resolves_extension_path_var() {
        let tmp = TempDir::new().unwrap();
        let ext_dir = tmp.path().join("extensions");
        let my_ext = ext_dir.join("my-ext");
        fs::create_dir_all(&my_ext).unwrap();
        write_json(
            &my_ext,
            "ext.json",
            serde_json::json!({
                "mcpServers": {
                    "tool": { "command": "node", "args": ["${extensionPath}/dist/index.js"] }
                }
            }),
        );

        let source = McpSourceSpec::ExtensionDir {
            dir: ext_dir.to_string_lossy().to_string(),
            manifest_file: "ext.json".to_string(),
            enablement_file: None,
            extension_path_var: Some("${extensionPath}".to_string()),
        };
        let (mcps, _) = collect(&[wrap(source)], None, tmp.path());
        assert_eq!(mcps.len(), 1);
        let expected_arg = format!("{}/dist/index.js", my_ext.display());
        assert_eq!(mcps[0].args[0], expected_arg);
    }

    #[test]
    fn extension_dir_http_mcp_sets_url() {
        let tmp = TempDir::new().unwrap();
        let ext_dir = tmp.path().join("extensions");
        let my_ext = ext_dir.join("github-ext");
        fs::create_dir_all(&my_ext).unwrap();
        write_json(
            &my_ext,
            "ext.json",
            serde_json::json!({
                "mcpServers": {
                    "github": {
                        "httpUrl": "https://api.github.com/mcp/",
                        "headers": { "Authorization": "Bearer $TOKEN" }
                    }
                }
            }),
        );

        let source = McpSourceSpec::ExtensionDir {
            dir: ext_dir.to_string_lossy().to_string(),
            manifest_file: "ext.json".to_string(),
            enablement_file: None,
            extension_path_var: None,
        };
        let (mcps, _) = collect(&[wrap(source)], None, tmp.path());
        assert_eq!(mcps.len(), 1);
        assert_eq!(mcps[0].url.as_deref(), Some("https://api.github.com/mcp/"));
        assert_eq!(mcps[0].command, "");
        assert!(mcps[0].has_secrets);
        assert!(mcps[0]
            .secret_key_names
            .contains(&"Authorization".to_string()));
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
        let bad_ext = ext_dir.join("no-manifest-ext");
        fs::create_dir_all(&good_ext).unwrap();
        fs::create_dir_all(&bad_ext).unwrap();
        write_json(
            &good_ext,
            "ext.json",
            serde_json::json!({
                "mcpServers": { "tool": { "command": "node", "args": [] } }
            }),
        );
        // bad_ext has no ext.json

        let source = McpSourceSpec::ExtensionDir {
            dir: ext_dir.to_string_lossy().to_string(),
            manifest_file: "ext.json".to_string(),
            enablement_file: None,
            extension_path_var: None,
        };
        let (mcps, err) = collect(&[wrap(source)], None, tmp.path());
        assert!(
            err.is_none(),
            "should not error on missing manifest: {:?}",
            err
        );
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
            wrap(McpSourceSpec::JsonKeyPair {
                file: tmp.path().join("a.json").to_string_lossy().to_string(),
                active_key: "mcpServers".to_string(),
                disabled_key: None,
                jsonc: false,
            }),
            wrap(McpSourceSpec::JsonKeyPair {
                file: tmp.path().join("b.json").to_string_lossy().to_string(),
                active_key: "mcpServers".to_string(),
                disabled_key: None,
                jsonc: false,
            }),
        ];
        let (mcps, err) = collect(&sources, None, tmp.path());
        assert!(err.is_none());
        assert_eq!(mcps.len(), 2);
        assert!(mcps.iter().any(|m| m.name == "alpha"));
        assert!(mcps.iter().any(|m| m.name == "beta"));
    }

    #[test]
    fn collect_deduplicates_same_name_across_sources() {
        let tmp = TempDir::new().unwrap();
        // Same server name "postman" in two different sources
        write_json(
            tmp.path(),
            "a.json",
            serde_json::json!({"mcpServers": {"postman": {"command": "npx", "args": ["@a"]}}}),
        );
        write_json(
            tmp.path(),
            "b.json",
            serde_json::json!({"mcpServers": {"postman": {"command": "npx", "args": ["@b"]}}}),
        );
        let sources = vec![
            wrap(McpSourceSpec::JsonKeyPair {
                file: tmp.path().join("a.json").to_string_lossy().to_string(),
                active_key: "mcpServers".to_string(),
                disabled_key: None,
                jsonc: false,
            }),
            wrap(McpSourceSpec::JsonKeyPair {
                file: tmp.path().join("b.json").to_string_lossy().to_string(),
                active_key: "mcpServers".to_string(),
                disabled_key: None,
                jsonc: false,
            }),
        ];
        let (mcps, _) = collect(&sources, None, tmp.path());
        // Only one entry — first source wins
        assert_eq!(mcps.len(), 1);
        assert_eq!(mcps[0].args, vec!["@a"]);
    }

    #[test]
    fn version_gate_skips_source_outside_range() {
        let tmp = TempDir::new().unwrap();
        write_json(
            tmp.path(),
            "settings.json",
            serde_json::json!({
                "mcpServers": { "srv": { "command": "node", "args": [] } }
            }),
        );
        let source = super::super::manifest::McpSource {
            id: None,
            min_version: Some("2.0".to_string()),
            max_version: None,
            spec: McpSourceSpec::JsonKeyPair {
                file: tmp
                    .path()
                    .join("settings.json")
                    .to_string_lossy()
                    .to_string(),
                active_key: "mcpServers".to_string(),
                disabled_key: None,
                jsonc: false,
            },
        };
        // version 1.5 is below min 2.0 — source should be skipped
        let (mcps, err) = collect(&[source], Some("1.5"), tmp.path());
        assert!(err.is_none());
        assert!(mcps.is_empty(), "expected skip due to version gate");
    }

    #[test]
    fn version_gate_includes_source_in_range() {
        let tmp = TempDir::new().unwrap();
        write_json(
            tmp.path(),
            "settings.json",
            serde_json::json!({
                "mcpServers": { "srv": { "command": "node", "args": [] } }
            }),
        );
        let source = super::super::manifest::McpSource {
            id: None,
            min_version: Some("2.0".to_string()),
            max_version: Some("3.0".to_string()),
            spec: McpSourceSpec::JsonKeyPair {
                file: tmp
                    .path()
                    .join("settings.json")
                    .to_string_lossy()
                    .to_string(),
                active_key: "mcpServers".to_string(),
                disabled_key: None,
                jsonc: false,
            },
        };
        let (mcps, err) = collect(&[source], Some("2.5"), tmp.path());
        assert!(err.is_none());
        assert_eq!(mcps.len(), 1);
    }

    // ── claude_mcp_list parser ───────────────────────────────────────────────

    #[test]
    fn parse_mcp_list_output_extracts_cloud_mcps() {
        let output = "Checking MCP server health…\n\n\
            claude.ai Context7: https://mcp.context7.com/mcp - ✔ Connected\n\
            claude.ai Google Drive: https://drivemcp.googleapis.com/mcp/v1 - ! Needs authentication\n\
            plugin:posthog:posthog: https://mcp.posthog.com/mcp (HTTP) - ✔ Connected\n";
        let mcps = parse_mcp_list_output(output);
        assert_eq!(mcps.len(), 3);
        let ctx7 = mcps
            .iter()
            .find(|m| m.name == "claude.ai Context7")
            .unwrap();
        assert_eq!(ctx7.url.as_deref(), Some("https://mcp.context7.com/mcp"));
        assert!(ctx7.active);
        let drive = mcps
            .iter()
            .find(|m| m.name == "claude.ai Google Drive")
            .unwrap();
        assert!(!drive.active);
        let posthog = mcps
            .iter()
            .find(|m| m.name == "plugin:posthog:posthog")
            .unwrap();
        assert_eq!(posthog.url.as_deref(), Some("https://mcp.posthog.com/mcp"));
        assert!(posthog.active);
    }

    #[test]
    fn parse_mcp_list_strips_transport_annotation() {
        let output = "sentry: https://mcp.sentry.dev/mcp (HTTP) - ✔ Connected\n";
        let mcps = parse_mcp_list_output(output);
        assert_eq!(mcps[0].url.as_deref(), Some("https://mcp.sentry.dev/mcp"));
    }

    #[test]
    fn parse_mcp_list_skips_blank_and_header_lines() {
        let output = "Checking MCP server health…\n\n\
            claude.ai Gmail: https://gmailmcp.googleapis.com/mcp/v1 - ! Needs authentication\n";
        let mcps = parse_mcp_list_output(output);
        assert_eq!(mcps.len(), 1);
        assert_eq!(mcps[0].name, "claude.ai Gmail");
    }

    #[test]
    fn claude_mcp_list_deduped_against_file_sources() {
        // ClaudeMcpList output that includes an MCP already in a file source
        // should be filtered; new names should be added.
        let output = "github: https://api.github.com/mcp - ✔ Connected\n\
            claude.ai Context7: https://mcp.context7.com/mcp - ✔ Connected\n";
        let from_list = parse_mcp_list_output(output);
        assert_eq!(from_list.len(), 2);

        // Simulate: github already collected from settings.json
        let existing_names: std::collections::HashSet<&str> = ["github"].iter().copied().collect();
        let new_mcps: Vec<_> = from_list
            .into_iter()
            .filter(|m| !existing_names.contains(m.name.as_str()))
            .collect();
        assert_eq!(new_mcps.len(), 1);
        assert_eq!(new_mcps[0].name, "claude.ai Context7");
    }

    // ── claude_dotfile ───────────────────────────────────────────────────────

    #[test]
    fn claude_dotfile_collects_mcps_from_all_projects() {
        let tmp = TempDir::new().unwrap();
        let dotfile = serde_json::json!({
            "projects": {
                "/path/to/proj1": {
                    "mcpServers": {
                        "sentry": { "type": "http", "url": "https://mcp.sentry.dev/mcp" }
                    }
                },
                "/path/to/proj2": {
                    "mcpServers": {
                        "linear": { "command": "npx", "args": ["-y", "linear-mcp"] }
                    }
                }
            }
        });
        write_json(tmp.path(), ".claude.json", dotfile);
        let source = McpSourceSpec::ClaudeDotfile {
            file: tmp
                .path()
                .join(".claude.json")
                .to_string_lossy()
                .to_string(),
        };
        let (mcps, err) = collect(&[wrap(source)], None, tmp.path());
        assert!(err.is_none());
        assert_eq!(mcps.len(), 2);
        assert!(mcps.iter().any(|m| m.name == "sentry"));
        assert!(mcps.iter().any(|m| m.name == "linear"));
    }

    #[test]
    fn claude_dotfile_deduplicates_same_name_across_projects() {
        let tmp = TempDir::new().unwrap();
        let dotfile = serde_json::json!({
            "projects": {
                "/path/to/proj1": {
                    "mcpServers": {
                        "sentry": { "type": "http", "url": "https://mcp.sentry.dev/mcp" }
                    }
                },
                "/path/to/proj2": {
                    "mcpServers": {
                        "sentry": { "type": "http", "url": "https://mcp.sentry.dev/mcp" }
                    }
                }
            }
        });
        write_json(tmp.path(), ".claude.json", dotfile);
        let source = McpSourceSpec::ClaudeDotfile {
            file: tmp
                .path()
                .join(".claude.json")
                .to_string_lossy()
                .to_string(),
        };
        let (mcps, err) = collect(&[wrap(source)], None, tmp.path());
        assert!(err.is_none());
        assert_eq!(mcps.len(), 1, "duplicate name should appear only once");
    }

    #[test]
    fn claude_dotfile_missing_file_returns_empty() {
        let tmp = TempDir::new().unwrap();
        let source = McpSourceSpec::ClaudeDotfile {
            file: tmp
                .path()
                .join(".claude.json")
                .to_string_lossy()
                .to_string(),
        };
        let (mcps, err) = collect(&[wrap(source)], None, tmp.path());
        assert!(mcps.is_empty());
        assert!(err.is_none());
    }

    #[test]
    fn claude_dotfile_http_mcp_sets_url() {
        let tmp = TempDir::new().unwrap();
        let dotfile = serde_json::json!({
            "projects": {
                "/proj": {
                    "mcpServers": {
                        "sentry": { "url": "https://mcp.sentry.dev/mcp" }
                    }
                }
            }
        });
        write_json(tmp.path(), ".claude.json", dotfile);
        let source = McpSourceSpec::ClaudeDotfile {
            file: tmp
                .path()
                .join(".claude.json")
                .to_string_lossy()
                .to_string(),
        };
        let (mcps, err) = collect(&[wrap(source)], None, tmp.path());
        assert!(err.is_none());
        assert_eq!(mcps[0].url.as_deref(), Some("https://mcp.sentry.dev/mcp"));
        assert!(mcps[0].active);
    }

    #[test]
    fn version_gate_unknown_version_runs_all_sources() {
        let tmp = TempDir::new().unwrap();
        write_json(
            tmp.path(),
            "settings.json",
            serde_json::json!({
                "mcpServers": { "srv": { "command": "node", "args": [] } }
            }),
        );
        let source = super::super::manifest::McpSource {
            id: None,
            min_version: Some("99.0".to_string()),
            max_version: None,
            spec: McpSourceSpec::JsonKeyPair {
                file: tmp
                    .path()
                    .join("settings.json")
                    .to_string_lossy()
                    .to_string(),
                active_key: "mcpServers".to_string(),
                disabled_key: None,
                jsonc: false,
            },
        };
        // version = None (unknown) → gate is ignored, source runs
        let (mcps, err) = collect(&[source], None, tmp.path());
        assert!(err.is_none());
        assert_eq!(mcps.len(), 1, "unknown version should not skip sources");
    }

    #[test]
    fn claude_mcp_list_deduped_by_url_same_server_different_name() {
        // posthog plugin registers url "https://mcp.posthog.com/mcp" as name "posthog".
        // claude mcp list returns same URL as "plugin:posthog:posthog".
        // The fill-in-gaps source should drop the CLI entry because URL already seen.
        let tmp = TempDir::new().unwrap();

        // File source: plugin-provided posthog with known URL
        let plugin_settings = serde_json::json!({
            "mcpServers": {
                "posthog": {
                    "type": "http",
                    "url": "https://mcp.posthog.com/mcp"
                }
            }
        });
        write_json(tmp.path(), "plugin_mcp.json", plugin_settings);

        let file_source = wrap(McpSourceSpec::JsonKeyPair {
            file: tmp
                .path()
                .join("plugin_mcp.json")
                .to_string_lossy()
                .to_string(),
            active_key: "mcpServers".to_string(),
            disabled_key: None,
            jsonc: false,
        });

        // ClaudeMcpList output with same URL but different name
        let cli_output =
            "plugin:posthog:posthog: https://mcp.posthog.com/mcp (HTTP) - ✔ Connected\n\
            sentry: https://mcp.sentry.dev/mcp (HTTP) - ✔ Connected\n";
        let list_mcps = parse_mcp_list_output(cli_output);
        assert_eq!(list_mcps.len(), 2);

        // Simulate collect(): file source first, then ClaudeMcpList fill-in-gaps
        let (file_mcps, _) = collect(&[file_source], None, tmp.path());
        assert_eq!(file_mcps.len(), 1);
        assert_eq!(file_mcps[0].name, "posthog");

        let existing_names: std::collections::HashSet<String> =
            file_mcps.iter().map(|m| m.name.clone()).collect();
        let existing_urls: std::collections::HashSet<String> =
            file_mcps.iter().filter_map(|m| m.url.clone()).collect();

        let added: Vec<_> = list_mcps
            .into_iter()
            .filter(|m| {
                let name_seen = existing_names.contains(&m.name);
                let url_seen = m.url.as_ref().is_some_and(|u| existing_urls.contains(u));
                !name_seen && !url_seen
            })
            .collect();

        // plugin:posthog:posthog dropped (same URL); sentry kept (new URL)
        assert_eq!(added.len(), 1);
        assert_eq!(added[0].name, "sentry");
    }

    // ── toml_key_pair (Codex) ────────────────────────────────────────────────

    fn write_toml(dir: &std::path::Path, name: &str, content: &str) -> std::path::PathBuf {
        let p = dir.join(name);
        fs::write(&p, content).unwrap();
        p
    }

    #[test]
    fn toml_key_pair_reads_enabled_and_disabled_mcps() {
        let tmp = TempDir::new().unwrap();
        write_toml(
            tmp.path(),
            "config.toml",
            r#"
[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp"]

[mcp_servers.api-to-mcp-tyk]
command = "npx"
args = ["-y", "@tyk-technologies/api-to-mcp@latest"]
enabled = false
"#,
        );
        let source = McpSourceSpec::TomlKeyPair {
            file: tmp.path().join("config.toml").to_string_lossy().to_string(),
            active_key: "mcp_servers".to_string(),
            disabled_key: None,
            inline_toggle_field: Some("enabled".to_string()),
        };
        let (mcps, err) = collect(&[wrap(source)], None, tmp.path());
        assert!(err.is_none());
        assert_eq!(mcps.len(), 2);
        let playwright = mcps.iter().find(|m| m.name == "playwright").unwrap();
        assert!(
            playwright.active,
            "no enabled field should default to active"
        );
        let tyk = mcps.iter().find(|m| m.name == "api-to-mcp-tyk").unwrap();
        assert!(!tyk.active, "enabled=false should be inactive");
    }

    #[test]
    fn toml_key_pair_no_enabled_field_defaults_active() {
        let tmp = TempDir::new().unwrap();
        write_toml(
            tmp.path(),
            "config.toml",
            r#"
[mcp_servers.voice-mode]
command = "uvx"
args = ["voice-mode"]
"#,
        );
        let source = McpSourceSpec::TomlKeyPair {
            file: tmp.path().join("config.toml").to_string_lossy().to_string(),
            active_key: "mcp_servers".to_string(),
            disabled_key: None,
            inline_toggle_field: Some("enabled".to_string()),
        };
        let (mcps, _) = collect(&[wrap(source)], None, tmp.path());
        assert_eq!(mcps.len(), 1);
        assert!(mcps[0].active);
        assert_eq!(mcps[0].command, "uvx");
    }

    #[test]
    fn toml_key_pair_missing_file_returns_empty() {
        let tmp = TempDir::new().unwrap();
        let source = McpSourceSpec::TomlKeyPair {
            file: tmp
                .path()
                .join("nonexistent.toml")
                .to_string_lossy()
                .to_string(),
            active_key: "mcp_servers".to_string(),
            disabled_key: None,
            inline_toggle_field: Some("enabled".to_string()),
        };
        let (mcps, err) = collect(&[wrap(source)], None, tmp.path());
        assert!(mcps.is_empty());
        assert!(err.is_none());
    }
}
