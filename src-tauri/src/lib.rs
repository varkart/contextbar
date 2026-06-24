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
        .join("contextbar")
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

// ---------------------------------------------------------------------------
// IPC commands – Accessibility permission
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
fn ax_is_process_trusted() -> bool {
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
    }
    unsafe { AXIsProcessTrusted() }
}

#[cfg(not(target_os = "macos"))]
fn ax_is_process_trusted() -> bool { true }

#[tauri::command]
fn check_accessibility() -> bool {
    ax_is_process_trusted()
}

#[tauri::command]
fn open_accessibility_settings() {
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .spawn();
}

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
fn reveal_in_finder(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Skill cache commands
// ---------------------------------------------------------------------------

/// Background-populate the cache for skills that were installed before the cache
/// existed. Reads SKILL.md from every detected skill and upserts into skill_cache
/// with method="detected" if the skill has no existing cache entry with a richer method.
#[tauri::command]
fn warm_skill_cache(db: tauri::State<'_, db::DbState>) {
    let tools = detectors::detect_all();
    for tool in tools {
        for skill in tool.skills {
            if db::is_skill_cached(&db, &skill.name) {
                continue;
            }
            if let Some(content) = detectors::read_skill_file_content(std::path::Path::new(&skill.path)) {
                db::cache_skill(&db, &skill.name, &content, "detected", skill.source_url.as_deref());
            }
        }
    }
}

/// Spawn a fire-and-forget task to resolve and store the npm source URL for an MCP.
/// Uses Option B (registry fetch + HEAD validation) with Option A (npmjs.com) fallback.
fn enrich_mcp_source_url(app: tauri::AppHandle, mcp_name: String, package_name: String) {
    // Use tauri's runtime — safe to call from both sync and async Tauri commands.
    // tokio::spawn panics from sync command contexts (no active Tokio context on caller thread).
    tauri::async_runtime::spawn(async move {
        if let Some(source_url) = installer::fetch_npm_source_url(&package_name).await {
            let db = app.state::<db::DbState>();
            db::update_mcp_source_url(&db, &mcp_name, &source_url);
        }
    });
}

/// Populate mcp_cache with install info for all currently detected MCPs.
/// Runs on startup — skips MCPs already in cache so existing entries aren't overwritten.
/// Also enriches source_url for cached MCPs that don't have one yet.
#[tauri::command]
async fn warm_mcp_cache(app: tauri::AppHandle, db: tauri::State<'_, db::DbState>) -> Result<(), ()> {
    let tools = tokio::task::spawn_blocking(detectors::detect_all)
        .await
        .unwrap_or_default();
    for tool in tools {
        for mcp in tool.mcps {
            let already_cached = db::is_mcp_cached(&db, &mcp.name);
            if !already_cached {
                db::cache_mcp(
                    &db,
                    &mcp.name,
                    if mcp.command.is_empty() { None } else { Some(mcp.command.as_str()) },
                    &mcp.args,
                    mcp.url.as_deref(),
                );
            }
            // Enrich source_url if missing (covers both new and existing cache entries)
            let needs_url = db::get_cached_mcp(&db, &mcp.name)
                .map(|c| c.source_url.is_none())
                .unwrap_or(false);
            if needs_url {
                if let Some(pkg) = installer::npm_package_from_mcp(&mcp.command, &mcp.args) {
                    enrich_mcp_source_url(app.clone(), mcp.name, pkg);
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn get_all_cached_mcps(db: tauri::State<'_, db::DbState>) -> Vec<db::CachedMcp> {
    db::get_all_cached_mcps(&db)
}

/// Return cache metadata for a skill so the frontend knows whether a re-install
/// can be attempted without user input.
#[tauri::command]
fn get_skill_cache_status(
    db: tauri::State<'_, db::DbState>,
    skill_name: String,
) -> Option<db::CachedSkill> {
    db::get_cached_skill(&db, &skill_name)
}

/// Add a skill to a target tool using the best available content source:
///  1. skill_cache (always preferred — path-independent)
///  2. Re-fetch from install_source URL if method == "url"
///  3. Live copy from any tool that currently has the skill (enabled or disabled)
///
/// This replaces the old `install_skill_from_path` path for cross-tool adds.
#[tauri::command]
async fn add_skill_to_tool(
    db: tauri::State<'_, db::DbState>,
    app: tauri::AppHandle,
    skill_name: String,
    tool_id: String,
) -> Result<String, String> {
    // 1. Try cache
    if let Some(cached) = db::get_cached_skill(&db, &skill_name) {
        let content = if cached.install_method == "url" {
            // Try re-fetching to get the freshest content; fall back to cached if fetch fails
            if let Some(ref source) = cached.install_source {
                if let Ok(resp) = reqwest::get(source.as_str()).await {
                    if resp.status().is_success() {
                        if let Ok(fresh) = resp.text().await {
                            if validate_skill_content(&fresh).is_ok() {
                                db::cache_skill(&db, &skill_name, &fresh, "url", Some(source));
                                fresh
                            } else {
                                cached.content
                            }
                        } else { cached.content }
                    } else { cached.content }
                } else { cached.content }
            } else { cached.content }
        } else {
            cached.content
        };

        let dir = skill_dir_for(&tool_id)?;
        let path = write_skill_file(&dir, &skill_name, &content)?;
        db::log_event(&db, "skill_added_to_tool", &tool_id, &skill_name, Some("from_cache"));
        let _ = app.emit("tools-changed", ());
        return Ok(path);
    }

    // 2. Live copy: find skill in any detected tool (enabled or disabled)
    let tools = tokio::task::spawn_blocking(detectors::detect_all)
        .await
        .unwrap_or_default();

    for tool in &tools {
        if tool.id == tool_id { continue; }
        if let Some(skill) = tool.skills.iter().find(|s| s.name == skill_name) {
            if let Some(content) = detectors::read_skill_file_content(std::path::Path::new(&skill.path)) {
                db::cache_skill(&db, &skill_name, &content, "copy", skill.source_url.as_deref());
                let dir = skill_dir_for(&tool_id)?;
                let path = write_skill_file(&dir, &skill_name, &content)?;
                db::log_event(&db, "skill_added_to_tool", &tool_id, &skill_name, Some("from_live_copy"));
                let _ = app.emit("tools-changed", ());
                return Ok(path);
            }
        }
    }

    Err(format!(
        "skill '{skill_name}' not found in cache or any provider — re-add from URL or local path"
    ))
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Returns the first writable skills directory for `tool_id`, or an error.
struct SkillWriteTarget {
    dir: std::path::PathBuf,
    flat_files: bool,
}

fn skill_dir_for(tool_id: &str) -> Result<SkillWriteTarget, String> {
    use crate::engine::manifest::SkillSourceSpec;
    use crate::engine::resolve::expand_home;
    let home = dirs::home_dir().ok_or("cannot find home dir")?;
    let manifest = crate::engine::load_manifest(tool_id)
        .ok_or_else(|| format!("no manifest for '{tool_id}'"))?;
    if let Some(source) = manifest.skill_sources.first() {
        match &source.spec {
            SkillSourceSpec::Directory { path, flat_files, .. } => {
                return Ok(SkillWriteTarget {
                    dir: expand_home(path, &home),
                    flat_files: *flat_files,
                });
            }
            SkillSourceSpec::TomlConfigDirectory { path, .. } => {
                return Ok(SkillWriteTarget {
                    dir: expand_home(path, &home),
                    flat_files: false,
                });
            }
        }
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

/// Write skill content for `slug` using the target's format. Returns the created path.
/// - flat_files=true  → `{dir}/{slug}.md` (e.g. Windsurf workflows)
/// - flat_files=false → `{dir}/{slug}/SKILL.md` subdirectory (e.g. Codex, Claude)
fn write_skill_file(target: &SkillWriteTarget, slug: &str, content: &str) -> Result<String, String> {
    if target.flat_files {
        std::fs::create_dir_all(&target.dir).map_err(|e| e.to_string())?;
        let file_path = target.dir.join(format!("{slug}.md"));
        if file_path.exists() {
            return Err(format!("skill '{slug}.md' already exists in {}", target.dir.display()));
        }
        std::fs::write(&file_path, content).map_err(|e| e.to_string())?;
        Ok(file_path.to_string_lossy().into_owned())
    } else {
        let skill_dir = target.dir.join(slug);
        std::fs::create_dir_all(&skill_dir).map_err(|e| e.to_string())?;
        let file_path = skill_dir.join("SKILL.md");
        if file_path.exists() {
            return Err(format!("skill '{slug}' already exists in {}", target.dir.display()));
        }
        std::fs::write(&file_path, content).map_err(|e| e.to_string())?;
        Ok(skill_dir.to_string_lossy().into_owned())
    }
}

#[tauri::command]
fn create_skill(
    db: tauri::State<'_, db::DbState>,
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

    db::cache_skill(&db, &slug, &content, "template", None);
    let mut paths = Vec::new();
    for tool_id in &tool_ids {
        let dir = skill_dir_for(tool_id)?;
        let path = write_skill_file(&dir, &slug, &content)?;
        db::log_event(&db, "skill_created", tool_id, &slug, None);
        paths.push(path);
    }
    Ok(paths)
}

/// Reject content that is clearly not a SKILL.md file.
fn validate_skill_content(content: &str) -> Result<(), String> {
    let trimmed = content.trim_start();
    if trimmed.is_empty() {
        return Err("file is empty".into());
    }
    if trimmed.starts_with("<!DOCTYPE") || trimmed.starts_with("<html") || trimmed.starts_with("<HTML") {
        return Err(
            "fetched content is an HTML page, not a SKILL.md file.\n\
             Paste the GitHub repo URL (e.g. https://github.com/owner/repo) \
             or a direct link to a raw .md file.".into(),
        );
    }
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        return Err("fetched content looks like JSON, not a SKILL.md file.".into());
    }
    Ok(())
}

/// For a github.com blob URL, return the equivalent raw.githubusercontent.com URL.
/// Returns None for repo/tree URLs (handled by the API search path).
fn github_blob_to_raw(url: &str) -> Option<String> {
    if url.contains("raw.githubusercontent.com") {
        return Some(url.to_string());
    }
    if !url.contains("github.com/") {
        return None; // not GitHub at all
    }
    let path = url.split("github.com/").nth(1)?.trim_end_matches('/');
    let parts: Vec<&str> = path.split('/').collect();
    if parts.len() >= 5 && parts[2] == "blob" {
        let (owner, repo, branch) = (parts[0], parts[1], parts[3]);
        let file_path = parts[4..].join("/");
        return Some(format!("https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{file_path}"));
    }
    None // repo or tree URL — caller should use the API
}

/// For a github.com repo or tree URL, return (owner, repo, branch).
fn parse_github_repo_url(url: &str) -> Option<(String, String, String)> {
    if url.contains("raw.githubusercontent.com") {
        return None;
    }
    if !url.contains("github.com/") {
        return None;
    }
    let path = url.split("github.com/").nth(1)?.trim_end_matches('/');
    let parts: Vec<&str> = path.split('/').collect();
    if parts.len() < 2 {
        return None;
    }
    let (owner, repo) = (parts[0], parts[1]);
    if parts.len() >= 3 && parts[2] == "blob" {
        return None; // blob → direct file, not a repo search
    }
    let branch = if parts.len() >= 4 && parts[2] == "tree" { parts[3] } else { "HEAD" };
    Some((owner.to_string(), repo.to_string(), branch.to_string()))
}

/// Search a GitHub repo for SKILL.md files up to 2 directory levels deep,
/// fetch each one, and return (skill_name, content) pairs.
async fn github_find_skill_mds(
    owner: &str,
    repo: &str,
    branch_hint: &str, // "HEAD" means resolve from API
    max_depth: usize,  // max path segments, e.g. 2 = "dir/SKILL.md"
) -> Result<Vec<(String, String)>, String> {
    let client = reqwest::Client::builder()
        .user_agent("contextbar")
        .build()
        .map_err(|e| e.to_string())?;

    // Resolve "HEAD" → actual default branch name (the trees API rejects "HEAD")
    let branch = if branch_hint == "HEAD" {
        let repo_resp = client
            .get(format!("https://api.github.com/repos/{owner}/{repo}"))
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !repo_resp.status().is_success() {
            return Err(format!(
                "GitHub API error {} for {owner}/{repo} — repo may be private or not exist",
                repo_resp.status()
            ));
        }
        let meta: serde_json::Value = repo_resp.json().await.map_err(|e| e.to_string())?;
        meta["default_branch"]
            .as_str()
            .unwrap_or("main")
            .to_string()
    } else {
        branch_hint.to_string()
    };

    let raw_base = format!("https://raw.githubusercontent.com/{owner}/{repo}/{branch}");
    let api_url = format!(
        "https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
    );

    let tree_resp = client
        .get(&api_url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !tree_resp.status().is_success() {
        return Err(format!(
            "GitHub API error {} fetching tree for {owner}/{repo}@{branch}",
            tree_resp.status()
        ));
    }

    let tree: serde_json::Value = tree_resp.json().await.map_err(|e| e.to_string())?;
    let items = tree["tree"]
        .as_array()
        .ok_or_else(|| "unexpected GitHub API response".to_string())?;

    // Collect SKILL.md paths at depth ≤ 2 (e.g. "SKILL.md" or "subdir/SKILL.md")
    let skill_paths: Vec<String> = items
        .iter()
        .filter_map(|item| {
            let path = item["path"].as_str()?;
            let type_ = item["type"].as_str()?;
            if type_ != "blob" {
                return None;
            }
            let parts: Vec<&str> = path.split('/').collect();
            if parts.len() <= max_depth && *parts.last().unwrap() == "SKILL.md" {
                Some(path.to_string())
            } else {
                None
            }
        })
        .collect();

    if skill_paths.is_empty() {
        return Err(format!(
            "no SKILL.md found in {owner}/{repo} (searched up to 2 directory levels)"
        ));
    }

    // Fetch each SKILL.md and validate
    let mut results = Vec::new();
    for path in &skill_paths {
        let raw_url = format!("{raw_base}/{path}");
        let resp = client
            .get(&raw_url)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            continue;
        }
        let content = resp.text().await.map_err(|e| e.to_string())?;
        if validate_skill_content(&content).is_err() {
            continue;
        }
        // Name: parent directory of SKILL.md, or repo name if at root
        let parts: Vec<&str> = path.split('/').collect();
        let name = if parts.len() >= 2 {
            parts[parts.len() - 2].to_string()
        } else {
            repo.to_string()
        };
        results.push((name, content));
    }

    if results.is_empty() {
        return Err(format!(
            "SKILL.md files found in {owner}/{repo} but none had valid content"
        ));
    }

    Ok(results)
}

#[tauri::command]
async fn install_skill_from_url(
    db: tauri::State<'_, db::DbState>,
    tool_ids: Vec<String>,
    url: String,
    name: Option<String>,
    max_depth: Option<u32>,
) -> Result<Vec<String>, String> {
    let depth = max_depth.unwrap_or(2).clamp(1, 10) as usize;

    // GitHub repo/tree URL → search the repo with the API
    if let Some((owner, repo, branch)) = parse_github_repo_url(&url) {
        let skills = github_find_skill_mds(&owner, &repo, &branch, depth).await?;
        let multi = skills.len() > 1;
        let mut all_paths = Vec::new();
        for (skill_name, content) in skills {
            // Single skill: name param replaces the dir name entirely.
            // Multiple skills: name param becomes a prefix → "{prefix}-{dir_name}".
            let final_name = match &name {
                Some(prefix) if multi => format!("{}-{}", prefix.trim(), skill_name),
                Some(n) => n.trim().to_string(),
                None => skill_name,
            };
            let slug = slugify(&final_name);
            if slug.is_empty() {
                continue;
            }
            db::cache_skill(&db, &slug, &content, "url", Some(&url));
            for tool_id in &tool_ids {
                let dir = skill_dir_for(tool_id)?;
                let path = write_skill_file(&dir, &slug, &content)?;
                db::log_event(&db, "skill_installed_url", tool_id, &slug, Some(&url));
                all_paths.push(path);
            }
        }
        return Ok(all_paths);
    }

    // Blob URL or raw URL or non-GitHub URL → fetch directly
    let fetch_url = github_blob_to_raw(&url).unwrap_or_else(|| url.clone());
    let response = reqwest::get(&fetch_url).await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}: {}", response.status(), fetch_url));
    }
    let content = response.text().await.map_err(|e| e.to_string())?;
    validate_skill_content(&content)?;

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

    db::cache_skill(&db, &slug, &content, "url", Some(&url));
    let mut paths = Vec::new();
    for tool_id in &tool_ids {
        let dir = skill_dir_for(tool_id)?;
        let path = write_skill_file(&dir, &slug, &content)?;
        db::log_event(&db, "skill_installed_url", tool_id, &slug, Some(&url));
        paths.push(path);
    }
    Ok(paths)
}

#[tauri::command]
fn install_skill_from_path(
    db: tauri::State<'_, db::DbState>,
    tool_ids: Vec<String>,
    src_path: String,
    name: Option<String>,
) -> Result<Vec<String>, String> {
    let src = std::path::Path::new(&src_path);
    if !src.exists() {
        return Err(format!("path not found: {src_path}"));
    }

    let content = if src.is_file() {
        let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("");
        if ext != "md" {
            return Err(format!(
                "expected a .md file, got .{ext} — point to a SKILL.md file or a directory containing one"
            ));
        }
        std::fs::read_to_string(src).map_err(|e| e.to_string())?
    } else if src.is_dir() {
        // Look for SKILL.md inside directory
        let skill_md = src.join("SKILL.md");
        if skill_md.exists() {
            std::fs::read_to_string(&skill_md).map_err(|e| e.to_string())?
        } else {
            return Err(format!("no SKILL.md found in {src_path}"));
        }
    } else {
        return Err(format!("unsupported path type: {src_path}"));
    };
    validate_skill_content(&content)?;

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

    db::cache_skill(&db, &slug, &content, "local", Some(&src_path));
    let mut paths = Vec::new();
    for tool_id in &tool_ids {
        let dir = skill_dir_for(tool_id)?;
        let path = write_skill_file(&dir, &slug, &content)?;
        db::log_event(&db, "skill_installed_path", tool_id, &slug, Some(&src_path));
        paths.push(path);
    }
    Ok(paths)
}

/// Strip ANSI escape sequences and noisy CLI UI characters from `skills` CLI output.
/// Keeps lines that contain meaningful text; drops ASCII art banners, spinner frames, and
/// lines that are purely box-drawing / block chars.
fn clean_skills_output(raw: &str) -> String {
    // Remove ANSI CSI sequences: ESC [ ... m  (colours, bold, etc.)
    let mut out = String::with_capacity(raw.len());
    let bytes = raw.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == 0x1b && i + 1 < bytes.len() && bytes[i + 1] == b'[' {
            // skip until we hit a letter that ends the sequence
            i += 2;
            while i < bytes.len() && !bytes[i].is_ascii_alphabetic() {
                i += 1;
            }
            i += 1; // skip the final letter
        } else {
            out.push(bytes[i] as char);
            i += 1;
        }
    }

    // Keep only lines that have at least one ASCII letter or digit,
    // and don't look like a spinner frame (lines whose non-space content
    // is entirely box/block/spinner Unicode).
    out.lines()
        .filter(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() { return false; }
            // Must contain at least one ASCII alphanumeric character
            trimmed.chars().any(|c| c.is_ascii_alphanumeric())
        })
        .map(|line| line.trim_end())
        .collect::<Vec<_>>()
        .join("\n")
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
            let cleaned = clean_skills_output(&format!("{stderr}{stdout}"));
            return Err(format!("skills add failed:\n{cleaned}"));
        }

        db::log_event(&db, "skill_github_installed", tool_id, source.trim(), None);
        if !combined_output.is_empty() { combined_output.push('\n'); }
        combined_output.push_str(&clean_skills_output(stdout.trim()));
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

/// Permanently delete a skill from a tool (both active and .disabled locations).
#[tauri::command]
fn remove_skill(
    db: tauri::State<'_, db::DbState>,
    tool_id: String,
    skill_name: String,
    skill_path: String,
) -> Result<(), String> {
    let path = std::path::Path::new(&skill_path);
    // Also check the .disabled location
    let disabled_path = path
        .parent()
        .map(|p| p.join(".disabled").join(&skill_name))
        .filter(|p| p.exists());

    let mut deleted = false;
    if path.exists() {
        if path.is_dir() {
            std::fs::remove_dir_all(path).map_err(|e| e.to_string())?;
        } else {
            std::fs::remove_file(path).map_err(|e| e.to_string())?;
        }
        deleted = true;
    }
    if let Some(dp) = disabled_path {
        if dp.is_dir() {
            let _ = std::fs::remove_dir_all(&dp);
        } else {
            let _ = std::fs::remove_file(&dp);
        }
        deleted = true;
    }
    if !deleted {
        return Err(format!("skill not found at {skill_path}"));
    }
    db::log_event(&db, "skill_removed", &tool_id, &skill_name, None);
    Ok(())
}

#[tauri::command]
fn set_skill_active(
    db: tauri::State<'_, db::DbState>,
    tool_id: String,
    skill_name: String,
    skill_path: String,
    source_id: Option<String>,
    active: bool,
) -> Result<(), String> {
    use crate::engine::manifest::SkillSourceSpec;
    use crate::engine::resolve::expand_home;

    let result = if let Some(sid) = &source_id {
        if let Some(manifest) = crate::engine::load_manifest(&tool_id) {
            let home = dirs::home_dir().ok_or("cannot find home dir")?;
            let matched = manifest.skill_sources.iter().enumerate().find(|(idx, s)| {
                s.id.as_deref().unwrap_or(&format!("source_{idx}")) == sid
            });
            if let Some((_, source)) = matched {
                if let SkillSourceSpec::TomlConfigDirectory {
                    config_file,
                    config_key_path,
                    path_field,
                    enabled_field,
                    ..
                } = &source.spec
                {
                    let config_path = expand_home(config_file, &home);
                    app_state::toggle_toml_config_skill(
                        &config_path.to_string_lossy(),
                        config_key_path,
                        path_field,
                        enabled_field,
                        &skill_path,
                        active,
                    )
                } else {
                    app_state::move_skill_folder(&skill_path, &skill_name, active)
                }
            } else {
                app_state::move_skill_folder(&skill_path, &skill_name, active)
            }
        } else {
            app_state::move_skill_folder(&skill_path, &skill_name, active)
        }
    } else {
        app_state::move_skill_folder(&skill_path, &skill_name, active)
    };

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
            McpSourceSpec::TomlKeyPair {
                file,
                active_key,
                disabled_key,
                inline_toggle_field,
            } => {
                let path = expand_home(file, &home);
                if let Some(field) = inline_toggle_field.as_deref() {
                    app_state::toggle_toml_mcp_enabled(
                        &path.to_string_lossy(),
                        active_key,
                        &mcp_name,
                        active,
                        field,
                    )
                } else {
                    let dk = disabled_key.as_deref().ok_or(
                        "source has no disabled_key; toggling not supported for this source",
                    )?;
                    app_state::move_mcp_in_toml_config(
                        &path.to_string_lossy(),
                        &mcp_name,
                        active,
                        active_key,
                        dk,
                    )
                }
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
    app: tauri::AppHandle,
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
        let result = match &source.spec {
            McpSourceSpec::JsonKeyPair { file, active_key, .. } => {
                let path = expand_home(file, &home);
                let entry = if let Some(u) = &url {
                    serde_json::json!({ "url": u })
                } else {
                    serde_json::json!({
                        "command": command.as_deref().unwrap_or(""),
                        "args": args.as_deref().unwrap_or(&[]),
                    })
                };
                Some(app_state::add_mcp_to_config(
                    &path.to_string_lossy(), active_key, &name, entry,
                ))
            }
            McpSourceSpec::TomlKeyPair { file, active_key, .. } => {
                let path = expand_home(file, &home);
                Some(app_state::add_mcp_to_toml_config(
                    &path.to_string_lossy(),
                    active_key,
                    &name,
                    command.as_deref(),
                    args.as_deref().unwrap_or(&[]),
                    url.as_deref(),
                ))
            }
            _ => None,
        };
        if let Some(result) = result {
            if result.is_ok() {
                db::log_event(&db, "mcp_added", &tool_id, &name, None);
                let args_slice = args.as_deref().unwrap_or(&[]);
                db::cache_mcp(&db, &name, command.as_deref(), args_slice, url.as_deref());
                // Enrich with validated source URL in background
                if let Some(pkg) = installer::npm_package_from_mcp(
                    command.as_deref().unwrap_or(""),
                    args_slice,
                ) {
                    enrich_mcp_source_url(app.clone(), name.clone(), pkg);
                }
            }
            return result;
        }
    }
    Err(format!("'{tool_id}' has no writable MCP source"))
}

#[tauri::command]
fn remove_mcp(
    app: tauri::AppHandle,
    db: tauri::State<'_, db::DbState>,
    tool_id: String,
    mcp_name: String,
    source_id: String,
    // Install data passed from frontend so we can cache without re-detecting
    command: Option<String>,
    args: Option<Vec<String>>,
    url: Option<String>,
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
            McpSourceSpec::JsonKeyPair { file, active_key, disabled_key, .. } => {
                let path = expand_home(file, &home);
                app_state::remove_mcp_from_config(
                    &path.to_string_lossy(),
                    active_key,
                    disabled_key.as_deref(),
                    &mcp_name,
                )
            }
            McpSourceSpec::TomlKeyPair { file, active_key, .. } => {
                let path = expand_home(file, &home);
                app_state::remove_mcp_from_toml_config(
                    &path.to_string_lossy(),
                    active_key,
                    &mcp_name,
                )
            }
            _ => Err(format!("source '{source_id}' does not support MCP removal")),
        };
        if result.is_ok() {
            db::log_event(&db, "mcp_removed", &tool_id, &mcp_name, None);
            let args_slice = args.as_deref().unwrap_or(&[]);
            db::cache_mcp(&db, &mcp_name, command.as_deref(), args_slice, url.as_deref());
            // Enrich with validated source URL if not already cached
            let needs_url = db::get_cached_mcp(&db, &mcp_name)
                .map(|c| c.source_url.is_none())
                .unwrap_or(false);
            if needs_url {
                if let Some(pkg) = installer::npm_package_from_mcp(
                    command.as_deref().unwrap_or(""),
                    args_slice,
                ) {
                    enrich_mcp_source_url(app.clone(), mcp_name.clone(), pkg);
                }
            }
        }
        return result;
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
    // Only allow reads from the contextbar backup directory.
    let data_dir = dirs::data_dir()
        .ok_or("cannot resolve data dir")?
        .join("contextbar")
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

    // Clear the doctor "pkg-missing" notification now that the package is installed.
    let dedup_key = format!("doctor:mcp:{}:{}:pkg-missing", tool_id, mcp_name);
    db::dismiss_by_dedup_key(&db, &dedup_key);

    let _ = app.emit("tools-changed", ());
    let _ = app.emit("notifications-changed", ());
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

            let quit = MenuItem::with_id(app, "quit", "Quit Context Bar", true, None::<&str>)?;
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
            reveal_in_finder,
            open_url,
            warm_skill_cache,
            get_skill_cache_status,
            add_skill_to_tool,
            warm_mcp_cache,
            get_all_cached_mcps,
            create_skill,
            install_skill_from_url,
            install_skill_from_path,
            install_skill_from_github,
            read_text_file,
            check_for_update,
            query_mcp_tools,
            remove_skill,
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
            check_accessibility,
            open_accessibility_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error running Context Bar");
}

// ---------------------------------------------------------------------------
// Window helpers
// ---------------------------------------------------------------------------

fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.move_window(Position::TrayCenter);
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
        let _ = window.show();
        let _ = window.move_window(Position::TrayCenter);
        let _ = window.set_focus();
        return;
    }
    let window = WebviewWindowBuilder::new(app, "main", url)
        .title("Context Bar")
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
    let _ = window.show();
    let _ = window.move_window(Position::TrayCenter);
    let _ = window.set_focus();
}

#[cfg(test)]
mod tests {
    use super::{github_blob_to_raw, parse_github_repo_url, validate_skill_content};

    #[test]
    fn valid_markdown_passes() {
        assert!(validate_skill_content("# My Skill\n\nDoes things.").is_ok());
        assert!(validate_skill_content("---\nname: my-skill\n---\n# Heading").is_ok());
    }

    #[test]
    fn html_page_rejected() {
        assert!(validate_skill_content("<!DOCTYPE html><html>...</html>").is_err());
        assert!(validate_skill_content("<html lang=\"en\">...</html>").is_err());
    }

    #[test]
    fn json_rejected() {
        assert!(validate_skill_content("{ \"key\": 1 }").is_err());
        assert!(validate_skill_content("[1, 2, 3]").is_err());
    }

    #[test]
    fn empty_content_rejected() {
        assert!(validate_skill_content("").is_err());
        assert!(validate_skill_content("   \n  ").is_err());
    }

    // parse_github_repo_url tests
    #[test]
    fn repo_url_parsed() {
        let r = parse_github_repo_url("https://github.com/obra/superpowers").unwrap();
        assert_eq!(r, ("obra".into(), "superpowers".into(), "HEAD".into()));
    }

    #[test]
    fn tree_url_uses_branch() {
        let r = parse_github_repo_url("https://github.com/obra/superpowers/tree/main").unwrap();
        assert_eq!(r, ("obra".into(), "superpowers".into(), "main".into()));
    }

    #[test]
    fn blob_url_returns_none_from_repo_parser() {
        assert!(parse_github_repo_url(
            "https://github.com/obra/superpowers/blob/main/SKILL.md"
        ).is_none());
    }

    #[test]
    fn raw_url_returns_none_from_repo_parser() {
        assert!(parse_github_repo_url(
            "https://raw.githubusercontent.com/obra/superpowers/main/SKILL.md"
        ).is_none());
    }

    // github_blob_to_raw tests
    #[test]
    fn blob_url_converts_to_raw() {
        assert_eq!(
            github_blob_to_raw("https://github.com/obra/superpowers/blob/main/MY-SKILL.md"),
            Some("https://raw.githubusercontent.com/obra/superpowers/main/MY-SKILL.md".into())
        );
    }

    #[test]
    fn raw_url_passthrough() {
        let raw = "https://raw.githubusercontent.com/obra/superpowers/main/SKILL.md";
        assert_eq!(github_blob_to_raw(raw), Some(raw.into()));
    }

    #[test]
    fn non_github_url_returns_none() {
        assert!(github_blob_to_raw("https://example.com/my-skill.md").is_none());
    }

    #[test]
    fn repo_url_returns_none_from_blob_parser() {
        assert!(github_blob_to_raw("https://github.com/obra/superpowers").is_none());
    }
}
