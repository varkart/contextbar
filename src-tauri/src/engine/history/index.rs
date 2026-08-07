use super::types::{HistoryStats, SessionEntry};
use serde::Deserialize;
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HistoryLine {
    display: Option<String>,
    timestamp: Option<u64>,
    project: Option<String>,
    session_id: Option<String>,
}

pub fn history_dir(home: &Path) -> PathBuf {
    home.join(".claude")
}

pub fn history_jsonl_path(home: &Path) -> PathBuf {
    history_dir(home).join("history.jsonl")
}

pub fn session_file_path(home: &Path, project: &str, session_id: &str) -> PathBuf {
    let encoded = encode_project_path(project);
    history_dir(home)
        .join("projects")
        .join(encoded)
        .join(format!("{session_id}.jsonl"))
}

/// Mirrors Claude Code's own `~/.claude/projects/<encoded>/` directory
/// naming. Confirmed against a real path containing a dot in the username
/// (`/Users/jane.doe/dev/projects/app` → `-Users-jane-doe-dev-projects-app`):
/// Claude Code replaces every non-alphanumeric character, not just `/` —
/// our previous slash-only replacement left dots (and presumably spaces,
/// underscores, parens, etc.) intact, silently 404ing the reconstructed
/// path for any project under a dotted username even though the project
/// lookup itself (via history.jsonl) succeeded.
pub fn encode_project_path(project: &str) -> String {
    project
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

/// Resolves a session's transcript file, verifying it actually exists
/// rather than trusting the formula-based path blindly. Session IDs are
/// effectively globally unique, so when the fast encoded-path guess misses
/// (a future Claude Code encoding change we haven't seen, an edge case in
/// `encode_project_path`, whatever) this falls back to scanning every
/// project directory for a file named exactly `{session_id}.jsonl` — no
/// encoding knowledge required at all. This is what turned the dotted-
/// username bug into a hard "session not found" instead of a slow-path
/// fallback: `session_file_path`'s output was trusted unconditionally with
/// no verification and no fallback.
pub fn resolve_session_file(home: &Path, project: &str, session_id: &str) -> Option<PathBuf> {
    let fast_path = session_file_path(home, project, session_id);
    if fast_path.is_file() {
        return Some(fast_path);
    }

    let projects_dir = history_dir(home).join("projects");
    let entries = std::fs::read_dir(&projects_dir).ok()?;
    for entry in entries.flatten() {
        let candidate = entry.path().join(format!("{session_id}.jsonl"));
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

pub fn project_name(project: &str) -> String {
    project
        .trim_end_matches('/')
        .split('/')
        .next_back()
        .filter(|s| !s.is_empty())
        .unwrap_or(project)
        .to_string()
}

fn is_file_live(path: &Path) -> bool {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    path.metadata()
        .and_then(|m| m.modified())
        .and_then(|mtime| {
            mtime
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(std::io::Error::other)
        })
        // 5 min window: a session is "live" while its file keeps changing.
        // Claude pauses between turns (user reading/typing), so a tight 60s
        // threshold flagged genuinely open sessions as finished.
        .map(|mtime| now.saturating_sub(mtime.as_secs()) < 300)
        .unwrap_or(false)
}

pub fn list_sessions(
    home: &Path,
    limit: usize,
    offset: usize,
    project_filter: Option<&str>,
    search: Option<&str>,
) -> Vec<SessionEntry> {
    let path = history_jsonl_path(home);
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let search_lower = search.map(|s| s.to_lowercase());

    // history.jsonl holds one line per submitted prompt, not per session —
    // group by sessionId: display = first prompt, timestamp = last activity.
    let mut sessions: std::collections::HashMap<String, SessionEntry> =
        std::collections::HashMap::new();
    // First-prompt timestamp per session, for an estimated duration (last - first).
    let mut first_ts: std::collections::HashMap<String, u64> = std::collections::HashMap::new();
    // A search matches a session if ANY of its prompts matches.
    let mut search_matched: std::collections::HashSet<String> = std::collections::HashSet::new();

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(h) = serde_json::from_str::<HistoryLine>(line) else {
            continue;
        };
        let Some(session_id) = h.session_id.filter(|s| !s.is_empty()) else {
            continue;
        };
        let timestamp = h.timestamp.unwrap_or(0);
        let project = h.project.unwrap_or_default();
        let display = h.display.unwrap_or_else(|| "(no prompt)".to_string());

        if let Some(filter) = project_filter {
            if !project.contains(filter) {
                continue;
            }
        }

        if let Some(ref q) = search_lower {
            if display.to_lowercase().contains(q.as_str()) {
                search_matched.insert(session_id.clone());
            }
        }

        match sessions.get_mut(&session_id) {
            Some(entry) => {
                // Lines are appended chronologically, so the first line seen is
                // the session's opening prompt; later lines only bump activity.
                entry.timestamp = entry.timestamp.max(timestamp);
                entry.prompt_count += 1;
            }
            None => {
                first_ts.insert(session_id.clone(), timestamp);
                let project_name = project_name(&project);
                let is_live = resolve_session_file(home, &project, &session_id)
                    .is_some_and(|f| is_file_live(&f));
                sessions.insert(
                    session_id.clone(),
                    SessionEntry {
                        agent: "claude".to_string(),
                        session_id,
                        display,
                        timestamp,
                        project,
                        project_name,
                        total_tokens: 0,
                        model: None,
                        duration_minutes: None,
                        is_live,
                        error_count: 0,
                        prompt_count: 1,
                        title: None,
                    },
                );
            }
        }
    }

    for entry in sessions.values_mut() {
        if let Some(&first) = first_ts.get(&entry.session_id) {
            entry.duration_minutes =
                crate::engine::sessions::session_duration_minutes(first, entry.timestamp);
        }
    }

    let mut entries: Vec<SessionEntry> = if search_lower.is_some() {
        sessions
            .into_values()
            .filter(|e| search_matched.contains(&e.session_id))
            .collect()
    } else {
        sessions.into_values().collect()
    };

    // Newest first
    entries.sort_by_key(|e| std::cmp::Reverse(e.timestamp));

    entries.into_iter().skip(offset).take(limit).collect()
}

pub fn find_session_project(home: &Path, session_id: &str) -> Result<(String, u64), String> {
    let path = history_jsonl_path(home);
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("cannot read history.jsonl: {e}"))?;

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(h) = serde_json::from_str::<HistoryLine>(line) {
            if h.session_id.as_deref() == Some(session_id) {
                return Ok((h.project.unwrap_or_default(), h.timestamp.unwrap_or(0)));
            }
        }
    }

    // Fall back: scan projects dir to find session file
    let projects_dir = history_dir(home).join("projects");
    if let Ok(entries) = std::fs::read_dir(&projects_dir) {
        for entry in entries.flatten() {
            let session_file = entry.path().join(format!("{session_id}.jsonl"));
            if session_file.exists() {
                let project = decode_project_path(&entry.file_name().to_string_lossy());
                return Ok((project, 0));
            }
        }
    }

    Err(format!("session {session_id} not found"))
}

pub fn list_session_projects(home: &Path) -> Vec<String> {
    let path = history_jsonl_path(home);
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let mut seen = std::collections::HashSet::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(h) = serde_json::from_str::<HistoryLine>(line) {
            if let Some(p) = h.project.filter(|p| !p.is_empty()) {
                seen.insert(p);
            }
        }
    }

    let mut projects: Vec<String> = seen.into_iter().collect();
    projects.sort();
    projects
}

pub fn get_history_stats(home: &Path) -> HistoryStats {
    let path = history_jsonl_path(home);
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => {
            return HistoryStats {
                total_sessions: 0,
                total_tokens: 0,
                live_session_id: None,
            }
        }
    };

    let mut total = 0usize;
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut live_session_id: Option<String> = None;

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(h) = serde_json::from_str::<HistoryLine>(line) {
            if let Some(sid) = h.session_id.filter(|s| !s.is_empty()) {
                if seen.insert(sid.clone()) {
                    total += 1;
                }
                if live_session_id.is_none() {
                    if let Some(ref project) = h.project {
                        if resolve_session_file(home, project, &sid)
                            .is_some_and(|f| is_file_live(&f))
                        {
                            live_session_id = Some(sid);
                        }
                    }
                }
            }
        }
    }

    HistoryStats {
        total_sessions: total,
        total_tokens: 0,
        live_session_id,
    }
}

fn decode_project_path(encoded: &str) -> String {
    // "-Users-foo-bar" → "/Users/foo/bar"
    if let Some(stripped) = encoded.strip_prefix('-') {
        format!("/{}", stripped.replace('-', "/"))
    } else {
        encoded.replace('-', "/")
    }
}

#[cfg(test)]
mod tests {
    use super::{
        encode_project_path, find_session_project, get_history_stats, list_sessions,
        resolve_session_file,
    };

    #[test]
    fn resolve_session_file_falls_back_to_scan_when_fast_path_is_wrong() {
        // Simulates a future encoding drift we haven't seen yet: the fast
        // formula-based path is simply wrong for this project, but the file
        // still exists somewhere under projects/ — the scan fallback must
        // find it anyway, since it needs no encoding knowledge at all.
        let dir = tempfile::tempdir().unwrap();
        let claude = dir.path().join(".claude");
        let some_other_dir = claude.join("projects").join("totally-unguessable-dir-name");
        std::fs::create_dir_all(&some_other_dir).unwrap();
        std::fs::write(some_other_dir.join("sess-1.jsonl"), "content").unwrap();

        let found = resolve_session_file(dir.path(), "/Users/whatever/proj", "sess-1");
        assert_eq!(found, Some(some_other_dir.join("sess-1.jsonl")));
    }

    #[test]
    fn resolve_session_file_prefers_fast_path_when_correct() {
        let dir = tempfile::tempdir().unwrap();
        let claude = dir.path().join(".claude");
        let project = "/Users/jane/proj";
        let fast_dir = claude.join("projects").join(encode_project_path(project));
        std::fs::create_dir_all(&fast_dir).unwrap();
        std::fs::write(fast_dir.join("sess-1.jsonl"), "content").unwrap();

        let found = resolve_session_file(dir.path(), project, "sess-1");
        assert_eq!(found, Some(fast_dir.join("sess-1.jsonl")));
    }

    #[test]
    fn resolve_session_file_none_when_truly_missing() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".claude").join("projects")).unwrap();
        assert_eq!(
            resolve_session_file(dir.path(), "/x/y", "sess-missing"),
            None
        );
    }

    #[test]
    fn encodes_dots_and_other_non_alphanumeric_chars() {
        // Real case: a dotted macOS username broke session lookup because
        // the old slash-only replacement left the dot intact while Claude
        // Code's actual directory name has it replaced too.
        assert_eq!(
            encode_project_path("/Users/jane.doe/dev/projects/app"),
            "-Users-jane-doe-dev-projects-app"
        );
        assert_eq!(
            encode_project_path("/Users/jane doe/proj (2)"),
            "-Users-jane-doe-proj--2-"
        );
    }

    #[test]
    fn resolves_and_reads_session_for_dotted_username_project() {
        // Regression for the real bug: history.jsonl's *primary* lookup path
        // (project string comes straight from the log line, no filesystem
        // check) succeeds regardless of encoding. It's the downstream file
        // read via session_file_path/encode_project_path that used to 404
        // for any project path with a dot (or other non-alphanumeric char)
        // in it — dotted usernames being the common case.
        let dir = tempfile::tempdir().unwrap();
        let claude = dir.path().join(".claude");
        std::fs::create_dir_all(&claude).unwrap();
        let project = "/Users/jane.doe/dev/projects/app";
        std::fs::write(
            claude.join("history.jsonl"),
            format!(
                r#"{{"display":"hi","timestamp":1000,"project":"{project}","sessionId":"sess-1"}}"#
            ),
        )
        .unwrap();

        let (resolved_project, _) = find_session_project(dir.path(), "sess-1").unwrap();
        assert_eq!(resolved_project, project);

        // The real session file lives under the *actual* Claude Code
        // encoding (every non-alphanumeric char replaced, not just '/').
        let real_encoded_dir = claude.join("projects").join(encode_project_path(project));
        std::fs::create_dir_all(&real_encoded_dir).unwrap();
        std::fs::write(real_encoded_dir.join("sess-1.jsonl"), "").unwrap();

        let detail =
            super::super::parser::get_session(dir.path(), "sess-1", &resolved_project, 1000);
        assert!(
            detail.is_some(),
            "session file should be found via the corrected encoding"
        );
    }

    fn write_history(lines: &[&str]) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let claude = dir.path().join(".claude");
        std::fs::create_dir_all(&claude).unwrap();
        std::fs::write(claude.join("history.jsonl"), lines.join("\n")).unwrap();
        dir
    }

    #[test]
    fn groups_prompts_into_one_session() {
        let dir = write_history(&[
            r#"{"display":"first prompt","timestamp":1000,"project":"/p/a","sessionId":"s1"}"#,
            r#"{"display":"second prompt","timestamp":2000,"project":"/p/a","sessionId":"s1"}"#,
            r#"{"display":"other session","timestamp":1500,"project":"/p/b","sessionId":"s2"}"#,
        ]);
        let entries = list_sessions(dir.path(), 100, 0, None, None);
        assert_eq!(entries.len(), 2);
        // Newest activity first: s1 last prompt at 2000
        assert_eq!(entries[0].session_id, "s1");
        assert_eq!(entries[0].display, "first prompt");
        assert_eq!(entries[0].timestamp, 2000);
        assert_eq!(entries[0].prompt_count, 2);
        assert_eq!(entries[1].session_id, "s2");
        assert_eq!(entries[1].prompt_count, 1);
    }

    #[test]
    fn search_matches_any_prompt_in_session() {
        let dir = write_history(&[
            r#"{"display":"first prompt","timestamp":1000,"project":"/p/a","sessionId":"s1"}"#,
            r#"{"display":"needle here","timestamp":2000,"project":"/p/a","sessionId":"s1"}"#,
            r#"{"display":"other","timestamp":1500,"project":"/p/b","sessionId":"s2"}"#,
        ]);
        let entries = list_sessions(dir.path(), 100, 0, None, Some("needle"));
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].session_id, "s1");
        // Display stays the session's first prompt, not the matching one
        assert_eq!(entries[0].display, "first prompt");
    }

    #[test]
    fn stats_count_unique_sessions() {
        let dir = write_history(&[
            r#"{"display":"a","timestamp":1000,"project":"/p/a","sessionId":"s1"}"#,
            r#"{"display":"b","timestamp":2000,"project":"/p/a","sessionId":"s1"}"#,
            r#"{"display":"c","timestamp":1500,"project":"/p/b","sessionId":"s2"}"#,
        ]);
        let stats = get_history_stats(dir.path());
        assert_eq!(stats.total_sessions, 2);
    }
}
