use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Serialize)]
pub struct AgentsDiff {
    pub added_skills: Vec<DiffItem>,
    pub removed_skills: Vec<DiffItem>,
    pub added_mcps: Vec<DiffItem>,
    pub removed_mcps: Vec<DiffItem>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiffItem {
    pub agent_name: String,
    pub item_name: String,
}

// Snapshot: agent_id → set of skill paths or mcp names
type SkillSnapshot = HashMap<String, HashSet<String>>;
type McpSnapshot = HashMap<String, HashSet<String>>;

fn take_snapshot(_app: &AppHandle) -> (Vec<crate::models::Agent>, SkillSnapshot, McpSnapshot) {
    let agents = crate::detectors::detect_all();
    let mut skills: SkillSnapshot = HashMap::new();
    let mut mcps: McpSnapshot = HashMap::new();
    for agent in &agents {
        if !agent.installed {
            continue;
        }
        skills.insert(
            agent.id.clone(),
            agent.skills.iter().map(|s| s.name.clone()).collect(),
        );
        mcps.insert(
            agent.id.clone(),
            agent.mcps.iter().map(|m| m.name.clone()).collect(),
        );
    }
    (agents, skills, mcps)
}

fn diff_snapshots(
    old_skills: &SkillSnapshot,
    new_skills: &SkillSnapshot,
    old_mcps: &McpSnapshot,
    new_mcps: &McpSnapshot,
    // agent_id → display name
    agent_names: &HashMap<String, String>,
) -> AgentsDiff {
    let mut added_skills = vec![];
    let mut removed_skills = vec![];
    let mut added_mcps = vec![];
    let mut removed_mcps = vec![];

    let all_agent_ids: HashSet<&String> = old_skills.keys().chain(new_skills.keys()).collect();

    for agent_id in all_agent_ids {
        let agent_name = agent_names
            .get(agent_id)
            .cloned()
            .unwrap_or_else(|| agent_id.clone());

        let old_s = old_skills.get(agent_id).cloned().unwrap_or_default();
        let new_s = new_skills.get(agent_id).cloned().unwrap_or_default();
        for name in new_s.difference(&old_s) {
            added_skills.push(DiffItem {
                agent_name: agent_name.clone(),
                item_name: name.clone(),
            });
        }
        for name in old_s.difference(&new_s) {
            removed_skills.push(DiffItem {
                agent_name: agent_name.clone(),
                item_name: name.clone(),
            });
        }

        let old_m = old_mcps.get(agent_id).cloned().unwrap_or_default();
        let new_m = new_mcps.get(agent_id).cloned().unwrap_or_default();
        for name in new_m.difference(&old_m) {
            added_mcps.push(DiffItem {
                agent_name: agent_name.clone(),
                item_name: name.clone(),
            });
        }
        for name in old_m.difference(&new_m) {
            removed_mcps.push(DiffItem {
                agent_name: agent_name.clone(),
                item_name: name.clone(),
            });
        }
    }

    AgentsDiff {
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

        // Take initial snapshot; derive display names from it (manifest name field).
        let (initial_agents, mut last_skills, mut last_mcps) = take_snapshot(&app);
        let agent_names: HashMap<String, String> = initial_agents
            .iter()
            .map(|a| (a.id.clone(), a.name.clone()))
            .collect();

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
                &agent_names,
            );

            let has_changes = !diff.added_skills.is_empty()
                || !diff.removed_skills.is_empty()
                || !diff.added_mcps.is_empty()
                || !diff.removed_mcps.is_empty();

            if has_changes {
                let _ = app.emit("agents-changed", ());
                let _ = app.emit("agents-diff", &diff);
            }

            // Re-run Doctor on every relevant FS event (catches command edits too)
            let db = app.state::<crate::db::DbState>();
            crate::doctor::run(&new_tools, &db, &app);

            last_skills = new_skills;
            last_mcps = new_mcps;
        }
    });
}
