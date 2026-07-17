mod index;
mod parser;
pub mod stats;
pub mod types;

pub use types::{HistoryStats, SessionDetail, SessionEntry};

/// Path of the JSONL transcript backing a Claude session.
pub fn session_file(home: &std::path::Path, project: &str, session_id: &str) -> std::path::PathBuf {
    index::session_file_path(home, project, session_id)
}

pub fn list_sessions(
    limit: usize,
    offset: usize,
    project_filter: Option<String>,
    search: Option<String>,
) -> Vec<SessionEntry> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return vec![],
    };
    index::list_sessions(
        &home,
        limit,
        offset,
        project_filter.as_deref(),
        search.as_deref(),
    )
}

pub fn get_session(session_id: &str) -> Result<SessionDetail, String> {
    let home = dirs::home_dir().ok_or("cannot find home dir")?;
    let (project, timestamp) = index::find_session_project(&home, session_id)?;
    parser::get_session(&home, session_id, &project, timestamp)
        .ok_or_else(|| format!("session file not found for {session_id}"))
}

pub fn list_session_projects() -> Vec<String> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return vec![],
    };
    index::list_session_projects(&home)
}

pub fn get_history_stats() -> HistoryStats {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => {
            return HistoryStats {
                total_sessions: 0,
                total_tokens: 0,
                live_session_id: None,
            }
        }
    };
    index::get_history_stats(&home)
}
