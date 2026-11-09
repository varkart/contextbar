use notify::{RecursiveMode, Watcher};
use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
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

/// Tracks which paths are already watched so re-arming is idempotent.
#[derive(Default)]
struct Armed {
    recursive: HashSet<PathBuf>,
    shallow: HashSet<PathBuf>,
}

impl Armed {
    /// Watch `target` recursively if it exists. Otherwise watch only its
    /// nearest existing ancestor, non-recursively, to catch the target being
    /// created. Never recursive on an ancestor: for a missing ~/.windsurf
    /// that ancestor is ~, and a recursive watch there would cover all of
    /// ~/Documents, ~/Desktop and ~/Downloads — a macOS privacy prompt and a
    /// rescan on every file write anywhere in the home folder.
    fn arm(&mut self, watcher: &mut dyn Watcher, target: &Path) {
        if self.recursive.contains(target) {
            return;
        }
        if target.exists() {
            if watcher.watch(target, RecursiveMode::Recursive).is_ok() {
                self.recursive.insert(target.to_path_buf());
            }
            return;
        }
        let Some(ancestor) = target.ancestors().skip(1).find(|p| p.exists()) else {
            return;
        };
        if self.shallow.contains(ancestor) {
            return;
        }
        if watcher.watch(ancestor, RecursiveMode::NonRecursive).is_ok() {
            self.shallow.insert(ancestor.to_path_buf());
        }
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

        let watch_targets: Vec<PathBuf> = vec![
            home.join(".claude"),
            home.join(".codex"),
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

        let mut armed = Armed::default();
        for target in &watch_targets {
            armed.arm(debouncer.watcher(), target);
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

            // A missing tool dir may have just been created under a watched ancestor.
            for target in &watch_targets {
                armed.arm(debouncer.watcher(), target);
            }

            // Ancestor watches (e.g. ~ itself) also see unrelated churn like
            // shell history writes — only rescan for events inside a tool dir.
            let in_target = events
                .iter()
                .any(|e| watch_targets.iter().any(|t| e.path.starts_with(t)));
            if !in_target {
                continue;
            }

            // Session stores changed? Tell the UI to refresh its session list
            // (FSEvents push replaces most of the old 30s polling).
            let sessions_touched = events.iter().any(|e| {
                let p = e.path.to_string_lossy();
                p.contains("/.claude/projects/")
                    || p.ends_with("/.claude/history.jsonl")
                    || p.contains("/.codex/sessions/")
                    || p.contains("/.gemini/tmp/")
            });
            if sessions_touched {
                let _ = app.emit("sessions-changed", ());
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

#[cfg(test)]
mod tests {
    use super::*;
    use notify::{Config, EventHandler, WatcherKind};

    #[derive(Default)]
    struct Recorder(Vec<(PathBuf, RecursiveMode)>);

    impl Watcher for Recorder {
        fn new<F: EventHandler>(_: F, _: Config) -> notify::Result<Self> {
            Ok(Self::default())
        }
        fn watch(&mut self, path: &Path, mode: RecursiveMode) -> notify::Result<()> {
            self.0.push((path.to_path_buf(), mode));
            Ok(())
        }
        fn unwatch(&mut self, _: &Path) -> notify::Result<()> {
            Ok(())
        }
        fn kind() -> WatcherKind {
            WatcherKind::NullWatcher
        }
    }

    #[test]
    fn missing_target_watches_ancestor_shallowly_then_recursively_once_created() {
        let home = tempfile::tempdir().unwrap();
        let target = home.path().join(".windsurf");
        let mut armed = Armed::default();
        let mut w = Recorder::default();

        armed.arm(&mut w, &target);
        armed.arm(&mut w, &target);
        assert_eq!(
            w.0,
            vec![(home.path().to_path_buf(), RecursiveMode::NonRecursive)]
        );

        std::fs::create_dir(&target).unwrap();
        armed.arm(&mut w, &target);
        armed.arm(&mut w, &target);
        assert_eq!(w.0.len(), 2);
        assert_eq!(w.0[1], (target, RecursiveMode::Recursive));
    }

    #[test]
    fn nested_missing_target_steps_down_as_parents_appear() {
        let home = tempfile::tempdir().unwrap();
        let code = home.path().join("Code");
        let target = code.join("User");
        let mut armed = Armed::default();
        let mut w = Recorder::default();

        armed.arm(&mut w, &target);
        std::fs::create_dir(&code).unwrap();
        armed.arm(&mut w, &target);
        assert_eq!(
            w.0,
            vec![
                (home.path().to_path_buf(), RecursiveMode::NonRecursive),
                (code, RecursiveMode::NonRecursive),
            ]
        );
        assert!(w.0.iter().all(|(_, m)| *m == RecursiveMode::NonRecursive));
    }
}
