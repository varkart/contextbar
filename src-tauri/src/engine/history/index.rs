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

pub fn encode_project_path(project: &str) -> String {
    project.replace('/', "-")
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
                let project_name = project_name(&project);
                let session_file = session_file_path(home, &project, &session_id);
                let is_live = is_file_live(&session_file);
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
                        let session_file = session_file_path(home, project, &sid);
                        if is_file_live(&session_file) {
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
    use super::{get_history_stats, list_sessions};

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
