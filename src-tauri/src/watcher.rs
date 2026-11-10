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
    ///
    /// Returns true when `target` itself just became watched — its contents
    /// may already have been written before the watch existed.
    fn arm(&mut self, watcher: &mut dyn Watcher, target: &Path) -> bool {
        if self.recursive.contains(target) {
            return false;
        }
        if target.exists() {
            if watcher.watch(target, RecursiveMode::Recursive).is_ok() {
                self.recursive.insert(target.to_path_buf());
                return true;
            }
            return false;
        }
        let Some(ancestor) = target.ancestors().skip(1).find(|p| p.exists()) else {
            return false;
        };
        if !self.shallow.contains(ancestor)
            && watcher.watch(ancestor, RecursiveMode::NonRecursive).is_ok()
        {
            self.shallow.insert(ancestor.to_path_buf());
        }
        false
    }
}

/// Hash of the MCP sections of ~/.claude.json. Claude Code rewrites that
/// file constantly (tips, per-project counters), so a rescan is only worth
/// it when the parts Context Bar reads actually changed.
fn claude_json_mcp_fingerprint(path: &Path) -> Option<u64> {
    use std::hash::{Hash, Hasher};
    let text = std::fs::read_to_string(path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&text).ok()?;
    let mut h = std::collections::hash_map::DefaultHasher::new();
    json.get("mcpServers").map(|v| v.to_string()).hash(&mut h);
    if let Some(projects) = json.get("projects").and_then(|v| v.as_object()) {
        for (name, proj) in projects {
            for key in ["mcpServers", "disabledMcpServers"] {
                if let Some(v) = proj.get(key) {
                    (name, key, v.to_string()).hash(&mut h);
                }
            }
        }
    }
    Some(h.finish())
}

/// FSEvents reports real paths, so an event under a symlinked target (e.g.
/// ~/.claude → ~/dotfiles/claude) is mapped back to the target's own path.
fn alias_event_path(path: &Path, aliases: &[(PathBuf, PathBuf)]) -> PathBuf {
    for (real, target) in aliases {
        if let Ok(rest) = path.strip_prefix(real) {
            return target.join(rest);
        }
    }
    path.to_path_buf()
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
            home.join("Library")
                .join("Application Support")
                .join("ClaudeCode"),
            // Config read by the manifests outside the dirs above.
            home.join(".claude.json"),
            home.join(".agents"),
            home.join(".config").join("opencode"),
            home.join(".kiro"),
            home.join(".aws").join("amazonq"),
            home.join(".q"),
        ];

        let mut armed = Armed::default();
        for target in &watch_targets {
            armed.arm(debouncer.watcher(), target);
        }

        let claude_json = home.join(".claude.json");
        let mut last_claude_json_fp = claude_json_mcp_fingerprint(&claude_json);

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

            // A missing tool dir may have just been created under a watched
            // ancestor. Arm every target (no short-circuit).
            let mut newly_watched = false;
            for target in &watch_targets {
                newly_watched |= armed.arm(debouncer.watcher(), target);
            }

            let aliases: Vec<(PathBuf, PathBuf)> = watch_targets
                .iter()
                .filter_map(|t| {
                    let real = t.canonicalize().ok()?;
                    (real != *t).then(|| (real, t.clone()))
                })
                .collect();
            let paths: Vec<PathBuf> = events
                .iter()
                .map(|e| alias_event_path(&e.path, &aliases))
                .collect();

            // Ancestor watches (e.g. ~ itself) also see unrelated churn like
            // shell history writes — only rescan for events inside a tool dir.
            let in_target = paths
                .iter()
                .any(|p| watch_targets.iter().any(|t| p.starts_with(t)));
            if !in_target && !newly_watched {
                continue;
            }
            // Only ~/.claude.json changed: rescan only if its MCP parts did.
            let only_claude_json = paths
                .iter()
                .filter(|p| watch_targets.iter().any(|t| p.starts_with(t)))
                .all(|p| *p == claude_json);
            if !newly_watched && only_claude_json {
                let fp = claude_json_mcp_fingerprint(&claude_json);
                if fp == last_claude_json_fp {
                    continue;
                }
                last_claude_json_fp = fp;
            }

            // Session stores changed? Tell the UI to refresh its session list
            // (FSEvents push replaces most of the old 30s polling).
            let sessions_touched = paths.iter().any(|p| {
                let p = p.to_string_lossy();
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
    fn alias_event_path_maps_real_paths_back_to_symlinked_targets() {
        let aliases = vec![(
            PathBuf::from("/u/dotfiles/claude"),
            PathBuf::from("/u/.claude"),
        )];
        assert_eq!(
            alias_event_path(Path::new("/u/dotfiles/claude/skills/x/SKILL.md"), &aliases),
            PathBuf::from("/u/.claude/skills/x/SKILL.md")
        );
        assert_eq!(
            alias_event_path(Path::new("/u/.codex/config.toml"), &aliases),
            PathBuf::from("/u/.codex/config.toml")
        );
    }

    #[test]
    fn claude_json_fingerprint_ignores_non_mcp_churn() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join(".claude.json");
        let write = |tips: u32, cmd: &str| {
            let v = serde_json::json!({
                "numStartups": tips,
                "projects": { "/p": { "lastCost": tips, "mcpServers": { "a": { "command": cmd } } } }
            });
            std::fs::write(&f, v.to_string()).unwrap();
        };
        write(1, "npx");
        let a = claude_json_mcp_fingerprint(&f);
        write(2, "npx");
        assert_eq!(
            claude_json_mcp_fingerprint(&f),
            a,
            "counter churn must not trigger a rescan"
        );
        write(3, "uvx");
        assert_ne!(claude_json_mcp_fingerprint(&f), a, "an MCP change must");
    }

    #[test]
    fn missing_target_watches_ancestor_shallowly_then_recursively_once_created() {
        let home = tempfile::tempdir().unwrap();
        let target = home.path().join(".windsurf");
        let mut armed = Armed::default();
        let mut w = Recorder::default();

        assert!(!armed.arm(&mut w, &target));
        assert!(!armed.arm(&mut w, &target));
        assert_eq!(
            w.0,
            vec![(home.path().to_path_buf(), RecursiveMode::NonRecursive)]
        );

        std::fs::create_dir(&target).unwrap();
        assert!(armed.arm(&mut w, &target), "newly watched, caller rescans");
        assert!(!armed.arm(&mut w, &target));
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
