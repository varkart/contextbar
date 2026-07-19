//! Git worktree discovery across the repos the user works in.
//!
//! Repos are discovered from the Claude Code session history index (the same
//! project list the Sessions view uses), deduplicated by the repo's common git
//! dir so multiple worktrees of one repo collapse into a single group.
//! Everything is read-only except `remove_worktree`, which refuses to touch a
//! worktree that is dirty or not fully merged into the base branch.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: Option<String>,
    pub is_primary: bool,
    pub is_detached: bool,
    pub is_dirty: bool,
    /// Commits on this branch not in the base branch. 0 + clean == merged.
    pub ahead: u32,
    /// Commits on the base branch not in this branch.
    pub behind: u32,
    pub is_merged: bool,
    pub last_commit_ts: Option<u64>,
    pub last_commit_subject: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoWorktrees {
    pub repo_name: String,
    pub repo_path: String,
    pub base_branch: String,
    pub worktrees: Vec<WorktreeInfo>,
    /// Agent instruction/config files present at the primary checkout root.
    pub agent_files: Vec<String>,
    /// Skill names under <root>/.claude/skills/.
    pub repo_skills: Vec<String>,
}

/// Known agent instruction/config files to surface per repo.
const AGENT_FILES: &[&str] = &[
    "CLAUDE.md",
    "AGENTS.md",
    "GEMINI.md",
    ".cursorrules",
    ".cursor/rules",
    ".mcp.json",
];

fn scan_agent_files(root: &Path) -> Vec<String> {
    AGENT_FILES
        .iter()
        .filter(|f| root.join(f).exists())
        .map(|f| f.to_string())
        .collect()
}

fn scan_repo_skills(root: &Path) -> Vec<String> {
    let mut out: Vec<String> = std::fs::read_dir(root.join(".claude").join("skills"))
        .map(|entries| {
            entries
                .flatten()
                .filter(|e| e.path().is_dir())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .collect()
        })
        .unwrap_or_default();
    out.sort();
    out
}

fn git(dir: &Path, args: &[&str]) -> Option<String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Resolve the repo's base branch: origin/HEAD target if set, else main/master.
fn base_branch(root: &Path) -> String {
    if let Some(head) = git(
        root,
        &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    ) {
        if let Some(name) = head.strip_prefix("origin/") {
            return name.to_string();
        }
    }
    for candidate in ["main", "master"] {
        if git(
            root,
            &[
                "rev-parse",
                "--verify",
                "--quiet",
                &format!("refs/heads/{candidate}"),
            ],
        )
        .is_some()
        {
            return candidate.to_string();
        }
    }
    "HEAD".to_string()
}

/// Parse `git worktree list --porcelain` output into (path, branch, detached) tuples.
fn parse_worktree_list(output: &str) -> Vec<(PathBuf, Option<String>, bool)> {
    let mut result = Vec::new();
    let mut path: Option<PathBuf> = None;
    let mut branch: Option<String> = None;
    let mut detached = false;
    for line in output.lines().chain(std::iter::once("")) {
        if line.is_empty() {
            if let Some(p) = path.take() {
                result.push((p, branch.take(), detached));
            }
            detached = false;
            continue;
        }
        if let Some(p) = line.strip_prefix("worktree ") {
            path = Some(PathBuf::from(p));
        } else if let Some(b) = line.strip_prefix("branch ") {
            branch = Some(b.strip_prefix("refs/heads/").unwrap_or(b).to_string());
        } else if line == "detached" {
            detached = true;
        }
    }
    result
}

fn inspect_worktree(
    root: &Path,
    base: &str,
    path: &Path,
    branch: Option<String>,
    detached: bool,
    is_primary: bool,
) -> WorktreeInfo {
    let is_dirty = git(path, &["status", "--porcelain"])
        .map(|s| !s.is_empty())
        .unwrap_or(false);

    let (mut ahead, mut behind) = (0u32, 0u32);
    if let Some(b) = &branch {
        if b != base {
            if let Some(counts) = git(
                root,
                &[
                    "rev-list",
                    "--left-right",
                    "--count",
                    &format!("{base}...{b}"),
                ],
            ) {
                let mut parts = counts.split_whitespace();
                behind = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
                ahead = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
            }
        }
    }
    let is_merged = branch.as_deref().map(|b| b != base).unwrap_or(false) && ahead == 0;

    let last_commit_ts = git(path, &["log", "-1", "--format=%ct"]).and_then(|s| s.parse().ok());
    let last_commit_subject = git(path, &["log", "-1", "--format=%s"]);

    WorktreeInfo {
        path: path.to_string_lossy().to_string(),
        branch,
        is_primary,
        is_detached: detached,
        is_dirty,
        ahead,
        behind,
        is_merged,
        last_commit_ts,
        last_commit_subject,
    }
}

/// Primary checkout root for every distinct repo referenced by session
/// history. Worktrees of one repo share a common git dir, which dedupes them;
/// the primary checkout is that dir's parent.
fn discover_primary_roots() -> Vec<PathBuf> {
    let projects = super::history::list_session_projects();
    let mut seen_repos: HashSet<PathBuf> = HashSet::new();
    let mut roots = Vec::new();

    for project in projects {
        let dir = PathBuf::from(&project);
        if !dir.is_dir() {
            continue;
        }
        let Some(root) = git(&dir, &["rev-parse", "--show-toplevel"]).map(PathBuf::from) else {
            continue;
        };
        let common = git(
            &root,
            &["rev-parse", "--path-format=absolute", "--git-common-dir"],
        )
        .map(PathBuf::from)
        .unwrap_or_else(|| root.join(".git"));
        if !seen_repos.insert(common.clone()) {
            continue;
        }
        roots.push(common.parent().map(Path::to_path_buf).unwrap_or(root));
    }
    roots
}

/// Commit timestamps (unix seconds) across all branches of every known repo
/// in the last `since_days` days. Day bucketing happens frontend-side in the
/// user's local timezone.
pub fn commit_timestamps(since_days: u32) -> Vec<u64> {
    let mut out = Vec::new();
    for root in discover_primary_roots() {
        if let Some(log) = git(
            &root,
            &[
                "log",
                "--all",
                &format!("--since={since_days} days ago"),
                "--format=%ct",
            ],
        ) {
            out.extend(log.lines().filter_map(|l| l.trim().parse::<u64>().ok()));
        }
    }
    out
}

/// Scan all repos referenced by session history and list their worktrees.
pub fn list_worktrees() -> Vec<RepoWorktrees> {
    let mut result = Vec::new();

    for primary_root in discover_primary_roots() {
        let Some(listing) = git(&primary_root, &["worktree", "list", "--porcelain"]) else {
            continue;
        };
        let base = base_branch(&primary_root);
        let entries = parse_worktree_list(&listing);
        let mut worktrees: Vec<WorktreeInfo> = entries
            .iter()
            .enumerate()
            .filter(|(_, (p, _, _))| p.is_dir())
            .map(|(i, (p, b, d))| inspect_worktree(&primary_root, &base, p, b.clone(), *d, i == 0))
            .collect();
        if worktrees.is_empty() {
            continue;
        }
        // Most recently committed first.
        worktrees.sort_by_key(|w| std::cmp::Reverse(w.last_commit_ts.unwrap_or(0)));

        let repo_name = primary_root
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| primary_root.to_string_lossy().to_string());
        result.push(RepoWorktrees {
            repo_name,
            repo_path: primary_root.to_string_lossy().to_string(),
            base_branch: base,
            worktrees,
            agent_files: scan_agent_files(&primary_root),
            repo_skills: scan_repo_skills(&primary_root),
        });
    }

    // Most recently active repo first (max worktree commit time); name as tiebreak.
    result.sort_by(|a, b| {
        let ts = |r: &RepoWorktrees| {
            r.worktrees
                .iter()
                .filter_map(|w| w.last_commit_ts)
                .max()
                .unwrap_or(0)
        };
        ts(b)
            .cmp(&ts(a))
            .then_with(|| a.repo_name.to_lowercase().cmp(&b.repo_name.to_lowercase()))
    });
    result
}

/// Remove a linked worktree. Refuses primary checkouts, dirty trees, and
/// branches not fully merged into the base branch — re-verified here rather
/// than trusting the frontend's snapshot.
pub fn remove_worktree(repo_path: &str, worktree_path: &str) -> Result<(), String> {
    let root = PathBuf::from(repo_path);
    let wt = PathBuf::from(worktree_path);
    if !root.is_dir() || !wt.is_dir() {
        return Err("repo or worktree path does not exist".into());
    }

    let listing = git(&root, &["worktree", "list", "--porcelain"])
        .ok_or("not a git repository or git unavailable")?;
    let entries = parse_worktree_list(&listing);
    let canonical_wt = wt
        .canonicalize()
        .map_err(|e| format!("cannot access worktree: {e}"))?;
    let (idx, entry) = entries
        .iter()
        .enumerate()
        .find(|(_, (p, _, _))| p.canonicalize().ok().as_deref() == Some(canonical_wt.as_path()))
        .ok_or("path is not a worktree of this repository")?;
    if idx == 0 {
        return Err("refusing to remove the primary checkout".into());
    }

    let base = base_branch(&root);
    let info = inspect_worktree(&root, &base, &entry.0, entry.1.clone(), entry.2, false);
    if info.is_dirty {
        return Err("worktree has uncommitted changes".into());
    }
    if !info.is_merged {
        return Err("branch is not fully merged into the base branch".into());
    }

    let out = Command::new("git")
        .arg("-C")
        .arg(&root)
        .args(["worktree", "remove", worktree_path])
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{parse_worktree_list, scan_agent_files, scan_repo_skills};

    #[test]
    fn scans_agent_files_and_repo_skills() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::write(root.join("CLAUDE.md"), "x").unwrap();
        std::fs::write(root.join(".cursorrules"), "x").unwrap();
        std::fs::create_dir_all(root.join(".claude/skills/graphify")).unwrap();
        std::fs::create_dir_all(root.join(".claude/skills/deploy")).unwrap();
        std::fs::write(root.join(".claude/skills/notes.txt"), "x").unwrap();

        assert_eq!(scan_agent_files(root), vec!["CLAUDE.md", ".cursorrules"]);
        assert_eq!(scan_repo_skills(root), vec!["deploy", "graphify"]);

        let empty = tempfile::tempdir().unwrap();
        assert!(scan_agent_files(empty.path()).is_empty());
        assert!(scan_repo_skills(empty.path()).is_empty());
    }

    #[test]
    fn parses_porcelain_worktree_list() {
        let out = "worktree /Users/x/repo\nHEAD abc123\nbranch refs/heads/main\n\nworktree /Users/x/repo-wt\nHEAD def456\nbranch refs/heads/feature/foo\n\nworktree /Users/x/repo-spike\nHEAD 987fed\ndetached\n";
        let entries = parse_worktree_list(out);
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].0.to_string_lossy(), "/Users/x/repo");
        assert_eq!(entries[0].1.as_deref(), Some("main"));
        assert!(!entries[0].2);
        assert_eq!(entries[1].1.as_deref(), Some("feature/foo"));
        assert_eq!(entries[2].1, None);
        assert!(entries[2].2);
    }
}
