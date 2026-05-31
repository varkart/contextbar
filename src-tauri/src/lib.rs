pub(crate) mod detectors;
pub(crate) mod models;
mod watcher;

use crate::models::AiTool;
use tauri::{
    Manager,
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
        .join("agentbar")
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
fn get_tools() -> Vec<AiTool> {
    detectors::detect_all()
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
// App entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let quit = MenuItem::with_id(app, "quit", "Quit agentbar", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&settings, &quit])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
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
        ])
        .run(tauri::generate_context!())
        .expect("error running agentbar");
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
        let _ = window.eval(&format!(
            "window.location.hash = '{}'",
            hash.unwrap_or("")
        ));
        let _ = window.move_window(Position::TrayCenter);
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let window = WebviewWindowBuilder::new(app, "main", url)
        .title("agentbar")
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
