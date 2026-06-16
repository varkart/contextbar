pub(crate) mod detectors;
pub(crate) mod engine;
pub(crate) mod models;
mod app_state;
pub(crate) mod backup;
pub(crate) mod permissions;
mod mcp_client;
mod watcher;

use crate::models::AiTool;
use tauri::{
    Emitter, Manager,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    WebviewUrl, WebviewWindowBuilder,
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
    std::fs::write(&path, serde_json::to_string_pretty(&val).unwrap())
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// IPC commands – tools / window
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_tools(app: tauri::AppHandle) -> Vec<AiTool> {
    let tools = detectors::detect_all();
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
    app.global_shortcut().unregister_all().map_err(|e| e.to_string())?;

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
async fn query_mcp_tools(command: String, args: Vec<String>) -> Result<Vec<mcp_client::McpTool>, String> {
    mcp_client::query_tools(&command, &args).await
}

// ---------------------------------------------------------------------------
// IPC commands – skill / MCP toggles
// ---------------------------------------------------------------------------

#[tauri::command]
fn set_skill_active(
    _tool_id: String,
    skill_name: String,
    skill_path: String,
    active: bool,
) -> Result<(), String> {
    app_state::move_skill_folder(&skill_path, &skill_name, active)
}

#[tauri::command]
fn set_mcp_active(
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
        let eff_id = source.id.clone().unwrap_or_else(|| format!("source_{}", idx));
        if eff_id != source_id { continue; }

        return match &source.spec {
            McpSourceSpec::JsonKeyPair { file, active_key, disabled_key, .. } => {
                let dk = disabled_key.as_deref()
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
            McpSourceSpec::ExtensionDir { enablement_file: Some(ef), .. } => {
                let ext_name = extension_name.as_deref()
                    .ok_or("extension_name required for extension-dir MCP toggle")?;
                let ef_path = expand_home(ef, &home);
                app_state::toggle_extension_active(
                    &ef_path.to_string_lossy(),
                    ext_name,
                    active,
                )
            }
            _ => Err(format!("source '{source_id}' does not support toggling")),
        };
    }

    Err(format!("source '{source_id}' not found in '{tool_id}' manifest"))
}

// ---------------------------------------------------------------------------
// IPC commands – permissions (v0.11)
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_permissions(tool_id: String) -> Result<permissions::ToolPermissions, String> {
    let home = dirs::home_dir().ok_or("cannot find home dir")?;
    let manifest = crate::engine::load_manifest(&tool_id)
        .ok_or_else(|| format!("no manifest for '{tool_id}'"))?;
    let spec = manifest.permissions
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
    let spec = manifest.permissions
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
    let spec = manifest.permissions
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
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
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

            // In test mode, auto-open the window so WebDriver can connect
            if std::env::var("AICONTEXTBAR_TEST").is_ok() {
                open_main_window(app.handle(), None);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_tools,
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
            read_text_file,
            check_for_update,
            query_mcp_tools,
            set_skill_active,
            set_mcp_active,
            list_config_backups,
            restore_config_backup,
            read_backup_content,
            get_permissions,
            add_permission_rule,
            remove_permission_rule,
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
        let _ = window.eval(&format!("window.location.hash = {hash_json}"));
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
        use window_vibrancy::{NSVisualEffectMaterial, apply_vibrancy};
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
