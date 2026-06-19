mod app_state;
pub(crate) mod backup;
pub(crate) mod db;
pub(crate) mod detectors;
pub(crate) mod doctor;
pub(crate) mod engine;
pub(crate) mod error;
pub(crate) mod installer;
mod mcp_client;
pub(crate) mod models;
pub(crate) mod permissions;
mod watcher;

use crate::models::AiTool;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_positioner::{Position, WindowExt};

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

fn settings_path() -> std::path::PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("llmmanager")
        .join("settings.json")
}

fn read_settings() -> serde_json::Value {
    std::fs::read_to_string(settings_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}))
}

fn write_settings(val: serde_json::Value) -> Result<(), String> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, serde_json::to_string_pretty(&val).unwrap()).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// IPC commands – tools / window
// ---------------------------------------------------------------------------

#[tauri::command]
async fn get_tools(app: tauri::AppHandle) -> Vec<AiTool> {
    let tools = tokio::task::spawn_blocking(detectors::detect_all)
        .await
        .unwrap_or_default();
    // If the claude mcp list cache is cold, warm it in the background and
    // notify the frontend when done so it can re-fetch.
    if engine::mcp::is_claude_mcp_cache_cold() {
        let _ = app.emit("cloud-mcps-loading", ());
        let home = dirs::home_dir();
        let app_bg = app.clone();
        std::thread::spawn(move || {
            if let Some(h) = home {
                engine::mcp::warm_claude_mcp_list(&h);
            }
            let _ = app_bg.emit("tools-changed", ());
        });
    }
    tools
}

#[tauri::command]
fn hide_window(window: tauri::WebviewWindow) {
    let _ = window.hide();
}

#[tauri::command]
fn get_skill_full_description(path: String) -> Option<String> {
    detectors::read_skill_file_content(std::path::Path::new(&path))
}

#[tauri::command]
fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn get_autostart(app: tauri::AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let launcher = app.autolaunch();
    if enabled {
        launcher.enable().map_err(|e| e.to_string())
    } else {
        launcher.disable().map_err(|e| e.to_string())
    }
}

// ---------------------------------------------------------------------------
// IPC commands – global shortcut
// ---------------------------------------------------------------------------

const DEFAULT_SHORTCUT: &str = "CommandOrControl+Shift+Space";

#[tauri::command]
fn get_shortcut() -> String {
    read_settings()
        .get("globalShortcut")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| DEFAULT_SHORTCUT.to_string())
}

#[tauri::command]
fn set_shortcut(app: tauri::AppHandle, shortcut: String) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    // Unregister all currently registered shortcuts managed by this plugin
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())?;

    // Parse and register the new shortcut
    let parsed: tauri_plugin_global_shortcut::Shortcut =
        shortcut.parse().map_err(|e| format!("{e}"))?;

    app.global_shortcut()
        .on_shortcut(parsed, move |app_handle, _shortcut, event| {
            use tauri_plugin_global_shortcut::ShortcutState;
            if event.state() == ShortcutState::Pressed {
                toggle_main_window(app_handle);
            }
        })
        .map_err(|e| e.to_string())?;

    // Persist
    let mut settings = read_settings();
    settings["globalShortcut"] = serde_json::json!(shortcut);
    write_settings(settings)
}

// ---------------------------------------------------------------------------
// IPC commands – vibrancy
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_vibrancy() -> bool {
    read_settings()
        .get("vibrancy")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

#[tauri::command]
fn set_vibrancy(enabled: bool) -> Result<(), String> {
    let mut settings = read_settings();
    settings["vibrancy"] = serde_json::json!(enabled);
    write_settings(settings)
    // Vibrancy change takes effect on next window open (window is recreated)
}

// ---------------------------------------------------------------------------
// IPC commands – file system / opener
// ---------------------------------------------------------------------------

#[tauri::command]
fn read_skill_dir(path: String) -> Result<crate::models::FileEntry, String> {
    use std::path::Path;

    let root = Path::new(&path);
    if !root.exists() {
        return Err(format!("Path not found: {}", path));
    }
    read_entry(root, 0)
}

fn read_entry(path: &std::path::Path, depth: usize) -> Result<crate::models::FileEntry, String> {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string());

    let path_str = path.to_string_lossy().to_string();
    let is_dir = path.is_dir();

    let extension = if is_dir {
        None
    } else {
        path.extension().map(|e| e.to_string_lossy().to_string())
    };

    let children = if is_dir && depth < 3 {
        let mut entries: Vec<crate::models::FileEntry> = std::fs::read_dir(path)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .filter(|e| {
                // Skip hidden files and common noise
                let n = e.file_name().to_string_lossy().to_string();
                !n.starts_with('.') && n != "node_modules" && n != "__pycache__"
            })
            .filter_map(|e| read_entry(&e.path(), depth + 1).ok())
            .collect();

        // Sort: dirs first, then files, alphabetically within each group
        entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
        entries
    } else {
        vec![]
    };

    Ok(crate::models::FileEntry {
        name,
        path: path_str,
        is_dir,
        children,
        extension,
    })
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    tauri_plugin_opener::open_path(path, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Returns the first writable skills directory for `tool_id`, or an error.
fn skill_dir_for(tool_id: &str) -> Result<std::path::PathBuf, String> {
    use crate::engine::manifest::SkillSourceSpec;
    use crate::engine::resolve::expand_home;
    let home = dirs::home_dir().ok_or("cannot find home dir")?;
    let manifest = crate::engine::load_manifest(tool_id)
        .ok_or_else(|| format!("no manifest for '{tool_id}'"))?;
    for source in &manifest.skill_sources {
        let SkillSourceSpec::Directory { path, .. } = &source.spec;
        return Ok(expand_home(path, &home));
    }
    Err(format!("'{tool_id}' has no writable skill source"))
}

/// Slugify a name for use as a filename.
fn slugify(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

/// Write `content` as `{slug}.md` inside `dir`. Returns the created path.
fn write_skill_file(dir: &std::path::Path, slug: &str, content: &str) -> Result<String, String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let file_path = dir.join(format!("{slug}.md"));
    if file_path.exists() {
        return Err(format!("skill '{slug}.md' already exists in {}", dir.display()));
    }
    std::fs::write(&file_path, content).map_err(|e| e.to_string())?;
    Ok(file_path.to_string_lossy().into_owned())
}

#[tauri::command]
fn create_skill(
    tool_ids: Vec<String>,
    name: String,
    description: Option<String>,
) -> Result<Vec<String>, String> {
    if name.trim().is_empty() {
        return Err("skill name cannot be empty".into());
    }
    let slug = slugify(name.trim());
    if slug.is_empty() {
        return Err("invalid skill name".into());
    }
    let desc_line = description
        .as_deref()
        .filter(|d| !d.trim().is_empty())
        .map(|d| format!("description: {d}\n"))
        .unwrap_or_default();
    let content = format!(
        "---\nname: {name}\n{desc_line}---\n\n# {name}\n\n<!-- Describe what this skill does -->\n"
    );

    let mut paths = Vec::new();
    for tool_id in &tool_ids {
        let dir = skill_dir_for(tool_id)?;
        let path = write_skill_file(&dir, &slug, &content)?;
        paths.push(path);
    }
    Ok(paths)
}

#[tauri::command]
/// Convert a GitHub repo or blob URL to a fetchable raw URL pointing at SKILL.md.
///
/// Handles:
/// - https://github.com/owner/repo              → raw.githubusercontent.com/owner/repo/HEAD/SKILL.md
/// - https://github.com/owner/repo/tree/branch  → raw.githubusercontent.com/owner/repo/branch/SKILL.md
/// - https://github.com/owner/repo/blob/branch/path.md → raw.githubusercontent.com/.../path.md
/// - https://raw.githubusercontent.com/...      → unchanged
fn resolve_github_raw_url(url: &str) -> String {
    // Already raw — pass through
    if url.contains("raw.githubusercontent.com") {
        return url.to_string();
    }
    // Must be a github.com URL
    if !url.contains("github.com/") {
        return url.to_string();
    }
    // Strip scheme + host, leaving /owner/repo[/...]
    let path = url
        .split("github.com/")
        .nth(1)
        .unwrap_or("")
        .trim_end_matches('/');
    let parts: Vec<&str> = path.split('/').collect();
    if parts.len() < 2 {
        return url.to_string();
    }
    let (owner, repo) = (parts[0], parts[1]);
    // blob URL: /owner/repo/blob/branch/path
    if parts.len() >= 5 && parts[2] == "blob" {
        let branch = parts[3];
        let file_path = parts[4..].join("/");
        return format!("https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{file_path}");
    }
    // tree URL: /owner/repo/tree/branch
    let branch = if parts.len() >= 4 && parts[2] == "tree" { parts[3] } else { "HEAD" };
    format!("https://raw.githubusercontent.com/{owner}/{repo}/{branch}/SKILL.md")
}

#[tauri::command]
async fn install_skill_from_url(
    tool_ids: Vec<String>,
    url: String,
    name: Option<String>,
) -> Result<Vec<String>, String> {
    let fetch_url = resolve_github_raw_url(&url);

    // Fetch content
    let response = reqwest::get(&fetch_url).await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}: {}", response.status(), fetch_url));
    }
    let content = response.text().await.map_err(|e| e.to_string())?;

    // Derive name from URL if not provided
    let derived_name = name.unwrap_or_else(|| {
        url.split('/')
            .last()
            .unwrap_or("skill")
            .trim_end_matches(".md")
            .to_string()
    });
    let slug = slugify(derived_name.trim());
    if slug.is_empty() {
        return Err("could not derive a valid skill name from URL".into());
    }

    let mut paths = Vec::new();
    for tool_id in &tool_ids {
        let dir = skill_dir_for(tool_id)?;
        let path = write_skill_file(&dir, &slug, &content)?;
        paths.push(path);
    }
    Ok(paths)
}

#[tauri::command]
fn install_skill_from_path(
    tool_ids: Vec<String>,
    src_path: String,
    name: Option<String>,
) -> Result<Vec<String>, String> {
    let src = std::path::Path::new(&src_path);
    if !src.exists() {
        return Err(format!("path not found: {src_path}"));
    }

    let content = if src.is_file() {
        std::fs::read_to_string(src).map_err(|e| e.to_string())?
    } else if src.is_dir() {
        // Look for SKILL.md inside directory
        let skill_md = src.join("SKILL.md");
        if skill_md.exists() {
            std::fs::read_to_string(&skill_md).map_err(|e| e.to_string())?
        } else {
            return Err(format!("directory has no SKILL.md: {src_path}"));
        }
    } else {
        return Err(format!("unsupported path type: {src_path}"));
    };

    let derived_name = name.unwrap_or_else(|| {
        src.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("skill")
            .to_string()
    });
    let slug = slugify(derived_name.trim());
    if slug.is_empty() {
        return Err("could not derive a valid skill name from path".into());
    }

    let mut paths = Vec::new();
    for tool_id in &tool_ids {
        let dir = skill_dir_for(tool_id)?;
        let path = write_skill_file(&dir, &slug, &content)?;
        paths.push(path);
    }
    Ok(paths)
}

/// Map our tool ID to the agent name expected by the `skills` CLI (vercel-labs/skills).
fn skills_agent_name(tool_id: &str) -> Option<&'static str> {
    match tool_id {
        "claude"  => Some("claude-code"),
        "gemini"  => Some("gemini-cli"),
        "cursor"  => Some("cursor"),
        "windsurf"=> Some("windsurf"),
        "copilot" => Some("github-copilot"),
        _         => None,
    }
}


#[tauri::command]
async fn install_skill_from_github(
    app: tauri::AppHandle,
    db: tauri::State<'_, db::DbState>,
    tool_ids: Vec<String>,
    source: String,
    skill_filter: Option<String>,
) -> Result<String, String> {
    let npx = installer::find_npx()
        .ok_or("npx not found — install Node.js to use this feature")?;

    let mut combined_output = String::new();

    for tool_id in &tool_ids {
        let agent = skills_agent_name(tool_id)
            .ok_or_else(|| format!("'{tool_id}' is not supported by the skills CLI"))?;

        let mut cmd = tokio::process::Command::new(&npx);
        cmd.args(["skills", "add", source.trim(), "--agent", agent, "--global", "--copy", "-y"]);

        if let Some(ref filter) = skill_filter {
            let f = filter.trim();
            if !f.is_empty() {
                cmd.args(["--skill", f]);
            }
        }

        let output = cmd.output().await
            .map_err(|e| format!("failed to run npx: {e}"))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !output.status.success() {
            return Err(format!("skills add failed:\n{stderr}{stdout}"));
        }

        db::log_event(&db, "skill_github_installed", tool_id, source.trim(), None);
        if !combined_output.is_empty() { combined_output.push('\n'); }
        combined_output.push_str(stdout.trim());
    }

    let _ = app.emit("tools-changed", ());
    Ok(combined_output)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);

    // Only allow reads from known safe roots
    let home = dirs::home_dir().ok_or("cannot resolve home dir")?;
    let allowed_roots = [
        home.join(".claude"),
        home.join(".cursor"),
        home.join(".config"),
        home.join(".windsurf"),
        home.join(".codeium"),
        home.join("Library").join("Application Support"),
    ];
    let canonical = p.canonicalize().map_err(|e| e.to_string())?;
    if !allowed_roots.iter().any(|root| canonical.starts_with(root)) {
        return Err(format!("access denied: {path}"));
    }

    const MAX_BYTES: u64 = 1024 * 1024; // 1 MB
    let meta = std::fs::metadata(&canonical).map_err(|e| e.to_string())?;
    if meta.len() > MAX_BYTES {
        return Err(format!("file too large ({} bytes)", meta.len()));
    }

    std::fs::read_to_string(&canonical).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// IPC commands – MCP client
// ---------------------------------------------------------------------------

#[tauri::command]
async fn query_mcp_tools(
    command: String,
    args: Vec<String>,
    url: Option<String>,
) -> Result<Vec<mcp_client::McpTool>, String> {
    mcp_client::query_tools(&command, &args, url.as_deref()).await
}

// ---------------------------------------------------------------------------
// IPC commands – skill / MCP toggles
// ---------------------------------------------------------------------------

#[tauri::command]
fn set_skill_active(
    db: tauri::State<'_, db::DbState>,
    tool_id: String,
    skill_name: String,
    skill_path: String,
    active: bool,
) -> Result<(), String> {
    let result = app_state::move_skill_folder(&skill_path, &skill_name, active);
    if result.is_ok() {
        let detail = format!(r#"{{"active":{active}}}"#);
        db::log_event(&db, "skill_toggled", &tool_id, &skill_name, Some(&detail));
    }
    result
}

#[tauri::command]
fn set_mcp_active(
    db: tauri::State<'_, db::DbState>,
    tool_id: String,
    mcp_name: String,
    source_id: String,
    active: bool,
    extension_name: Option<String>,
) -> Result<(), String> {
    use crate::engine::manifest::McpSourceSpec;
    use crate::engine::resolve::expand_home;

    let home = dirs::home_dir().ok_or("cannot find home dir")?;
    let manifest = crate::engine::load_manifest(&tool_id)
        .ok_or_else(|| format!("no manifest for '{tool_id}'"))?;

    for (idx, source) in manifest.mcp_sources.iter().enumerate() {
        let eff_id = source
            .id
            .clone()
            .unwrap_or_else(|| format!("source_{}", idx));
        if eff_id != source_id {
            continue;
        }

        let result = match &source.spec {
            McpSourceSpec::JsonKeyPair {
                file,
                active_key,
                disabled_key,
                ..
            } => {
                let dk = disabled_key
                    .as_deref()
                    .ok_or("source has no disabled_key; toggling not supported for this source")?;
                let path = expand_home(file, &home);
                app_state::move_mcp_in_config(
                    &path.to_string_lossy(),
                    &mcp_name,
                    active,
                    active_key,
                    dk,
                )
            }
            McpSourceSpec::ExtensionDir {
                enablement_file: Some(ef),
                ..
            } => {
                let ext_name = extension_name
                    .as_deref()
                    .ok_or("extension_name required for extension-dir MCP toggle")?;
                let ef_path = expand_home(ef, &home);
                app_state::toggle_extension_active(&ef_path.to_string_lossy(), ext_name, active)
            }
            _ => Err(format!("source '{source_id}' does not support toggling")),
        };
        if result.is_ok() {
            let detail = format!(r#"{{"active":{active}}}"#);
            db::log_event(&db, "mcp_toggled", &tool_id, &mcp_name, Some(&detail));
        }
        return result;
    }

    Err(format!(
        "source '{source_id}' not found in '{tool_id}' manifest"
    ))
}

// ---------------------------------------------------------------------------
// IPC commands – MCP validation + add / remove (v1.1)
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
pub struct McpValidation {
    pub ok: bool,
    pub name_error: Option<String>,
    pub command_error: Option<String>,
    pub url_error: Option<String>,
}

impl McpValidation {
    fn pass() -> Self { Self { ok: true, name_error: None, command_error: None, url_error: None } }
    fn fail(self) -> Self { Self { ok: false, ..self } }
}

/// Resolve a binary against PATH.
fn which_in_path(bin: &str) -> bool {
    let path_val = std::env::var("PATH").unwrap_or_default();
    std::env::split_paths(&path_val)
        .any(|dir| {
            let p = dir.join(bin);
            p.exists() && p.metadata().map(|m| !m.is_dir()).unwrap_or(false)
        })
}

#[tauri::command]
fn validate_mcp(
    tool_id: String,
    name: String,
    command: Option<String>,
    url: Option<String>,
) -> McpValidation {
    use crate::engine::manifest::McpSourceSpec;
    use crate::engine::resolve::expand_home;

    let mut v = McpValidation::pass();

    // --- name ---
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        v.name_error = Some("Name is required".into());
    } else if !trimmed_name.chars().all(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '.')) {
        v.name_error = Some("Name may only contain letters, numbers, hyphens, underscores, dots".into());
    } else if let Ok(home) = dirs::home_dir().ok_or("") {
        // Check for existing name in tool's config
        if let Some(manifest) = crate::engine::load_manifest(&tool_id) {
            for source in &manifest.mcp_sources {
                if let McpSourceSpec::JsonKeyPair { file, active_key, disabled_key, .. } = &source.spec {
                    let path = expand_home(file, &home);
                    if let Ok(raw) = std::fs::read_to_string(&path) {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
                            let check_key = |key: &str| {
                                val.get(key)
                                    .and_then(|v| v.as_object())
                                    .map(|obj| obj.contains_key(trimmed_name))
                                    .unwrap_or(false)
                            };
                            if check_key(active_key) || disabled_key.as_deref().map(check_key).unwrap_or(false) {
                                v.name_error = Some(format!("MCP '{trimmed_name}' already exists in this tool"));
                            }
                        }
                    }
                }
            }
        }
    }

    // --- command (stdio) ---
    if url.is_none() {
        if let Some(cmd) = command.as_deref() {
            let cmd = cmd.trim();
            if cmd.is_empty() {
                v.command_error = Some("Command is required for stdio MCPs".into());
            } else if !which_in_path(cmd) {
                v.command_error = Some(format!(
                    "'{cmd}' not found on PATH — make sure it is installed and in your shell PATH"
                ));
            }
        }
    }

    // --- url (HTTP) ---
    if let Some(u) = url.as_deref() {
        let u = u.trim();
        if u.is_empty() {
            v.url_error = Some("URL is required".into());
        } else if !u.starts_with("http://") && !u.starts_with("https://") {
            v.url_error = Some("URL must start with http:// or https://".into());
        } else if !u.contains('.') && !u.contains("localhost") {
            v.url_error = Some("URL does not look valid — missing hostname".into());
        }
    }

    if v.name_error.is_some() || v.command_error.is_some() || v.url_error.is_some() {
        v.fail()
    } else {
        v
    }
}

#[tauri::command]
fn add_mcp(
    db: tauri::State<'_, db::DbState>,
    tool_id: String,
    name: String,
    command: Option<String>,
    args: Option<Vec<String>>,
    url: Option<String>,
) -> Result<(), String> {
    use crate::engine::manifest::McpSourceSpec;
    use crate::engine::resolve::expand_home;

    let home = dirs::home_dir().ok_or("cannot find home dir")?;
    let manifest = crate::engine::load_manifest(&tool_id)
        .ok_or_else(|| format!("no manifest for '{tool_id}'"))?;

    for source in &manifest.mcp_sources {
        if let McpSourceSpec::JsonKeyPair { file, active_key, .. } = &source.spec {
            let path = expand_home(file, &home);
            let entry = if let Some(u) = &url {
                serde_json::json!({ "url": u })
            } else {
                serde_json::json!({
                    "command": command.as_deref().unwrap_or(""),
                    "args": args.as_deref().unwrap_or(&[]),
                })
            };
            let result =
                app_state::add_mcp_to_config(&path.to_string_lossy(), active_key, &name, entry);
            if result.is_ok() {
                db::log_event(&db, "mcp_added", &tool_id, &name, None);
            }
            return result;
        }
    }
    Err(format!("'{tool_id}' has no writable MCP source"))
}

#[tauri::command]
fn remove_mcp(
    db: tauri::State<'_, db::DbState>,
    tool_id: String,
    mcp_name: String,
    source_id: String,
) -> Result<(), String> {
    use crate::engine::manifest::McpSourceSpec;
    use crate::engine::resolve::expand_home;

    let home = dirs::home_dir().ok_or("cannot find home dir")?;
    let manifest = crate::engine::load_manifest(&tool_id)
        .ok_or_else(|| format!("no manifest for '{tool_id}'"))?;

    for (idx, source) in manifest.mcp_sources.iter().enumerate() {
        let eff_id = source
            .id
            .clone()
            .unwrap_or_else(|| format!("source_{}", idx));
        if eff_id != source_id {
            continue;
        }
        if let McpSourceSpec::JsonKeyPair {
            file,
            active_key,
            disabled_key,
            ..
        } = &source.spec
        {
            let path = expand_home(file, &home);
            let result = app_state::remove_mcp_from_config(
                &path.to_string_lossy(),
                active_key,
                disabled_key.as_deref(),
                &mcp_name,
            );
            if result.is_ok() {
                db::log_event(&db, "mcp_removed", &tool_id, &mcp_name, None);
            }
            return result;
        }
        return Err(format!("source '{source_id}' does not support MCP removal"));
    }
    Err(format!(
        "source '{source_id}' not found in '{tool_id}' manifest"
    ))
}

// ---------------------------------------------------------------------------
// IPC commands – permissions (v0.11)
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_permissions(tool_id: String) -> Result<permissions::ToolPermissions, String> {
    let home = dirs::home_dir().ok_or("cannot find home dir")?;
    let manifest = crate::engine::load_manifest(&tool_id)
        .ok_or_else(|| format!("no manifest for '{tool_id}'"))?;
    let spec = manifest
        .permissions
        .ok_or_else(|| format!("'{tool_id}' manifest has no permissions section"))?;
    permissions::read(&spec, &home)
}

#[tauri::command]
fn add_permission_rule(
    tool_id: String,
    rule: String,
    section: permissions::PermissionSection,
) -> Result<(), String> {
    let home = dirs::home_dir().ok_or("cannot find home dir")?;
    let manifest = crate::engine::load_manifest(&tool_id)
        .ok_or_else(|| format!("no manifest for '{tool_id}'"))?;
    let spec = manifest
        .permissions
        .ok_or_else(|| format!("'{tool_id}' manifest has no permissions section"))?;
    permissions::add_rule(&spec, &home, &rule, section)
}

#[tauri::command]
fn remove_permission_rule(
    tool_id: String,
    rule: String,
    section: permissions::PermissionSection,
) -> Result<(), String> {
    let home = dirs::home_dir().ok_or("cannot find home dir")?;
    let manifest = crate::engine::load_manifest(&tool_id)
        .ok_or_else(|| format!("no manifest for '{tool_id}'"))?;
    let spec = manifest
        .permissions
        .ok_or_else(|| format!("'{tool_id}' manifest has no permissions section"))?;
    permissions::remove_rule(&spec, &home, &rule, section)
}

// ---------------------------------------------------------------------------
// IPC commands – backup / restore
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupEntry {
    timestamp_ms: u128,
    path: String,
}

#[tauri::command]
fn list_config_backups(config_path: String) -> Vec<BackupEntry> {
    backup::list_snapshots(&config_path)
        .into_iter()
        .map(|(ts, p)| BackupEntry {
            timestamp_ms: ts,
            path: p.to_string_lossy().to_string(),
        })
        .collect()
}

#[tauri::command]
fn restore_config_backup(config_path: String, timestamp_ms: u128) -> Result<(), String> {
    // Snapshot the current file before overwriting so the restore itself is undoable.
    if let Err(e) = backup::snapshot(&config_path) {
        eprintln!("[backup] pre-restore snapshot failed: {e}");
    }
    backup::restore_snapshot(&config_path, timestamp_ms)
}

#[tauri::command]
fn read_backup_content(backup_path: String) -> Result<String, String> {
    let p = std::path::Path::new(&backup_path);
    // Only allow reads from the llmmanager backup directory.
    let data_dir = dirs::data_dir()
        .ok_or("cannot resolve data dir")?
        .join("llmmanager")
        .join("backups");
    let canonical = p.canonicalize().map_err(|e| e.to_string())?;
    if !canonical.starts_with(&data_dir) {
        return Err("access denied: path outside backup directory".to_string());
    }
    std::fs::read_to_string(&canonical).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// IPC commands – npm installer (v0.13)
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NpmInstallState {
    package: Option<String>,
    installed_version: Option<String>,
    is_npx: bool,
}

#[tauri::command]
fn get_mcp_install_state(command: String, args: Vec<String>) -> NpmInstallState {
    let package = installer::npm_package_from_mcp(&command, &args);
    let is_npx = package.is_some();
    let installed_version = package
        .as_deref()
        .and_then(installer::get_npm_installed_version);
    NpmInstallState {
        package,
        installed_version,
        is_npx,
    }
}

#[tauri::command]
async fn install_mcp_npm(
    app: tauri::AppHandle,
    tool_id: String,
    mcp_name: String,
    package_name: String,
) -> Result<String, String> {
    let version = installer::install_npm_global(&package_name).await?;
    let detail = format!(
        r#"{{"version":"{}","package":"{}"}}"#,
        version, package_name
    );
    let db = app.state::<db::DbState>();
    db::log_event(&db, "mcp_npm_installed", &tool_id, &mcp_name, Some(&detail));
    let _ = app.emit("tools-changed", ());
    Ok(version)
}

#[tauri::command]
async fn get_mcp_npm_latest(package_name: String) -> Option<String> {
    installer::get_npm_latest_version(&package_name).await
}

// ---------------------------------------------------------------------------
// IPC commands – notifications (v0.9)
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_notifications(db: tauri::State<'_, db::DbState>) -> Result<Vec<db::Notification>, String> {
    db::get_active_notifications(&db).map_err(|e| e.to_string())
}

#[tauri::command]
fn dismiss_notification(db: tauri::State<'_, db::DbState>, id: i64) -> Result<(), String> {
    db::dismiss_notification(&db, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn dismiss_all_notifications(db: tauri::State<'_, db::DbState>) -> Result<(), String> {
    db::dismiss_all_notifications(&db).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
struct AuditEvent {
    id: i64,
    ts_ms: i64,
    event_type: String,
    tool_id: String,
    item_name: String,
    detail: Option<String>,
}

#[tauri::command]
fn get_audit_log(
    db: tauri::State<'_, db::DbState>,
    limit: Option<i64>,
) -> Result<Vec<AuditEvent>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(200);
    let mut stmt = conn
        .prepare(
            "SELECT id, ts_ms, event_type, tool_id, item_name, detail
             FROM audit_events ORDER BY id DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let events = stmt
        .query_map([limit], |row| {
            Ok(AuditEvent {
                id: row.get(0)?,
                ts_ms: row.get(1)?,
                event_type: row.get(2)?,
                tool_id: row.get(3)?,
                item_name: row.get(4)?,
                detail: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(events)
}

// ---------------------------------------------------------------------------
// IPC commands – debug helpers
// ---------------------------------------------------------------------------

#[tauri::command]
fn debug_add_notification(
    db: tauri::State<'_, db::DbState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Use a timestamp-based key so each click creates a new notification
    let key = format!(
        "debug:test:{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );
    db::add_notification(
        &db,
        "warn",
        "Test notification",
        "This is a test notification. Doctor fires real ones when an MCP binary is missing from PATH.",
        Some(&key),
    ).map_err(|e| e.to_string())?;
    let _ = app.emit("notifications-changed", ());
    Ok(())
}

// ---------------------------------------------------------------------------
// IPC commands – app lifecycle
// ---------------------------------------------------------------------------

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

// ---------------------------------------------------------------------------
// IPC commands – updater
// ---------------------------------------------------------------------------

#[tauri::command]
async fn check_for_update(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
    use tauri_plugin_updater::UpdaterExt;
    match app.updater().map_err(|e| e.to_string())?.check().await {
        Ok(Some(update)) => Ok(Some(serde_json::json!({
            "version": update.version,
            "currentVersion": update.current_version,
        }))),
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// App entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Second instance tried to launch — toggle existing window instead
            toggle_main_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            app.manage(db::open());

            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let quit = MenuItem::with_id(app, "quit", "Quit LLM Manager", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&settings, &quit])?;

            let tray = TrayIconBuilder::new()
                .icon(tauri::include_image!("icons/tray_icon@2x.png"))
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        toggle_main_window(app);
                    }
                })
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "quit" => app.exit(0),
                    "settings" => open_main_window(app, Some("settings")),
                    _ => {}
                })
                .build(app)?;

            let _tray = tray;

            // Register global shortcut
            {
                use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
                let shortcut_str = get_shortcut();
                if let Ok(shortcut) = shortcut_str.parse::<Shortcut>() {
                    let _ = app.global_shortcut().on_shortcut(
                        shortcut,
                        move |app_handle, _shortcut, event| {
                            if event.state() == ShortcutState::Pressed {
                                toggle_main_window(app_handle);
                            }
                        },
                    );
                }
            }

            // Start FSEvents file watcher — emits "tools-changed" to frontend
            watcher::start(app.handle().clone());

            // Initial Doctor run — detect missing MCP binaries
            {
                let app_bg = app.handle().clone();
                std::thread::spawn(move || {
                    let tools = detectors::detect_all();
                    let db = app_bg.state::<db::DbState>();
                    doctor::run(&tools, &db, &app_bg);
                });
            }

            // In test mode, auto-open the window so WebDriver can connect
            if std::env::var("AICONTEXTBAR_TEST").is_ok() {
                open_main_window(app.handle(), None);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_tools,
            get_skill_full_description,
            hide_window,
            get_version,
            get_autostart,
            set_autostart,
            get_shortcut,
            set_shortcut,
            get_vibrancy,
            set_vibrancy,
            read_skill_dir,
            open_path,
            open_url,
            create_skill,
            install_skill_from_url,
            install_skill_from_path,
            install_skill_from_github,
            read_text_file,
            check_for_update,
            query_mcp_tools,
            set_skill_active,
            set_mcp_active,
            validate_mcp,
            add_mcp,
            remove_mcp,
            list_config_backups,
            restore_config_backup,
            read_backup_content,
            get_permissions,
            add_permission_rule,
            remove_permission_rule,
            get_mcp_install_state,
            install_mcp_npm,
            get_mcp_npm_latest,
            debug_add_notification,
            get_notifications,
            dismiss_notification,
            dismiss_all_notifications,
            get_audit_log,
            quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error running LLM Manager");
}

// ---------------------------------------------------------------------------
// Window helpers
// ---------------------------------------------------------------------------

fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.move_window(Position::TrayCenter);
            let _ = window.show();
            let _ = window.set_focus();
        }
    } else {
        open_main_window(app, None);
    }
}

fn open_main_window(app: &tauri::AppHandle, hash: Option<&str>) {
    let url = match hash {
        Some(h) => WebviewUrl::App(format!("/#{}", h).into()),
        None => WebviewUrl::default(),
    };
    if let Some(window) = app.get_webview_window("main") {
        // Navigate existing window to settings hash
        // Use JSON-encode to prevent JS injection via hash value
        let hash_json = serde_json::to_string(hash.unwrap_or("")).unwrap_or_default();
        let _ = window.eval(format!("window.location.hash = {hash_json}"));
        let _ = window.move_window(Position::TrayCenter);
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let window = WebviewWindowBuilder::new(app, "main", url)
        .title("LLM Manager")
        .inner_size(380.0, 520.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .build()
        .unwrap();

    #[cfg(target_os = "macos")]
    if get_vibrancy() {
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
        let _ = apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None);
    }

    let win_blur = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Focused(false) = event {
            let _ = win_blur.hide();
        }
    });
    let _ = window.move_window(Position::TrayCenter);
    let _ = window.show();
    let _ = window.set_focus();
}

#[cfg(test)]
mod tests {
    use super::resolve_github_raw_url;

    #[test]
    fn github_repo_url_becomes_skill_md() {
        assert_eq!(
            resolve_github_raw_url("https://github.com/obra/superpowers"),
            "https://raw.githubusercontent.com/obra/superpowers/HEAD/SKILL.md"
        );
    }

    #[test]
    fn github_tree_url_uses_branch() {
        assert_eq!(
            resolve_github_raw_url("https://github.com/obra/superpowers/tree/main"),
            "https://raw.githubusercontent.com/obra/superpowers/main/SKILL.md"
        );
    }

    #[test]
    fn github_blob_url_passes_through_file() {
        assert_eq!(
            resolve_github_raw_url("https://github.com/obra/superpowers/blob/main/MY-SKILL.md"),
            "https://raw.githubusercontent.com/obra/superpowers/main/MY-SKILL.md"
        );
    }

    #[test]
    fn raw_url_unchanged() {
        let raw = "https://raw.githubusercontent.com/obra/superpowers/main/SKILL.md";
        assert_eq!(resolve_github_raw_url(raw), raw);
    }

    #[test]
    fn non_github_url_unchanged() {
        let other = "https://example.com/my-skill.md";
        assert_eq!(resolve_github_raw_url(other), other);
    }
}
