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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestInfo {
    pub number: u32,
    pub title: String,
    pub url: String,
    pub author: String,
    pub is_draft: bool,
}

/// A self-hosted GitHub Enterprise or GitLab self-managed instance the user
/// has configured in Settings, so its custom domain resolves for PR/MR
/// tracking the same way github.com / gitlab.com do automatically.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomGitHost {
    pub domain: String,
    pub kind: String, // "github" | "gitlab"
}

fn parse_slug_for_host(url: &str, host: &str) -> Option<String> {
    let trimmed = url.trim().trim_end_matches(".git");
    trimmed
        .strip_prefix(&format!("git@{host}:"))
        .or_else(|| trimmed.strip_prefix(&format!("https://{host}/")))
        .or_else(|| trimmed.strip_prefix(&format!("http://{host}/")))
        .map(|s| s.to_string())
}

/// Extract `owner/repo` from a GitHub remote URL, both SSH and HTTPS forms.
fn parse_github_slug(url: &str) -> Option<String> {
    parse_slug_for_host(url, "github.com")
}

/// Extract the project path (`group/project`, or `group/subgroup/project`
/// for nested groups) from a gitlab.com remote URL.
fn parse_gitlab_slug(url: &str) -> Option<String> {
    parse_slug_for_host(url, "gitlab.com")
}

/// Open PRs for a repo's GitHub remote, via the `gh` CLI (already
/// authenticated locally if the user has ever run `gh auth login`). `host`
/// targets a GitHub Enterprise instance via `GH_HOST`; `None` means github.com.
fn github_prs(slug: &str, host: Option<&str>) -> Vec<PullRequestInfo> {
    let mut cmd = Command::new("gh");
    cmd.args([
        "pr",
        "list",
        "--repo",
        slug,
        "--state",
        "open",
        "--json",
        "number,title,url,author,isDraft",
        "--limit",
        "30",
    ]);
    if let Some(h) = host {
        cmd.env("GH_HOST", h);
    }
    let out = cmd.output();
    let Ok(out) = out else { return Vec::new() }; // gh not installed
    if !out.status.success() {
        // Private repo without access, no such remote, etc. — not fatal.
        return Vec::new();
    }

    #[derive(Deserialize)]
    struct RawAuthor {
        login: String,
    }
    #[derive(Deserialize)]
    struct RawPr {
        number: u32,
        title: String,
        url: String,
        author: RawAuthor,
        #[serde(rename = "isDraft")]
        is_draft: bool,
    }
    let Ok(raw) = serde_json::from_slice::<Vec<RawPr>>(&out.stdout) else {
        return Vec::new();
    };
    raw.into_iter()
        .map(|p| PullRequestInfo {
            number: p.number,
            title: p.title,
            url: p.url,
            author: p.author.login,
            is_draft: p.is_draft,
        })
        .collect()
}

/// Open MRs for a repo's gitlab.com remote, via the `glab` CLI (already
/// authenticated locally if the user has ever run `glab auth login`). `host`
/// targets a self-managed GitLab instance via `GITLAB_HOST`; `None` means
/// gitlab.com. Unverified against a real `glab` install (not available in
/// this dev environment) — field names are aliased across the variants
/// GitLab's API has used (`web_url`/`url`, `work_in_progress`/`draft`) and
/// any shape mismatch degrades to an empty list rather than an error, same
/// as the GitHub path when `gh`'s output doesn't parse.
fn gitlab_mrs(slug: &str, host: Option<&str>) -> Vec<PullRequestInfo> {
    let mut cmd = Command::new("glab");
    cmd.args([
        "mr", "list", "--repo", slug, "--state", "opened", "--output", "json",
    ]);
    if let Some(h) = host {
        cmd.env("GITLAB_HOST", h);
    }
    let out = cmd.output();
    let Ok(out) = out else { return Vec::new() }; // glab not installed
    if !out.status.success() {
        return Vec::new();
    }

    #[derive(Deserialize)]
    struct RawAuthor {
        username: String,
    }
    #[derive(Deserialize)]
    struct RawMr {
        iid: u32,
        title: String,
        #[serde(alias = "web_url")]
        url: String,
        author: RawAuthor,
        #[serde(default, alias = "work_in_progress")]
        draft: bool,
    }
    let Ok(raw) = serde_json::from_slice::<Vec<RawMr>>(&out.stdout) else {
        return Vec::new();
    };
    raw.into_iter()
        .map(|m| PullRequestInfo {
            number: m.iid,
            title: m.title,
            url: m.url,
            author: m.author.username,
            is_draft: m.draft,
        })
        .collect()
}

/// Open PRs/MRs for a repo's remote — github.com, gitlab.com, or any
/// self-hosted instance the user configured in Settings. Returns an empty
/// list for anything else — no recognized remote, no matching CLI
/// installed, or a private repo without access — the caller treats that as
/// "nothing to show", not an error.
pub fn open_prs(
    repo_path: &str,
    custom_hosts: &[CustomGitHost],
) -> Result<Vec<PullRequestInfo>, String> {
    let root = Path::new(repo_path);
    let Some(remote) = git(root, &["remote", "get-url", "origin"]) else {
        return Ok(Vec::new());
    };
    if let Some(slug) = parse_github_slug(&remote) {
        return Ok(github_prs(&slug, None));
    }
    if let Some(slug) = parse_gitlab_slug(&remote) {
        return Ok(gitlab_mrs(&slug, None));
    }
    for host in custom_hosts {
        if let Some(slug) = parse_slug_for_host(&remote, &host.domain) {
            return Ok(match host.kind.as_str() {
                "github" => github_prs(&slug, Some(&host.domain)),
                "gitlab" => gitlab_mrs(&slug, Some(&host.domain)),
                _ => Vec::new(),
            });
        }
    }
    Ok(Vec::new())
}

/// Detected state of a PR/MR-tracking CLI tool (`gh` or `glab`).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCliInfo {
    pub installed: bool,
    pub version: Option<String>,
    pub authenticated: bool,
    pub account: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCliStatus {
    pub gh: GitCliInfo,
    pub glab: GitCliInfo,
}

fn detect_gh() -> GitCliInfo {
    let Ok(ver_out) = Command::new("gh").arg("--version").output() else {
        return GitCliInfo::default();
    };
    if !ver_out.status.success() {
        return GitCliInfo::default();
    }
    let version = String::from_utf8_lossy(&ver_out.stdout)
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(2))
        .map(|s| s.to_string());

    let (authenticated, account) = match Command::new("gh").args(["auth", "status"]).output() {
        Ok(o) if o.status.success() => {
            let text = String::from_utf8_lossy(&o.stdout);
            let account = text
                .split("account ")
                .nth(1)
                .and_then(|s| s.split_whitespace().next())
                .map(|s| s.to_string());
            (true, account)
        }
        _ => (false, None),
    };

    GitCliInfo {
        installed: true,
        version,
        authenticated,
        account,
    }
}

fn detect_glab() -> GitCliInfo {
    let Ok(ver_out) = Command::new("glab").arg("--version").output() else {
        return GitCliInfo::default();
    };
    if !ver_out.status.success() {
        return GitCliInfo::default();
    }
    let version = String::from_utf8_lossy(&ver_out.stdout)
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().last())
        .map(|s| s.to_string());

    let (authenticated, account) = match Command::new("glab").args(["auth", "status"]).output() {
        Ok(o) if o.status.success() => {
            let text = String::from_utf8_lossy(&o.stdout);
            let account = text
                .split(" as ")
                .nth(1)
                .and_then(|s| s.split(|c: char| c.is_whitespace() || c == '(').next())
                .map(|s| s.to_string());
            (true, account)
        }
        _ => (false, None),
    };

    GitCliInfo {
        installed: true,
        version,
        authenticated,
        account,
    }
}

/// Detect whether `gh` and `glab` are installed and authenticated, for the
/// Settings page's PR/MR source configuration section.
pub fn detect_git_cli() -> GitCliStatus {
    GitCliStatus {
        gh: detect_gh(),
        glab: detect_glab(),
    }
}

/// Claude Code's own `isolation: "worktree"` agent feature creates scratch
/// git worktrees under `<repo>/.claude/worktrees/agent-<id>` for subagent
/// runs — real git worktrees, but internal tooling scratch space, not user
/// branches. Surfacing them (e.g. in "needs attention") is just noise.
fn is_internal_agent_worktree(path: &Path) -> bool {
    let comps: Vec<_> = path.components().collect();
    comps
        .windows(2)
        .any(|w| w[0].as_os_str() == ".claude" && w[1].as_os_str() == "worktrees")
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
            .filter(|(_, (p, _, _))| p.is_dir() && !is_internal_agent_worktree(p))
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
    use super::{
        is_internal_agent_worktree, parse_github_slug, parse_gitlab_slug, parse_slug_for_host,
        parse_worktree_list, scan_agent_files, scan_repo_skills, GitCliInfo, GitCliStatus,
    };
    use std::path::Path;

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

    #[test]
    fn excludes_internal_agent_isolation_worktrees() {
        assert!(is_internal_agent_worktree(Path::new(
            "/Users/x/repo/.claude/worktrees/agent-a66bbde234d1bf75d"
        )));
        assert!(!is_internal_agent_worktree(Path::new(
            "/Users/x/repo-feature-worktree"
        )));
        assert!(!is_internal_agent_worktree(Path::new(
            "/Users/x/.claude/skills/graphify"
        )));
        assert!(!is_internal_agent_worktree(Path::new("/Users/x/repo")));
    }

    #[test]
    fn parses_github_slug_ssh_and_https() {
        assert_eq!(
            parse_github_slug("git@github.com:varkart/contextbar.git"),
            Some("varkart/contextbar".to_string())
        );
        assert_eq!(
            parse_github_slug("https://github.com/varkart/contextbar.git"),
            Some("varkart/contextbar".to_string())
        );
        assert_eq!(
            parse_github_slug("https://github.com/varkart/contextbar"),
            Some("varkart/contextbar".to_string())
        );
        assert_eq!(parse_github_slug("https://gitlab.com/group/project"), None);
    }

    #[test]
    fn parses_gitlab_slug_ssh_https_and_nested_groups() {
        assert_eq!(
            parse_gitlab_slug("git@gitlab.com:group/project.git"),
            Some("group/project".to_string())
        );
        assert_eq!(
            parse_gitlab_slug("https://gitlab.com/group/subgroup/project.git"),
            Some("group/subgroup/project".to_string())
        );
        assert_eq!(
            parse_gitlab_slug("https://github.com/varkart/contextbar"),
            None
        );
        // Self-hosted GitLab (custom domain) isn't matched — no fixed hostname to key off.
        assert_eq!(
            parse_gitlab_slug("https://gitlab.mycompany.com/group/project"),
            None
        );
    }

    #[test]
    fn parses_slug_for_a_custom_self_hosted_host() {
        assert_eq!(
            parse_slug_for_host("git@git.corp.internal:team/svc.git", "git.corp.internal"),
            Some("team/svc".to_string())
        );
        assert_eq!(
            parse_slug_for_host(
                "https://git.corp.internal/team/svc.git",
                "git.corp.internal"
            ),
            Some("team/svc".to_string())
        );
        // Doesn't match a different host.
        assert_eq!(
            parse_slug_for_host("https://github.com/team/svc", "git.corp.internal"),
            None
        );
    }

    #[test]
    fn cli_info_defaults_to_not_installed() {
        let info = GitCliInfo::default();
        assert!(!info.installed);
        assert!(!info.authenticated);
        assert_eq!(info.version, None);
        assert_eq!(info.account, None);

        let status = GitCliStatus::default();
        assert!(!status.gh.installed);
        assert!(!status.glab.installed);
    }
}

#[cfg(test)]
mod smoke {
    // Runs against the real home dir: `cargo test -- --ignored --nocapture worktrees::smoke`.
    #[test]
    #[ignore]
    fn real_list_worktrees_excludes_agent_isolation_dirs() {
        for r in super::list_worktrees() {
            println!("{} ({} worktrees):", r.repo_name, r.worktrees.len());
            for w in &r.worktrees {
                println!("  {}", w.path);
                assert!(
                    !w.path.contains("/.claude/worktrees/"),
                    "internal agent-isolation worktree leaked into the list: {}",
                    w.path
                );
            }
        }
    }

    #[test]
    #[ignore]
    fn real_detect_git_cli() {
        let status = super::detect_git_cli();
        println!("gh:   {:?}", status.gh);
        println!("glab: {:?}", status.glab);
    }
}
