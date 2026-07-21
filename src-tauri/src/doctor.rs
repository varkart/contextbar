use crate::db::{self, DbState};
use crate::installer;
use crate::models::Agent;
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

/// Codex forbids combining the legacy sandbox settings with the newer
/// permission profiles ("Configure either default_permissions and
/// [permissions], or sandbox_mode / sandbox_workspace_write, but not both").
/// Returns an item only when Codex's config exists.
fn codex_sandbox_conflict_item() -> Option<DoctorItem> {
    let cfg = dirs::home_dir()?.join(".codex/config.toml");
    if !cfg.exists() {
        return None;
    }
    let doc = crate::app_state::read_toml_config(&cfg.to_string_lossy())?;
    let legacy = doc.get("sandbox_mode").is_some() || doc.get("sandbox_workspace_write").is_some();
    let profiles = doc.get("default_permissions").is_some() || doc.get("permissions").is_some();
    Some(match (legacy, profiles) {
        (true, true) => DoctorItem {
            id: "codex_sandbox_conflict".into(),
            label: "Codex sandbox configuration".into(),
            status: DoctorStatus::Error,
            detail: Some(
                "config.toml sets BOTH legacy sandbox keys (sandbox_mode / sandbox_workspace_write) and permission profiles (default_permissions / [permissions]) — Codex forbids combining them".into(),
            ),
            fix_hint: Some(
                "Remove sandbox_mode and sandbox_workspace_write, or remove default_permissions and the [permissions.*] tables — keep only one system.".into(),
            ),
        },
        (false, true) => DoctorItem {
            id: "codex_sandbox_conflict".into(),
            label: "Codex sandbox configuration".into(),
            status: DoctorStatus::Ok,
            detail: Some("Using permission profiles (current system)".into()),
            fix_hint: None,
        },
        (true, false) => DoctorItem {
            id: "codex_sandbox_conflict".into(),
            label: "Codex sandbox configuration".into(),
            status: DoctorStatus::Ok,
            detail: Some(
                "Using legacy sandbox_mode — consider migrating to permission profiles".into(),
            ),
            fix_hint: None,
        },
        (false, false) => DoctorItem {
            id: "codex_sandbox_conflict".into(),
            label: "Codex sandbox configuration".into(),
            status: DoctorStatus::Ok,
            detail: Some("No sandbox settings configured — Codex defaults apply".into()),
            fix_hint: None,
        },
    })
}

pub fn report(agents: &[Agent]) -> Vec<DoctorSection> {
    let shell_path = get_shell_path();
    let app_path = std::env::var("PATH").unwrap_or_default();

    let mut sections = vec![];

    // Collect commands used by active MCPs — used to decide which runtimes matter.
    let active_commands: std::collections::HashSet<String> = agents
        .iter()
        .filter(|t| t.installed)
        .flat_map(|t| t.mcps.iter())
        .filter(|m| m.active && !m.command.is_empty())
        .map(|m| m.command.clone())
        .collect();

    // ── Section 0: agent config conflicts ─────────────────────────────────────
    if let Some(item) = codex_sandbox_conflict_item() {
        sections.push(DoctorSection {
            title: "Agent configs".into(),
            items: vec![item],
        });
    }

    // ── Section 1: PATH ───────────────────────────────────────────────────────
    let shell_ok = !shell_path.is_empty();
    let shell_dirs: usize = shell_path.split(':').filter(|s| !s.is_empty()).count();
    let app_dirs: usize = app_path.split(':').filter(|s| !s.is_empty()).count();
    sections.push(DoctorSection {
        title: "Environment".into(),
        items: vec![DoctorItem {
            id: "path".into(),
            label: "Shell PATH".into(),
            status: if shell_ok {
                DoctorStatus::Ok
            } else {
                DoctorStatus::Warn
            },
            detail: Some(format!(
                "Shell: {} dirs — App: {} dirs",
                shell_dirs, app_dirs
            )),
            fix_hint: if shell_dirs <= app_dirs {
                Some(
                    "Shell PATH looks minimal. Make sure your shell config exports PATH correctly."
                        .into(),
                )
            } else {
                None
            },
        }],
    });

    // ── Section 2: Runtime binaries ───────────────────────────────────────────
    let runtimes = [
        (
            "node",
            "Node.js",
            "Install via https://nodejs.org or `brew install node`",
        ),
        ("npx", "npx", "Comes with Node.js — install Node.js first"),
        (
            "python3",
            "Python 3",
            "Install via https://python.org or `brew install python`",
        ),
        (
            "uv",
            "uv (Python runner)",
            "Install via `brew install uv` or `curl -Ls https://astral.sh/uv/install.sh | sh`",
        ),
        (
            "docker",
            "Docker",
            "Install Docker Desktop from https://docker.com",
        ),
        (
            "bun",
            "Bun",
            "Install via `brew install bun` or `curl -fsSL https://bun.sh/install | bash`",
        ),
        (
            "deno",
            "Deno",
            "Install via `brew install deno` or `curl -fsSL https://deno.land/install.sh | sh`",
        ),
    ];

    let runtime_items: Vec<DoctorItem> = runtimes
        .iter()
        .map(|(bin, label, hint)| {
            let found = command_on_custom_path(bin, &shell_path);
            DoctorItem {
                id: format!("runtime:{}", bin),
                label: label.to_string(),
                status: if found {
                    DoctorStatus::Ok
                } else {
                    // Only warn for optional runtimes if not actually used by any active MCP.
                    // npx, node, python3, bun, deno are highly likely to be used, but uv/docker are more niche.
                    let is_niche = bin == &"uv" || bin == &"docker";
                    let is_active = active_commands.contains(*bin);
                    if is_niche && !is_active {
                        DoctorStatus::Ok
                    } else {
                        DoctorStatus::Warn
                    }
                },
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

    for agent in agents {
        if !agent.installed {
            continue;
        }
        for mcp in &agent.mcps {
            if !mcp.active || mcp.command.is_empty() {
                continue;
            }
            let found = command_on_custom_path(&mcp.command, &shell_path);
            let auto_dl = mcp.args.iter().any(|a| a == "-y" || a == "--yes");
            let is_abs = mcp.command.contains('/');

            // Binary check
            mcp_items.push(DoctorItem {
                id: format!("mcp:{}:{}:cmd", agent.id, mcp.name),
                label: format!("{} › {} ({})", agent.name, mcp.name, mcp.command),
                status: if found {
                    DoctorStatus::Ok
                } else {
                    DoctorStatus::Error
                },
                detail: if found {
                    None
                } else if is_abs {
                    Some(format!("'{}' not found", mcp.command))
                } else {
                    Some(format!("'{}' not found on PATH", mcp.command))
                },
                fix_hint: if found {
                    None
                } else if is_abs {
                    Some(format!(
                        "Reinstall or update the application that provides '{}'",
                        mcp.command
                    ))
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
                        id: format!("mcp:{}:{}:pkg", agent.id, mcp.name),
                        label: format!("{} › {} (npm: {})", agent.name, mcp.name, pkg),
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

    // ── Section 4: Config file health ─────────────────────────────────────────
    let config_items: Vec<DoctorItem> = agents
        .iter()
        .filter(|a| a.installed)
        .flat_map(|a| {
            a.config_files.iter().map(move |path| {
                let p = std::path::Path::new(path);
                let exists = p.exists();
                let (status, detail, fix_hint) = if !exists {
                    (
                        DoctorStatus::Warn,
                        Some(format!("File not found: {path}")),
                        Some(
                            "The file will be created automatically when you first use this tool."
                                .to_string(),
                        ),
                    )
                } else {
                    let parse_err = validate_config_file(path);
                    match parse_err {
                        Some(err) => (
                            DoctorStatus::Error,
                            Some(format!("Parse error: {err}")),
                            Some(format!("Edit or restore a backup of {path} to fix.")),
                        ),
                        None => (DoctorStatus::Ok, None, None),
                    }
                };
                let short = p.file_name().and_then(|n| n.to_str()).unwrap_or(path);
                DoctorItem {
                    id: format!("config:{}:{}", a.id, short),
                    label: format!("{} › {}", a.name, short),
                    status,
                    detail,
                    fix_hint,
                }
            })
        })
        .collect();

    if !config_items.is_empty() {
        sections.push(DoctorSection {
            title: "Config Files".into(),
            items: config_items,
        });
    }

    sections
}

fn validate_config_file(path: &str) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    match ext {
        "json" => {
            if let Err(e) = serde_json::from_str::<serde_json::Value>(&content) {
                return Some(e.to_string());
            }
        }
        "toml" => {
            if let Err(e) = toml::from_str::<toml::Value>(&content) {
                return Some(e.to_string());
            }
        }
        "yaml" | "yml" => {
            if let Err(e) = serde_yaml::from_str::<serde_yaml::Value>(&content) {
                return Some(e.to_string());
            }
        }
        _ => {}
    }
    None
}

// ── Notification-based background check (existing behaviour) ──────────────────

pub fn run(agents: &[Agent], db: &DbState, app: &AppHandle) {
    if check(agents, db) {
        let _ = app.emit("agents-changed", ());
    }
}

pub(crate) fn check(agents: &[Agent], db: &DbState) -> bool {
    let shell_path = get_shell_path();
    let existing_keys = db::active_keys_with_prefix(db, KEY_PREFIX);
    let mut current_keys: HashSet<String> = HashSet::new();
    let mut any_change = false;

    for agent in agents {
        if !agent.installed {
            continue;
        }
        for mcp in &agent.mcps {
            if !mcp.active || mcp.command.is_empty() {
                continue;
            }

            // Check the launcher binary (npx, node, python3, etc.) is on PATH.
            if !command_on_custom_path(&mcp.command, &shell_path) {
                let key = format!("{KEY_PREFIX}{}:{}:missing", agent.id, mcp.name);
                current_keys.insert(key.clone());
                let title = format!("'{}' not found", mcp.command);
                let body = format!(
                    "MCP '{}' ({}) requires '{}' but it isn't on PATH.",
                    mcp.name, agent.name, mcp.command,
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
                        let key = format!("{KEY_PREFIX}{}:{}:pkg-missing", agent.id, mcp.name);
                        current_keys.insert(key.clone());
                        let title = format!("'{}' not installed", pkg);
                        let body = format!(
                            "MCP '{}' ({}) needs npm package '{}'. Open it to install.",
                            mcp.name, agent.name, pkg,
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
    use crate::models::{Agent, McpServer};
    use rusqlite::Connection;
    use std::sync::{Arc, Mutex};

    fn test_db() -> DbState {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrate_for_test(&mut conn);
        DbState(Arc::new(Mutex::new(conn)))
    }

    fn make_agent(id: &str, mcps: Vec<McpServer>) -> Agent {
        Agent {
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
            config_files: vec![],
            config_errors: vec![],
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
            disabled_tools: vec![],
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
            disabled_tools: vec![],
        }
    }

    // ── command_on_custom_path ────────────────────────────────────────────────────────

    #[test]
    fn known_binary_on_custom_path() {
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
            command_on_custom_path("/bin/ls", path) || command_on_custom_path("/usr/bin/ls", path),
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
        let mut tool = make_agent("t", vec![make_mcp("bad", "__not_real__", true)]);
        tool.installed = false;
        assert!(!check(&[tool], &db));
        assert!(db::get_active_notifications(&db).unwrap().is_empty());
    }

    #[test]
    fn inactive_mcp_skipped() {
        let db = test_db();
        let tool = make_agent("t", vec![make_mcp("bad", "__not_real__", false)]);
        assert!(!check(&[tool], &db));
        assert!(db::get_active_notifications(&db).unwrap().is_empty());
    }

    #[test]
    fn http_mcp_empty_command_skipped() {
        let db = test_db();
        let tool = make_agent("t", vec![make_mcp("http-mcp", "", true)]);
        assert!(!check(&[tool], &db));
        assert!(db::get_active_notifications(&db).unwrap().is_empty());
    }

    #[test]
    fn missing_command_adds_warn_notification() {
        let db = test_db();
        let tool = make_agent("claude", vec![make_mcp("my-mcp", "__not_real__", true)]);
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
        let tool = make_agent("t", vec![make_mcp("ls-mcp", "ls", true)]);
        assert!(!check(&[tool], &db));
        assert!(db::get_active_notifications(&db).unwrap().is_empty());
    }

    #[test]
    fn second_check_same_issue_no_duplicate() {
        let db = test_db();
        let tool = || make_agent("t", vec![make_mcp("bad", "__not_real__", true)]);
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
            &[make_agent(
                "t",
                vec![make_mcp("mcp1", "__not_real__", true)],
            )],
            &db,
        );
        assert_eq!(db::get_active_notifications(&db).unwrap().len(), 1);

        let changed = check(&[make_agent("t", vec![make_mcp("mcp1", "ls", true)])], &db);
        assert!(changed, "should detect change when stale warning dismissed");
        assert!(db::get_active_notifications(&db).unwrap().is_empty());
    }

    #[test]
    fn only_bad_mcps_get_notifications() {
        let db = test_db();
        let tool = make_agent(
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
        let tool = make_agent(
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
        let tool = make_agent(
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
        let tool = make_agent("claude", vec![make_npx_mcp("my-mcp", &[pkg], true)]);
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
        let tool = make_agent("claude", vec![make_npx_mcp("my-mcp", &[pkg], true)]);
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
    fn report_returns_expected_sections() {
        // "Agent configs" appears only on machines with a Codex config.
        let sections = report(&[]);
        let titles: Vec<&str> = sections.iter().map(|s| s.title.as_str()).collect();
        let expected: Vec<&str> = titles
            .iter()
            .copied()
            .filter(|t| *t != "Agent configs")
            .collect();
        assert_eq!(expected, vec!["Environment", "Runtimes", "Active MCPs"]);
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
        let tool = make_agent(
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
        let tool = make_agent("claude", vec![make_mcp("ls-mcp", "ls", true)]);
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
