use std::collections::HashSet;
use tauri::{AppHandle, Emitter};
use crate::db::{self, DbState};
use crate::models::AiTool;

const KEY_PREFIX: &str = "doctor:mcp:";

pub fn run(tools: &[AiTool], db: &DbState, app: &AppHandle) {
    if check(tools, db) {
        let _ = app.emit("notifications-changed", ());
    }
}

/// Core health-check logic. Returns true if any notification was inserted or dismissed.
pub(crate) fn check(tools: &[AiTool], db: &DbState) -> bool {
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

    any_change
}

pub(crate) fn command_on_path(command: &str) -> bool {
    if command.contains('/') {
        std::path::Path::new(command).exists()
    } else {
        std::env::var("PATH")
            .unwrap_or_default()
            .split(':')
            .any(|dir| std::path::Path::new(dir).join(command).exists())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::{Arc, Mutex};
    use crate::models::{AiTool, McpServer};

    fn test_db() -> DbState {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrate_for_test(&mut conn);
        DbState(Arc::new(Mutex::new(conn)))
    }

    fn make_tool(id: &str, mcps: Vec<McpServer>) -> AiTool {
        AiTool {
            id: id.to_string(),
            name: id.to_string(),
            version: None,
            installed: true,
            install_path: None,
            skills: vec![],
            mcps,
            error: None,
        }
    }

    fn make_mcp(name: &str, command: &str, active: bool) -> McpServer {
        McpServer {
            name: name.to_string(),
            command: command.to_string(),
            args: vec![],
            url: None,
            description: None,
            active,
            has_secrets: false,
            secret_key_names: vec![],
            extension_name: None,
            source_id: "test".to_string(),
        }
    }

    // ── command_on_path ────────────────────────────────────────────────────────

    #[test]
    fn known_binary_on_path() {
        assert!(command_on_path("ls"), "ls should be on PATH");
    }

    #[test]
    fn unknown_binary_not_on_path() {
        assert!(!command_on_path("__llmmanager_definitely_not_real_binary__"));
    }

    #[test]
    fn absolute_path_exists() {
        assert!(
            command_on_path("/bin/ls") || command_on_path("/usr/bin/ls"),
            "at least one known ls path should exist"
        );
    }

    #[test]
    fn absolute_path_missing() {
        assert!(!command_on_path("/nonexistent/path/to/binary"));
    }

    // ── check() ───────────────────────────────────────────────────────────────

    #[test]
    fn no_tools_no_notifications() {
        let db = test_db();
        assert!(!check(&[], &db));
        assert!(db::get_active_notifications(&db).unwrap().is_empty());
    }

    #[test]
    fn not_installed_tool_skipped() {
        let db = test_db();
        let mut tool = make_tool("t", vec![make_mcp("bad", "__not_real__", true)]);
        tool.installed = false;
        assert!(!check(&[tool], &db));
        assert!(db::get_active_notifications(&db).unwrap().is_empty());
    }

    #[test]
    fn inactive_mcp_skipped() {
        let db = test_db();
        let tool = make_tool("t", vec![make_mcp("bad", "__not_real__", false)]);
        assert!(!check(&[tool], &db));
        assert!(db::get_active_notifications(&db).unwrap().is_empty());
    }

    #[test]
    fn http_mcp_empty_command_skipped() {
        let db = test_db();
        let tool = make_tool("t", vec![make_mcp("http-mcp", "", true)]);
        assert!(!check(&[tool], &db));
        assert!(db::get_active_notifications(&db).unwrap().is_empty());
    }

    #[test]
    fn missing_command_adds_warn_notification() {
        let db = test_db();
        let tool = make_tool("claude", vec![make_mcp("my-mcp", "__not_real__", true)]);
        assert!(check(&[tool], &db));
        let notifs = db::get_active_notifications(&db).unwrap();
        assert_eq!(notifs.len(), 1);
        assert_eq!(notifs[0].level, "warn");
        assert!(notifs[0].title.contains("__not_real__"));
        assert!(notifs[0].body.contains("my-mcp"));
    }

    #[test]
    fn existing_command_no_notification() {
        let db = test_db();
        let tool = make_tool("t", vec![make_mcp("ls-mcp", "ls", true)]);
        assert!(!check(&[tool], &db));
        assert!(db::get_active_notifications(&db).unwrap().is_empty());
    }

    #[test]
    fn second_check_same_issue_no_duplicate() {
        let db = test_db();
        let tool = || make_tool("t", vec![make_mcp("bad", "__not_real__", true)]);
        check(&[tool()], &db);
        assert!(!check(&[tool()], &db), "second run with same issue: no change");
        assert_eq!(db::get_active_notifications(&db).unwrap().len(), 1);
    }

    #[test]
    fn resolves_stale_notification_when_issue_fixed() {
        let db = test_db();
        // First run: binary missing
        check(&[make_tool("t", vec![make_mcp("mcp1", "__not_real__", true)])], &db);
        assert_eq!(db::get_active_notifications(&db).unwrap().len(), 1);

        // Second run: binary now found
        let changed = check(&[make_tool("t", vec![make_mcp("mcp1", "ls", true)])], &db);
        assert!(changed, "should detect change when stale warning dismissed");
        assert!(db::get_active_notifications(&db).unwrap().is_empty());
    }

    #[test]
    fn only_bad_mcps_get_notifications() {
        let db = test_db();
        let tool = make_tool("t", vec![
            make_mcp("good", "ls",            true),
            make_mcp("bad",  "__not_real__",  true),
        ]);
        check(&[tool], &db);
        let notifs = db::get_active_notifications(&db).unwrap();
        assert_eq!(notifs.len(), 1);
        assert!(notifs[0].body.contains("bad"));
    }
}
