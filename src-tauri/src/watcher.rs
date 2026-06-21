use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

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

fn take_snapshot(_app: &AppHandle) -> (Vec<crate::models::AiTool>, SkillSnapshot, McpSnapshot) {
    let tools = crate::detectors::detect_all();
    let mut skills: SkillSnapshot = HashMap::new();
    let mut mcps: McpSnapshot = HashMap::new();
    for tool in &tools {
        if !tool.installed {
            continue;
        }
        skills.insert(
            tool.id.clone(),
            tool.skills.iter().map(|s| s.name.clone()).collect(),
        );
        mcps.insert(
            tool.id.clone(),
            tool.mcps.iter().map(|m| m.name.clone()).collect(),
        );
    }
    (tools, skills, mcps)
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

    let all_tool_ids: HashSet<&String> = old_skills.keys().chain(new_skills.keys()).collect();

    for tool_id in all_tool_ids {
        let tool_name = tool_names
            .get(tool_id)
            .cloned()
            .unwrap_or_else(|| tool_id.clone());

        let old_s = old_skills.get(tool_id).cloned().unwrap_or_default();
        let new_s = new_skills.get(tool_id).cloned().unwrap_or_default();
        for name in new_s.difference(&old_s) {
            added_skills.push(DiffItem {
                tool_name: tool_name.clone(),
                item_name: name.clone(),
            });
        }
        for name in old_s.difference(&new_s) {
            removed_skills.push(DiffItem {
                tool_name: tool_name.clone(),
                item_name: name.clone(),
            });
        }

        let old_m = old_mcps.get(tool_id).cloned().unwrap_or_default();
        let new_m = new_mcps.get(tool_id).cloned().unwrap_or_default();
        for name in new_m.difference(&old_m) {
            added_mcps.push(DiffItem {
                tool_name: tool_name.clone(),
                item_name: name.clone(),
            });
        }
        for name in old_m.difference(&new_m) {
            removed_mcps.push(DiffItem {
                tool_name: tool_name.clone(),
                item_name: name.clone(),
            });
        }
    }

    ToolsDiff {
        added_skills,
        removed_skills,
        added_mcps,
        removed_mcps,
    }
}

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut debouncer = match new_debouncer(Duration::from_millis(500), tx) {
            Ok(d) => d,
            Err(_) => return,
        };

        let home = match dirs::home_dir() {
            Some(h) => h,
            None => return,
        };

        // Watch the deepest existing ancestor so we catch installs that happen after startup.
        // E.g. if ~/.cursor doesn't exist yet, watch ~ so creating ~/.cursor/mcp.json fires events.
        let watch_targets: Vec<std::path::PathBuf> = vec![
            home.join(".claude"),
            home.join(".cursor"),
            home.join(".gemini"),
            home.join(".windsurf"),
            home.join(".codeium"),
            home.join("Library")
                .join("Application Support")
                .join("Code")
                .join("User"),
            home.join("Library")
                .join("Application Support")
                .join("Windsurf")
                .join("User"),
        ];

        use notify::RecursiveMode;
        for target in &watch_targets {
            // Walk up to the first existing ancestor, then watch it recursively
            let watchable =
                std::iter::successors(Some(target.as_path()), |p| p.parent()).find(|p| p.exists());
            if let Some(p) = watchable {
                let _ = debouncer.watcher().watch(p, RecursiveMode::Recursive);
            }
        }

        // Tool id → display name map
        let tool_names: HashMap<String, String> = [
            ("claude", "Claude Code"),
            ("cursor", "Cursor"),
            ("gemini", "Gemini CLI"),
            ("copilot", "GitHub Copilot"),
            ("windsurf", "Windsurf"),
        ]
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();

        // Take initial snapshot
        let (_, mut last_skills, mut last_mcps) = take_snapshot(&app);

        while let Ok(Ok(events)) = rx.recv() {
            let relevant = events
                .iter()
                .any(|e| matches!(e.kind, DebouncedEventKind::Any));
            if !relevant {
                continue;
            }

            let (new_tools, new_skills, new_mcps) = take_snapshot(&app);
            let diff = diff_snapshots(
                &last_skills,
                &new_skills,
                &last_mcps,
                &new_mcps,
                &tool_names,
            );

            let has_changes = !diff.added_skills.is_empty()
                || !diff.removed_skills.is_empty()
                || !diff.added_mcps.is_empty()
                || !diff.removed_mcps.is_empty();

            if has_changes {
                let _ = app.emit("tools-changed", ());
                let _ = app.emit("tools-diff", &diff);
            }

            // Re-run Doctor on every relevant FS event (catches command edits too)
            let db = app.state::<crate::db::DbState>();
            crate::doctor::run(&new_tools, &db, &app);

            last_skills = new_skills;
            last_mcps = new_mcps;
        }
    });
}
