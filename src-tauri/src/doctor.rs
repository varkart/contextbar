use std::collections::HashSet;
use tauri::{AppHandle, Emitter};
use crate::db::{self, DbState};
use crate::models::AiTool;

const KEY_PREFIX: &str = "doctor:mcp:";

pub fn run(tools: &[AiTool], db: &DbState, app: &AppHandle) {
    let existing_keys = db::active_keys_with_prefix(db, KEY_PREFIX);
    let mut current_keys: HashSet<String> = HashSet::new();
    let mut any_change = false;

    for tool in tools {
        if !tool.installed {
            continue;
        }
        for mcp in &tool.mcps {
            if !mcp.active || mcp.command.is_empty() {
                continue;
            }
            if !command_on_path(&mcp.command) {
                let key = format!("{KEY_PREFIX}{}:{}:missing", tool.id, mcp.name);
                current_keys.insert(key.clone());
                let title = format!("'{}' not found", mcp.command);
                let body = format!(
                    "MCP '{}' ({}) requires '{}' but it isn't on PATH.",
                    mcp.name, tool.name, mcp.command,
                );
                if let Ok(inserted) = db::add_notification(db, "warn", &title, &body, Some(&key)) {
                    if inserted {
                        any_change = true;
                    }
                }
            }
        }
    }

    // Dismiss warnings for issues that are now resolved
    for key in &existing_keys {
        if !current_keys.contains(key.as_str()) {
            db::dismiss_by_dedup_key(db, key);
            any_change = true;
        }
    }

    if any_change {
        let _ = app.emit("notifications-changed", ());
    }
}

fn command_on_path(command: &str) -> bool {
    if command.contains('/') {
        std::path::Path::new(command).exists()
    } else {
        std::env::var("PATH")
            .unwrap_or_default()
            .split(':')
            .any(|dir| std::path::Path::new(dir).join(command).exists())
    }
}
