use crate::db::{self, DbState};
use crate::installer;
use crate::models::AiTool;
use serde::Serialize;
use std::collections::HashSet;
use tauri::{AppHandle, Emitter};

const KEY_PREFIX: &str = "doctor:mcp:";

// ── Shell PATH resolution ──────────────────────────────────────────────────────

/// Resolve the user's full shell PATH by spawning a login shell.
/// macOS GUI apps inherit a minimal PATH; this gives us the real one.
pub fn get_shell_path() -> String {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let output = std::process::Command::new(&shell)
        .args(["-l", "-c", "echo $PATH"])
        .output();
    match output {
        Ok(o) if o.status.success() => {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if s.is_empty() {
                std::env::var("PATH").unwrap_or_default()
            } else {
                s
            }
        }
        _ => std::env::var("PATH").unwrap_or_default(),
    }
}

pub(crate) fn command_on_path(command: &str) -> bool {
    command_on_custom_path(command, &get_shell_path())
}

pub(crate) fn command_on_custom_path(command: &str, path_val: &str) -> bool {
    if command.contains('/') {
        std::path::Path::new(command).exists()
    } else {
        path_val
            .split(':')
            .any(|dir| std::path::Path::new(dir).join(command).exists())
    }
}

// ── Structured report ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DoctorItem {
    pub id: String,
    pub label: String,
    pub status: DoctorStatus,
    pub detail: Option<String>,
    pub fix_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DoctorSection {
    pub title: String,
    pub items: Vec<DoctorItem>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DoctorStatus {
    Ok,
    Warn,
    Error,
}

pub fn report(tools: &[AiTool]) -> Vec<DoctorSection> {
    let shell_path = get_shell_path();
    let app_path = std::env::var("PATH").unwrap_or_default();

    let mut sections = vec![];

    // ── Section 1: PATH ───────────────────────────────────────────────────────
    let path_status = if shell_path != app_path && !shell_path.is_empty() {
        DoctorStatus::Ok
    } else if shell_path.is_empty() {
        DoctorStatus::Warn
    } else {
        DoctorStatus::Ok
    };
    let shell_dirs: usize = shell_path.split(':').filter(|s| !s.is_empty()).count();
    let app_dirs: usize = app_path.split(':').filter(|s| !s.is_empty()).count();
    sections.push(DoctorSection {
        title: "Environment".into(),
        items: vec![DoctorItem {
            id: "path".into(),
            label: "Shell PATH".into(),
            status: path_status,
            detail: Some(format!(
                "Shell: {} dirs — App: {} dirs",
                shell_dirs, app_dirs
            )),
            fix_hint: if shell_dirs <= app_dirs {
                Some("Shell PATH looks minimal. Make sure your shell config exports PATH correctly.".into())
            } else {
                None
            },
        }],
    });

    // ── Section 2: Runtime binaries ───────────────────────────────────────────
    let runtimes = [
        ("node", "Node.js", "Install via https://nodejs.org or `brew install node`"),
        ("npx", "npx", "Comes with Node.js — install Node.js first"),
        ("python3", "Python 3", "Install via https://python.org or `brew install python`"),
        ("uv", "uv (Python runner)", "Install via `brew install uv` or `curl -Ls https://astral.sh/uv/install.sh | sh`"),
        ("docker", "Docker", "Install Docker Desktop from https://docker.com"),
        ("bun", "Bun", "Install via `brew install bun` or `curl -fsSL https://bun.sh/install | bash`"),
        ("deno", "Deno", "Install via `brew install deno` or `curl -fsSL https://deno.land/install.sh | sh`"),
    ];

    let runtime_items: Vec<DoctorItem> = runtimes
        .iter()
        .map(|(bin, label, hint)| {
            let found = command_on_custom_path(bin, &shell_path);
            DoctorItem {
                id: format!("runtime:{}", bin),
                label: label.to_string(),
                status: if found { DoctorStatus::Ok } else { DoctorStatus::Warn },
                detail: if found {
                    // find the actual path
                    shell_path
                        .split(':')
                        .map(|dir| std::path::Path::new(dir).join(bin))
                        .find(|p| p.exists())
                        .map(|p| p.to_string_lossy().into_owned())
                } else {
                    Some("Not found on shell PATH".into())
                },
                fix_hint: if found { None } else { Some(hint.to_string()) },
            }
        })
        .collect();

    sections.push(DoctorSection {
        title: "Runtimes".into(),
        items: runtime_items,
    });

    // ── Section 3: MCP commands ───────────────────────────────────────────────
    let mut mcp_items: Vec<DoctorItem> = vec![];

    for tool in tools {
        if !tool.installed {
            continue;
        }
        for mcp in &tool.mcps {
            if !mcp.active || mcp.command.is_empty() {
                continue;
            }
            let found = command_on_custom_path(&mcp.command, &shell_path);
            let auto_dl = mcp.args.iter().any(|a| a == "-y" || a == "--yes");

            // Binary check
            mcp_items.push(DoctorItem {
                id: format!("mcp:{}:{}:cmd", tool.id, mcp.name),
                label: format!("{} › {} ({})", tool.name, mcp.name, mcp.command),
                status: if found { DoctorStatus::Ok } else { DoctorStatus::Error },
                detail: if found {
                    None
                } else {
                    Some(format!("'{}' not found on PATH", mcp.command))
                },
                fix_hint: if found {
                    None
                } else {
                    Some(format!(
                        "Install '{}' or add it to your shell PATH",
                        mcp.command
                    ))
                },
            });

            // npm package check (only for npx without -y/--yes)
            if mcp.command == "npx" && !auto_dl {
                if let Some(pkg) = installer::npm_package_from_mcp(&mcp.command, &mcp.args) {
                    let installed = installer::get_npm_installed_version(&pkg).is_some();
                    mcp_items.push(DoctorItem {
                        id: format!("mcp:{}:{}:pkg", tool.id, mcp.name),
                        label: format!("{} › {} (npm: {})", tool.name, mcp.name, pkg),
                        status: if installed {
                            DoctorStatus::Ok
                        } else {
                            DoctorStatus::Error
                        },
                        detail: if installed {
                            installer::get_npm_installed_version(&pkg)
                                .map(|v| format!("v{} installed", v))
                        } else {
                            Some(format!("'{}' not installed globally", pkg))
                        },
                        fix_hint: if installed {
                            None
                        } else {
                            Some(format!(
                                "Open the '{}' MCP in Context Bar to install, or run: npm install -g {}",
                                mcp.name, pkg
                            ))
                        },
                    });
                }
            }
        }
    }

    if mcp_items.is_empty() {
        mcp_items.push(DoctorItem {
            id: "mcp:none".into(),
            label: "No active MCPs configured".into(),
            status: DoctorStatus::Ok,
            detail: None,
            fix_hint: None,
        });
    }

    sections.push(DoctorSection {
        title: "Active MCPs".into(),
        items: mcp_items,
    });

    sections
}

// ── Notification-based background check (existing behaviour) ──────────────────

pub fn run(tools: &[AiTool], db: &DbState, app: &AppHandle) {
    if check(tools, db) {
        let _ = app.emit("notifications-changed", ());
    }
}

pub(crate) fn check(tools: &[AiTool], db: &DbState) -> bool {
    let shell_path = get_shell_path();
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

            if !command_on_custom_path(&mcp.command, &shell_path) {
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

            let auto_download = mcp.args.iter().any(|a| a == "-y" || a == "--yes");
            if !auto_download {
                if let Some(pkg) = installer::npm_package_from_mcp(&mcp.command, &mcp.args) {
                    if installer::get_npm_installed_version(&pkg).is_none() {
                        let key = format!("{KEY_PREFIX}{}:{}:pkg-missing", tool.id, mcp.name);
                        current_keys.insert(key.clone());
                        let title = format!("'{}' not installed", pkg);
                        let body = format!(
                            "MCP '{}' ({}) needs npm package '{}'. Open it to install.",
                            mcp.name, tool.name, pkg,
                        );
                        if let Ok(inserted) =
                            db::add_notification(db, "warn", &title, &body, Some(&key))
                        {
                            if inserted {
                                any_change = true;
                            }
                        }
                    }
                }
            }
        }
    }

    for key in &existing_keys {
        if !current_keys.contains(key.as_str()) {
            db::dismiss_by_dedup_key(db, key);
            any_change = true;
        }
    }

    any_change
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AiTool, McpServer};
    use rusqlite::Connection;
    use std::sync::{Arc, Mutex};

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
            supports_skills: false,
            supports_mcps: true,
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

    fn make_npx_mcp(name: &str, args: &[&str], active: bool) -> McpServer {
        McpServer {
            name: name.to_string(),
            command: "npx".to_string(),
            args: args.iter().map(|s| s.to_string()).collect(),
            url: None,
            description: None,
            active,
            has_secrets: false,
            secret_key_names: vec![],
            extension_name: None,
            source_id: "test".to_string(),
        }
    }

    // ── command_on_custom_path ─────────────────────────────────────────────────

    #[test]
    fn known_binary_on_path() {
        let path = std::env::var("PATH").unwrap_or_default();
        assert!(command_on_custom_path("ls", &path), "ls should be on PATH");
    }

    #[test]
    fn unknown_binary_not_on_path() {
        let path = std::env::var("PATH").unwrap_or_default();
        assert!(!command_on_custom_path(
            "__llmmanager_definitely_not_real_binary__",
            &path
        ));
    }

    #[test]
    fn absolute_path_exists() {
        let path = "";
        assert!(
            command_on_custom_path("/bin/ls", path)
                || command_on_custom_path("/usr/bin/ls", path),
            "at least one known ls path should exist"
        );
    }

    #[test]
    fn absolute_path_missing() {
        assert!(!command_on_custom_path("/nonexistent/path/to/binary", ""));
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
        assert!(
            !check(&[tool()], &db),
            "second run with same issue: no change"
        );
        assert_eq!(db::get_active_notifications(&db).unwrap().len(), 1);
    }

    #[test]
    fn resolves_stale_notification_when_issue_fixed() {
        let db = test_db();
        check(
            &[make_tool("t", vec![make_mcp("mcp1", "__not_real__", true)])],
            &db,
        );
        assert_eq!(db::get_active_notifications(&db).unwrap().len(), 1);

        let changed = check(&[make_tool("t", vec![make_mcp("mcp1", "ls", true)])], &db);
        assert!(changed, "should detect change when stale warning dismissed");
        assert!(db::get_active_notifications(&db).unwrap().is_empty());
    }

    #[test]
    fn only_bad_mcps_get_notifications() {
        let db = test_db();
        let tool = make_tool(
            "t",
            vec![
                make_mcp("good", "ls", true),
                make_mcp("bad", "__not_real__", true),
            ],
        );
        check(&[tool], &db);
        let notifs = db::get_active_notifications(&db).unwrap();
        assert_eq!(notifs.len(), 1);
        assert!(notifs[0].body.contains("bad"));
    }

    // ── npm pkg-missing detection ─────────────────────────────────────────────

    #[test]
    fn npx_mcp_with_dash_y_skips_pkg_check() {
        let db = test_db();
        let tool = make_tool(
            "t",
            vec![make_npx_mcp("my-mcp", &["-y", "__fake_npm_pkg__"], true)],
        );
        check(&[tool], &db);
        let notifs = db::get_active_notifications(&db).unwrap();
        assert!(
            notifs.iter().all(|n| !n.title.contains("__fake_npm_pkg__")),
            "no pkg-missing notification expected for -y MCP"
        );
    }

    #[test]
    fn npx_mcp_with_yes_flag_skips_pkg_check() {
        let db = test_db();
        let tool = make_tool(
            "t",
            vec![make_npx_mcp("my-mcp", &["--yes", "__fake_npm_pkg__"], true)],
        );
        check(&[tool], &db);
        let notifs = db::get_active_notifications(&db).unwrap();
        assert!(
            notifs.iter().all(|n| !n.title.contains("__fake_npm_pkg__")),
            "no pkg-missing notification expected for --yes MCP"
        );
    }

    #[test]
    fn npx_mcp_missing_pkg_fires_pkg_missing_notification() {
        let db = test_db();
        let pkg = "__llmmanager_definitely_not_a_real_npm_pkg__";
        let tool = make_tool("claude", vec![make_npx_mcp("my-mcp", &[pkg], true)]);
        check(&[tool], &db);
        let notifs = db::get_active_notifications(&db).unwrap();
        assert!(
            notifs.iter().any(|n| n.title.contains(pkg)),
            "expected pkg-missing notification for uninstalled npx package"
        );
    }

    #[test]
    fn npx_mcp_pkg_missing_dedup_key_format() {
        let db = test_db();
        let pkg = "__llmmanager_definitely_not_a_real_npm_pkg__";
        let tool = make_tool("claude", vec![make_npx_mcp("my-mcp", &[pkg], true)]);
        check(std::slice::from_ref(&tool), &db);
        let changed = check(std::slice::from_ref(&tool), &db);
        assert!(!changed, "second run with same issue: no change");
        assert_eq!(
            db::get_active_notifications(&db)
                .unwrap()
                .iter()
                .filter(|n| n.title.contains(pkg))
                .count(),
            1
        );
    }

    // ── report() ──────────────────────────────────────────────────────────────

    #[test]
    fn report_returns_three_sections() {
        let sections = report(&[]);
        assert_eq!(sections.len(), 3);
        assert_eq!(sections[0].title, "Environment");
        assert_eq!(sections[1].title, "Runtimes");
        assert_eq!(sections[2].title, "Active MCPs");
    }

    #[test]
    fn report_no_mcps_placeholder() {
        let sections = report(&[]);
        let mcp_section = sections.iter().find(|s| s.title == "Active MCPs").unwrap();
        assert_eq!(mcp_section.items.len(), 1);
        assert_eq!(mcp_section.items[0].status, DoctorStatus::Ok);
    }

    #[test]
    fn report_bad_mcp_command_is_error() {
        let tool = make_tool(
            "claude",
            vec![make_mcp("bad-mcp", "__not_real_cmd__", true)],
        );
        let sections = report(&[tool]);
        let mcp_section = sections.iter().find(|s| s.title == "Active MCPs").unwrap();
        let item = mcp_section
            .items
            .iter()
            .find(|i| i.id.contains("bad-mcp") && i.id.ends_with(":cmd"))
            .unwrap();
        assert_eq!(item.status, DoctorStatus::Error);
        assert!(item.fix_hint.is_some());
    }

    #[test]
    fn report_good_mcp_command_is_ok() {
        let tool = make_tool("claude", vec![make_mcp("ls-mcp", "ls", true)]);
        let sections = report(&[tool]);
        let mcp_section = sections.iter().find(|s| s.title == "Active MCPs").unwrap();
        let item = mcp_section
            .items
            .iter()
            .find(|i| i.id.contains("ls-mcp"))
            .unwrap();
        assert_eq!(item.status, DoctorStatus::Ok);
    }
}
