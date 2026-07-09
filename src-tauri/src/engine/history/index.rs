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
        .last()
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
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
        })
        .map(|mtime| now.saturating_sub(mtime.as_secs()) < 60)
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

    let mut entries: Vec<SessionEntry> = content
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }
            let h: HistoryLine = serde_json::from_str(line).ok()?;
            let session_id = h.session_id.filter(|s| !s.is_empty())?;
            let timestamp = h.timestamp.unwrap_or(0);
            let project = h.project.unwrap_or_default();
            let display = h.display.unwrap_or_else(|| "(no prompt)".to_string());

            if let Some(filter) = project_filter {
                if !project.contains(filter) {
                    return None;
                }
            }

            if let Some(ref q) = search_lower {
                if !display.to_lowercase().contains(q.as_str()) {
                    return None;
                }
            }

            let project_name = project_name(&project);
            let session_file = session_file_path(home, &project, &session_id);
            let is_live = is_file_live(&session_file);

            Some(SessionEntry {
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
            })
        })
        .collect();

    // Newest first
    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    entries.into_iter().skip(offset).take(limit).collect()
}

pub fn find_session_project(home: &Path, session_id: &str) -> Result<(String, u64), String> {
    let path = history_jsonl_path(home);
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("cannot read history.jsonl: {e}"))?;

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
    let mut live_session_id: Option<String> = None;

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(h) = serde_json::from_str::<HistoryLine>(line) {
            if let Some(sid) = h.session_id.filter(|s| !s.is_empty()) {
                total += 1;
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
    if encoded.starts_with('-') {
        format!("/{}", &encoded[1..].replace('-', "/"))
    } else {
        encoded.replace('-', "/")
    }
}
