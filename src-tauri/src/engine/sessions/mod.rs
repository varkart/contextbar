//! Multi-agent session sources. Each supported agent (Claude Code, Codex
//! CLI, Gemini CLI) implements `SessionSource`; the aggregator merges their
//! sessions into one newest-first stream for the UI.

use super::history::{self, SessionDetail, SessionEntry};

pub trait SessionSource: Sync {
    fn agent_id(&self) -> &'static str;
    /// Newest-first entries, at most `limit`.
    fn list(&self, limit: usize) -> Vec<SessionEntry>;
    fn get(&self, session_id: &str) -> Option<SessionDetail>;
    /// Shell command that resumes work in `project` (id optional).
    fn resume_command(&self, session_id: Option<&str>) -> String;
}

struct ClaudeSource;

impl SessionSource for ClaudeSource {
    fn agent_id(&self) -> &'static str {
        "claude"
    }
    fn list(&self, limit: usize) -> Vec<SessionEntry> {
        history::list_sessions(limit, 0, None, None)
    }
    fn get(&self, session_id: &str) -> Option<SessionDetail> {
        history::get_session(session_id).ok()
    }
    fn resume_command(&self, session_id: Option<&str>) -> String {
        match session_id {
            Some(id) => format!("claude --resume {id}"),
            None => "claude".to_string(),
        }
    }
}

pub fn sources() -> Vec<&'static dyn SessionSource> {
    vec![&ClaudeSource]
}

pub fn source_for(agent: &str) -> Option<&'static dyn SessionSource> {
    sources().into_iter().find(|s| s.agent_id() == agent)
}

/// Merge all sources newest-first. `project_filter`/`search` are simple
/// contains-filters (the frontend does its own richer client-side filtering).
pub fn list_all(
    limit: usize,
    offset: usize,
    project_filter: Option<&str>,
    search: Option<&str>,
) -> Vec<SessionEntry> {
    let per_source = limit + offset;
    let search_lower = search.map(|s| s.to_lowercase());
    let mut all: Vec<SessionEntry> = sources()
        .into_iter()
        .flat_map(|s| s.list(per_source))
        .filter(|e| {
            if let Some(f) = project_filter {
                if !e.project.contains(f) {
                    return false;
                }
            }
            if let Some(q) = &search_lower {
                if !e.display.to_lowercase().contains(q.as_str()) {
                    return false;
                }
            }
            true
        })
        .collect();
    all.sort_by_key(|e| std::cmp::Reverse(e.timestamp));
    all.into_iter().skip(offset).take(limit).collect()
}

/// Fetch a session, trying the hinted agent's source first, then the rest.
pub fn get_any(agent: Option<&str>, session_id: &str) -> Result<SessionDetail, String> {
    if let Some(a) = agent {
        if let Some(src) = source_for(a) {
            if let Some(d) = src.get(session_id) {
                return Ok(d);
            }
        }
    }
    for src in sources() {
        if agent == Some(src.agent_id()) {
            continue; // already tried
        }
        if let Some(d) = src.get(session_id) {
            return Ok(d);
        }
    }
    Err(format!("session {session_id} not found in any source"))
}

// ── shared helpers for sources ────────────────────────────────────────────────

/// Parse an RFC3339 UTC timestamp ("2026-06-11T21:39:19.749Z") to unix ms.
/// Tolerant: returns None on anything malformed. No chrono dependency.
pub(crate) fn rfc3339_to_ms(ts: &str) -> Option<u64> {
    let b = ts.as_bytes();
    if b.len() < 19 {
        return None;
    }
    let num = |s: &str| s.parse::<i64>().ok();
    let year = num(ts.get(0..4)?)?;
    let month = num(ts.get(5..7)?)?;
    let day = num(ts.get(8..10)?)?;
    let hour = num(ts.get(11..13)?)?;
    let min = num(ts.get(14..16)?)?;
    let sec = num(ts.get(17..19)?)?;
    // Optional fractional seconds
    let mut millis = 0i64;
    if ts.get(19..20) == Some(".") {
        let frac: String = ts[20..]
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect();
        if !frac.is_empty() {
            let scaled = format!("{:0<3}", &frac[..frac.len().min(3)]);
            millis = scaled.parse().unwrap_or(0);
        }
    }
    // days_from_civil (Howard Hinnant)
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    let secs = days * 86400 + hour * 3600 + min * 60 + sec;
    u64::try_from(secs * 1000 + millis).ok()
}

/// True when the file was modified in the last 5 minutes (shared "live" rule).
pub(crate) fn is_recently_modified(path: &std::path::Path) -> bool {
    path.metadata()
        .and_then(|m| m.modified())
        .ok()
        .and_then(|m| std::time::SystemTime::now().duration_since(m).ok())
        .map(|age| age.as_secs() < 300)
        .unwrap_or(false)
}

pub(crate) fn file_mtime_ms(path: &std::path::Path) -> Option<u64> {
    path.metadata()
        .and_then(|m| m.modified())
        .ok()
        .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
}

#[cfg(test)]
mod tests {
    use super::rfc3339_to_ms;

    #[test]
    fn parses_rfc3339_timestamps() {
        // 2026-06-11T21:39:19.749Z
        let ms = rfc3339_to_ms("2026-06-11T21:39:19.749Z").unwrap();
        assert_eq!(ms % 1000, 749);
        // Epoch sanity: 2020-01-01T00:00:00Z = 1577836800
        assert_eq!(
            rfc3339_to_ms("2020-01-01T00:00:00Z").unwrap(),
            1_577_836_800_000
        );
        assert!(rfc3339_to_ms("garbage").is_none());
    }
}
