use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use std::collections::{HashMap, HashSet};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ToolsDiff {
    pub added_skills: Vec<DiffItem>,
    pub removed_skills: Vec<DiffItem>,
    pub added_mcps: Vec<DiffItem>,
    pub removed_mcps: Vec<DiffItem>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiffItem {
    pub tool_name: String,
    pub item_name: String,
}

// Snapshot: tool_id → set of skill paths or mcp names
type SkillSnapshot = HashMap<String, HashSet<String>>;
type McpSnapshot = HashMap<String, HashSet<String>>;

fn take_snapshot(_app: &AppHandle) -> (SkillSnapshot, McpSnapshot) {
    let tools = crate::detectors::detect_all();
    let mut skills: SkillSnapshot = HashMap::new();
    let mut mcps: McpSnapshot = HashMap::new();
    for tool in tools {
        if !tool.installed { continue; }
        skills.insert(
            tool.id.clone(),
            tool.skills.iter().map(|s| s.name.clone()).collect(),
        );
        mcps.insert(
            tool.id.clone(),
            tool.mcps.iter().map(|m| m.name.clone()).collect(),
        );
    }
    (skills, mcps)
}

fn diff_snapshots(
    old_skills: &SkillSnapshot,
    new_skills: &SkillSnapshot,
    old_mcps: &McpSnapshot,
    new_mcps: &McpSnapshot,
    // tool_id → display name
    tool_names: &HashMap<String, String>,
) -> ToolsDiff {
    let mut added_skills = vec![];
    let mut removed_skills = vec![];
    let mut added_mcps = vec![];
    let mut removed_mcps = vec![];

    let all_tool_ids: HashSet<&String> = old_skills.keys()
        .chain(new_skills.keys()).collect();

    for tool_id in all_tool_ids {
        let tool_name = tool_names.get(tool_id)
            .cloned()
            .unwrap_or_else(|| tool_id.clone());

        let old_s = old_skills.get(tool_id).cloned().unwrap_or_default();
        let new_s = new_skills.get(tool_id).cloned().unwrap_or_default();
        for name in new_s.difference(&old_s) {
            added_skills.push(DiffItem { tool_name: tool_name.clone(), item_name: name.clone() });
        }
        for name in old_s.difference(&new_s) {
            removed_skills.push(DiffItem { tool_name: tool_name.clone(), item_name: name.clone() });
        }

        let old_m = old_mcps.get(tool_id).cloned().unwrap_or_default();
        let new_m = new_mcps.get(tool_id).cloned().unwrap_or_default();
        for name in new_m.difference(&old_m) {
            added_mcps.push(DiffItem { tool_name: tool_name.clone(), item_name: name.clone() });
        }
        for name in old_m.difference(&new_m) {
            removed_mcps.push(DiffItem { tool_name: tool_name.clone(), item_name: name.clone() });
        }
    }

    ToolsDiff { added_skills, removed_skills, added_mcps, removed_mcps }
}

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut debouncer = match new_debouncer(Duration::from_millis(500), tx) {
            Ok(d) => d,
            Err(_) => return,
        };

        let paths: Vec<std::path::PathBuf> = {
            let home = match dirs::home_dir() {
                Some(h) => h,
                None => return,
            };
            vec![
                home.join(".claude").join("settings.json"),
                home.join(".claude").join("skills"),
                home.join(".cursor").join("mcp.json"),
                home.join(".cursor").join("skills-cursor"),
                home.join(".config").join("gemini"),
                home.join("Library").join("Application Support")
                    .join("Code").join("User").join("settings.json"),
                home.join("Library").join("Application Support")
                    .join("Windsurf").join("User").join("settings.json"),
            ]
        };

        use notify::RecursiveMode;
        for path in &paths {
            if path.exists() {
                let _ = debouncer.watcher().watch(path, RecursiveMode::Recursive);
            }
        }

        // Tool id → display name map
        let tool_names: HashMap<String, String> = [
            ("claude", "Claude Code"),
            ("cursor", "Cursor"),
            ("gemini", "Gemini CLI"),
            ("copilot", "GitHub Copilot"),
            ("windsurf", "Windsurf"),
            ("chatgpt", "ChatGPT"),
        ].iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();

        // Take initial snapshot
        let (mut last_skills, mut last_mcps) = take_snapshot(&app);

        loop {
            match rx.recv() {
                Ok(Ok(events)) => {
                    let relevant = events.iter().any(|e| {
                        matches!(e.kind, DebouncedEventKind::Any)
                    });
                    if !relevant { continue; }

                    let (new_skills, new_mcps) = take_snapshot(&app);
                    let diff = diff_snapshots(
                        &last_skills, &new_skills,
                        &last_mcps, &new_mcps,
                        &tool_names,
                    );

                    // Only emit/notify if something actually changed
                    let has_changes = !diff.added_skills.is_empty()
                        || !diff.removed_skills.is_empty()
                        || !diff.added_mcps.is_empty()
                        || !diff.removed_mcps.is_empty();

                    // Always emit tools-changed so UI refreshes
                    let _ = app.emit("tools-changed", ());

                    if has_changes {
                        let _ = app.emit("tools-diff", &diff);

                        // Fire macOS notifications
                        use tauri_plugin_notification::NotificationExt;
                        for item in &diff.added_skills {
                            let _ = app.notification()
                                .builder()
                                .title("agentbar")
                                .body(format!("{}: skill {} added", item.tool_name, item.item_name))
                                .show();
                        }
                        for item in &diff.added_mcps {
                            let _ = app.notification()
                                .builder()
                                .title("agentbar")
                                .body(format!("{}: MCP {} added", item.tool_name, item.item_name))
                                .show();
                        }
                        // Don't notify on removals (too noisy)
                    }

                    last_skills = new_skills;
                    last_mcps = new_mcps;
                }
                Ok(Err(_)) | Err(_) => break,
            }
        }
    });
}
