use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::AppError;

pub struct DbState(pub Arc<Mutex<Connection>>);

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Notification {
    pub id: i64,
    pub ts_ms: i64,
    pub level: String,
    pub title: String,
    pub body: String,
}

pub fn open() -> DbState {
    match try_open() {
        Ok(state) => state,
        Err(e) => {
            eprintln!("[db] failed to open on-disk database: {e} — using in-memory fallback");
            let mut conn = Connection::open_in_memory().expect("in-memory SQLite must always open");
            let _ = migrate(&mut conn);
            DbState(Arc::new(Mutex::new(conn)))
        }
    }
}

fn try_open() -> Result<DbState, AppError> {
    let data_dir = dirs::data_dir()
        .ok_or_else(|| AppError::Other("cannot resolve data dir".into()))?
        .join("contextbar");
    std::fs::create_dir_all(&data_dir)?;

    let db_path = data_dir.join("contextbar.db");
    let mut conn = Connection::open(&db_path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    migrate(&mut conn)?;
    Ok(DbState(Arc::new(Mutex::new(conn))))
}

/// Exposed for unit tests in other modules that need an in-memory DB.
#[cfg(test)]
pub fn migrate_for_test(conn: &mut Connection) {
    migrate(conn).expect("test DB migration failed");
}

fn migrate(conn: &mut Connection) -> Result<(), AppError> {
    let version: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;

    if version < 1 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS audit_events (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                ts_ms      INTEGER NOT NULL,
                event_type TEXT    NOT NULL,
                agent_id    TEXT    NOT NULL,
                item_name  TEXT    NOT NULL,
                detail     TEXT
            );
            CREATE TABLE IF NOT EXISTS notifications (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                ts_ms     INTEGER NOT NULL,
                level     TEXT    NOT NULL,
                title     TEXT    NOT NULL,
                body      TEXT    NOT NULL,
                dismissed INTEGER NOT NULL DEFAULT 0
            );",
        )?;
        conn.pragma_update(None, "user_version", 1)?;
    }

    if version < 2 {
        conn.execute_batch("ALTER TABLE notifications ADD COLUMN dedup_key TEXT;")?;
        conn.pragma_update(None, "user_version", 2)?;
    }

    if version < 3 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS skill_cache (
                name            TEXT    PRIMARY KEY,
                content         TEXT    NOT NULL,
                content_hash    TEXT    NOT NULL,
                install_method  TEXT    NOT NULL,
                install_source  TEXT,
                cached_at       INTEGER NOT NULL,
                updated_at      INTEGER NOT NULL
            );",
        )?;
        conn.pragma_update(None, "user_version", 3)?;
    }

    if version < 4 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS mcp_cache (
                name        TEXT    PRIMARY KEY,
                command     TEXT,
                args        TEXT    NOT NULL DEFAULT '[]',
                url         TEXT,
                cached_at   INTEGER NOT NULL,
                updated_at  INTEGER NOT NULL
            );",
        )?;
        conn.pragma_update(None, "user_version", 4)?;
    }

    if version < 5 {
        conn.execute_batch("ALTER TABLE mcp_cache ADD COLUMN source_url TEXT;")?;
        conn.pragma_update(None, "user_version", 5)?;
    }

    if version < 6 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS session_stats (
                session_id     TEXT PRIMARY KEY,
                project        TEXT NOT NULL,
                project_name   TEXT NOT NULL,
                display        TEXT NOT NULL DEFAULT '',
                ts             INTEGER NOT NULL,
                model          TEXT NOT NULL DEFAULT '',
                input_tokens   INTEGER NOT NULL DEFAULT 0,
                output_tokens  INTEGER NOT NULL DEFAULT 0,
                cache_read     INTEGER NOT NULL DEFAULT 0,
                cache_creation INTEGER NOT NULL DEFAULT 0,
                msg_count      INTEGER NOT NULL DEFAULT 0,
                tool_calls     TEXT NOT NULL DEFAULT '{}',
                mtime          INTEGER NOT NULL DEFAULT 0,
                size           INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_session_stats_ts ON session_stats(ts);",
        )?;
        conn.pragma_update(None, "user_version", 6)?;
    }

    if version < 7 {
        // session_stats is a rebuildable cache — recreate to add skill_calls
        // so the next warm pass re-parses with skill extraction.
        conn.execute_batch(
            "DROP TABLE IF EXISTS session_stats;
            CREATE TABLE session_stats (
                session_id     TEXT PRIMARY KEY,
                project        TEXT NOT NULL,
                project_name   TEXT NOT NULL,
                display        TEXT NOT NULL DEFAULT '',
                ts             INTEGER NOT NULL,
                model          TEXT NOT NULL DEFAULT '',
                input_tokens   INTEGER NOT NULL DEFAULT 0,
                output_tokens  INTEGER NOT NULL DEFAULT 0,
                cache_read     INTEGER NOT NULL DEFAULT 0,
                cache_creation INTEGER NOT NULL DEFAULT 0,
                msg_count      INTEGER NOT NULL DEFAULT 0,
                tool_calls     TEXT NOT NULL DEFAULT '{}',
                skill_calls    TEXT NOT NULL DEFAULT '{}',
                mtime          INTEGER NOT NULL DEFAULT 0,
                size           INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_session_stats_ts ON session_stats(ts);",
        )?;
        conn.pragma_update(None, "user_version", 7)?;
    }

    if version < 8 {
        // Rebuildable cache — recreate to add the agent column.
        conn.execute_batch(
            "DROP TABLE IF EXISTS session_stats;
            CREATE TABLE session_stats (
                session_id     TEXT PRIMARY KEY,
                agent          TEXT NOT NULL DEFAULT 'claude',
                project        TEXT NOT NULL,
                project_name   TEXT NOT NULL,
                display        TEXT NOT NULL DEFAULT '',
                ts             INTEGER NOT NULL,
                model          TEXT NOT NULL DEFAULT '',
                input_tokens   INTEGER NOT NULL DEFAULT 0,
                output_tokens  INTEGER NOT NULL DEFAULT 0,
                cache_read     INTEGER NOT NULL DEFAULT 0,
                cache_creation INTEGER NOT NULL DEFAULT 0,
                msg_count      INTEGER NOT NULL DEFAULT 0,
                tool_calls     TEXT NOT NULL DEFAULT '{}',
                skill_calls    TEXT NOT NULL DEFAULT '{}',
                mtime          INTEGER NOT NULL DEFAULT 0,
                size           INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_session_stats_ts ON session_stats(ts);",
        )?;
        conn.pragma_update(None, "user_version", 8)?;
    }

    if version < 9 {
        // Full-text index over session transcripts. Content is rebuilt by the
        // stats warm pass, so the table can be dropped/recreated freely.
        conn.execute_batch(
            "CREATE VIRTUAL TABLE IF NOT EXISTS session_fts USING fts5(
                content,
                session_id UNINDEXED,
                agent UNINDEXED
            );",
        )?;
        conn.pragma_update(None, "user_version", 9)?;
    }

    if version < 10 {
        // User-authored session metadata (pins, tags). Unlike session_stats
        // this is NOT a rebuildable cache — never drop it in later migrations.
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS session_meta (
                session_id TEXT PRIMARY KEY,
                pinned     INTEGER NOT NULL DEFAULT 0,
                tags       TEXT    NOT NULL DEFAULT '[]',
                updated_at INTEGER NOT NULL DEFAULT 0
            );",
        )?;
        conn.pragma_update(None, "user_version", 10)?;
    }

    if version < 11 {
        // User-authored names for sessions and repos. Like session_meta,
        // NOT a rebuildable cache — never drop in later migrations.
        conn.execute_batch(
            "ALTER TABLE session_meta ADD COLUMN custom_name TEXT;
             CREATE TABLE IF NOT EXISTS repo_meta (
                 repo_path   TEXT PRIMARY KEY,
                 custom_name TEXT,
                 updated_at  INTEGER NOT NULL DEFAULT 0
             );",
        )?;
        conn.pragma_update(None, "user_version", 11)?;
    }

    if version < 12 {
        // Rebuildable cache — recreate to add the title column (session titles
        // parsed from ai-title / custom-title records). warm() repopulates.
        conn.execute_batch(
            "DROP TABLE IF EXISTS session_stats;
            CREATE TABLE session_stats (
                session_id     TEXT PRIMARY KEY,
                agent          TEXT NOT NULL DEFAULT 'claude',
                project        TEXT NOT NULL,
                project_name   TEXT NOT NULL,
                display        TEXT NOT NULL DEFAULT '',
                title          TEXT,
                ts             INTEGER NOT NULL,
                model          TEXT NOT NULL DEFAULT '',
                input_tokens   INTEGER NOT NULL DEFAULT 0,
                output_tokens  INTEGER NOT NULL DEFAULT 0,
                cache_read     INTEGER NOT NULL DEFAULT 0,
                cache_creation INTEGER NOT NULL DEFAULT 0,
                msg_count      INTEGER NOT NULL DEFAULT 0,
                tool_calls     TEXT NOT NULL DEFAULT '{}',
                skill_calls    TEXT NOT NULL DEFAULT '{}',
                mtime          INTEGER NOT NULL DEFAULT 0,
                size           INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_session_stats_ts ON session_stats(ts);",
        )?;
        conn.pragma_update(None, "user_version", 12)?;
    }

    if version < 13 {
        // Free-form user notes. Rows keyed by repo path OR worktree path —
        // repo_meta doubles as a generic per-path metadata store.
        conn.execute_batch("ALTER TABLE repo_meta ADD COLUMN notes TEXT;")?;
        conn.pragma_update(None, "user_version", 13)?;
    }

    Ok(())
}

/// session_id → title for every session with a parsed title.
pub fn get_session_titles(state: &DbState) -> std::collections::HashMap<String, String> {
    let Ok(conn) = state.0.lock() else {
        return Default::default();
    };
    let Ok(mut stmt) = conn.prepare(
        "SELECT session_id, title FROM session_stats WHERE title IS NOT NULL AND title != ''",
    ) else {
        return Default::default();
    };
    stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map(|rows| rows.flatten().collect())
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Session metadata (pins, tags)
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SessionMeta {
    pub session_id: String,
    pub pinned: bool,
    pub tags: Vec<String>,
    pub custom_name: Option<String>,
}

/// All rows that still carry meaning (pinned, tagged, or renamed).
pub fn get_all_session_meta(state: &DbState) -> Vec<SessionMeta> {
    let Ok(conn) = state.0.lock() else {
        return vec![];
    };
    let Ok(mut stmt) = conn.prepare(
        "SELECT session_id, pinned, tags, custom_name FROM session_meta
         WHERE pinned != 0 OR tags != '[]' OR custom_name IS NOT NULL",
    ) else {
        return vec![];
    };
    stmt.query_map([], |r| {
        let tags_json: String = r.get(2)?;
        Ok(SessionMeta {
            session_id: r.get(0)?,
            pinned: r.get::<_, i64>(1)? != 0,
            tags: serde_json::from_str(&tags_json).unwrap_or_default(),
            custom_name: r.get(3)?,
        })
    })
    .map(|rows| rows.flatten().collect())
    .unwrap_or_default()
}

pub fn set_session_pinned(state: &DbState, session_id: &str, pinned: bool) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::MutexPoisoned)?;
    conn.execute(
        "INSERT INTO session_meta (session_id, pinned, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(session_id) DO UPDATE SET
           pinned = excluded.pinned, updated_at = excluded.updated_at",
        rusqlite::params![session_id, pinned as i64, now_ms()],
    )?;
    Ok(())
}

pub fn set_session_tags(
    state: &DbState,
    session_id: &str,
    tags: &[String],
) -> Result<(), AppError> {
    // Normalize: trim, drop empties, dedupe (case-insensitive), keep order.
    let mut seen = std::collections::HashSet::new();
    let clean: Vec<String> = tags
        .iter()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty() && t.len() <= 40)
        .filter(|t| seen.insert(t.to_lowercase()))
        .take(20)
        .collect();
    let tags_json = serde_json::to_string(&clean).unwrap_or_else(|_| "[]".into());
    let conn = state.0.lock().map_err(|_| AppError::MutexPoisoned)?;
    conn.execute(
        "INSERT INTO session_meta (session_id, tags, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(session_id) DO UPDATE SET
           tags = excluded.tags, updated_at = excluded.updated_at",
        rusqlite::params![session_id, tags_json, now_ms()],
    )?;
    Ok(())
}

/// Set or clear (None / empty string) a user-chosen session name.
pub fn set_session_name(
    state: &DbState,
    session_id: &str,
    name: Option<&str>,
) -> Result<(), AppError> {
    let clean: Option<String> = name
        .map(|n| n.trim())
        .filter(|n| !n.is_empty())
        .map(|n| n.chars().take(80).collect());
    let conn = state.0.lock().map_err(|_| AppError::MutexPoisoned)?;
    conn.execute(
        "INSERT INTO session_meta (session_id, custom_name, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(session_id) DO UPDATE SET
           custom_name = excluded.custom_name, updated_at = excluded.updated_at",
        rusqlite::params![session_id, clean, now_ms()],
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Repo metadata (custom names)
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepoMeta {
    pub repo_path: String,
    pub custom_name: Option<String>,
    pub notes: Option<String>,
}

pub fn get_all_repo_meta(state: &DbState) -> Vec<RepoMeta> {
    let Ok(conn) = state.0.lock() else {
        return vec![];
    };
    let Ok(mut stmt) = conn.prepare(
        "SELECT repo_path, custom_name, notes FROM repo_meta
         WHERE custom_name IS NOT NULL OR notes IS NOT NULL",
    ) else {
        return vec![];
    };
    stmt.query_map([], |r| {
        Ok(RepoMeta {
            repo_path: r.get(0)?,
            custom_name: r.get(1)?,
            notes: r.get(2)?,
        })
    })
    .map(|rows| rows.flatten().collect())
    .unwrap_or_default()
}

/// Set or clear (None / empty) free-form notes for a repo or worktree path.
pub fn set_repo_notes(state: &DbState, path: &str, notes: Option<&str>) -> Result<(), AppError> {
    let clean: Option<String> = notes
        .map(|n| n.trim())
        .filter(|n| !n.is_empty())
        .map(|n| n.chars().take(2000).collect());
    let conn = state.0.lock().map_err(|_| AppError::MutexPoisoned)?;
    conn.execute(
        "INSERT INTO repo_meta (repo_path, notes, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(repo_path) DO UPDATE SET
           notes = excluded.notes, updated_at = excluded.updated_at",
        rusqlite::params![path, clean, now_ms()],
    )?;
    Ok(())
}

/// Set or clear (None / empty string) a user-chosen repo display name.
pub fn set_repo_name(state: &DbState, repo_path: &str, name: Option<&str>) -> Result<(), AppError> {
    let clean: Option<String> = name
        .map(|n| n.trim())
        .filter(|n| !n.is_empty())
        .map(|n| n.chars().take(80).collect());
    let conn = state.0.lock().map_err(|_| AppError::MutexPoisoned)?;
    conn.execute(
        "INSERT INTO repo_meta (repo_path, custom_name, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(repo_path) DO UPDATE SET
           custom_name = excluded.custom_name, updated_at = excluded.updated_at",
        rusqlite::params![repo_path, clean, now_ms()],
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Transcript full-text search
// ---------------------------------------------------------------------------

/// Replace the FTS row(s) for a session with fresh transcript text.
pub fn index_transcript(state: &DbState, session_id: &str, agent: &str, content: &str) {
    let Ok(conn) = state.0.lock() else { return };
    let _ = conn.execute(
        "DELETE FROM session_fts WHERE session_id = ?1",
        rusqlite::params![session_id],
    );
    let _ = conn.execute(
        "INSERT INTO session_fts (content, session_id, agent) VALUES (?1, ?2, ?3)",
        rusqlite::params![content, session_id, agent],
    );
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptMatch {
    pub session_id: String,
    pub agent: String,
    /// Extract around the match; hits wrapped in \u{1}…\u{2} marker bytes.
    pub snippet: String,
    // Session metadata joined from session_stats (defaults when absent).
    pub display: String,
    pub project: String,
    pub project_name: String,
    pub timestamp: u64,
    pub total_tokens: u64,
}

/// Escape user input into an FTS5 MATCH expression: every term quoted
/// (so operators like AND/OR/NEAR or stray quotes can't break the query),
/// last term treated as a prefix for search-as-you-type.
fn fts_match_expr(query: &str) -> Option<String> {
    let terms: Vec<&str> = query.split_whitespace().collect();
    if terms.is_empty() {
        return None;
    }
    let n = terms.len();
    let expr = terms
        .iter()
        .enumerate()
        .map(|(i, t)| {
            let escaped = t.replace('"', "\"\"");
            if i == n - 1 {
                format!("\"{escaped}\"*")
            } else {
                format!("\"{escaped}\"")
            }
        })
        .collect::<Vec<_>>()
        .join(" ");
    Some(expr)
}

pub fn search_transcripts(state: &DbState, query: &str, limit: usize) -> Vec<TranscriptMatch> {
    let Some(expr) = fts_match_expr(query) else {
        return vec![];
    };
    let Ok(conn) = state.0.lock() else {
        return vec![];
    };
    let Ok(mut stmt) = conn.prepare(
        "SELECT f.session_id, f.agent,
                snippet(session_fts, 0, char(1), char(2), '…', 16),
                COALESCE(s.display, ''), COALESCE(s.project, ''),
                COALESCE(s.project_name, ''), COALESCE(s.ts, 0),
                COALESCE(s.input_tokens + s.output_tokens, 0)
         FROM session_fts f
         LEFT JOIN session_stats s ON s.session_id = f.session_id
         WHERE session_fts MATCH ?1
         ORDER BY rank LIMIT ?2",
    ) else {
        return vec![];
    };
    stmt.query_map(rusqlite::params![expr, limit as i64], |r| {
        Ok(TranscriptMatch {
            session_id: r.get(0)?,
            agent: r.get(1)?,
            snippet: r.get(2)?,
            display: r.get(3)?,
            project: r.get(4)?,
            project_name: r.get(5)?,
            timestamp: r.get::<_, i64>(6)?.max(0) as u64,
            total_tokens: r.get::<_, i64>(7)?.max(0) as u64,
        })
    })
    .map(|rows| rows.flatten().collect())
    .unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Skill cache
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CachedSkill {
    pub name: String,
    pub content: String,
    pub content_hash: String,
    pub install_method: String,
    pub install_source: Option<String>,
    pub cached_at: i64,
    pub updated_at: i64,
}

/// Upsert a skill into the cache. `method` is one of: "url", "local", "template", "copy".
pub fn cache_skill(state: &DbState, name: &str, content: &str, method: &str, source: Option<&str>) {
    let hash = fnv1a_hex(content.as_bytes());
    let now = now_ms();
    let Ok(conn) = state.0.lock() else { return };
    let _ = conn.execute(
        "INSERT INTO skill_cache (name, content, content_hash, install_method, install_source, cached_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(name) DO UPDATE SET
           content        = excluded.content,
           content_hash   = excluded.content_hash,
           install_method = excluded.install_method,
           install_source = COALESCE(excluded.install_source, skill_cache.install_source),
           updated_at     = excluded.updated_at",
        rusqlite::params![name, content, hash, method, source, now],
    );
}

pub fn get_cached_skill(state: &DbState, name: &str) -> Option<CachedSkill> {
    let conn = state.0.lock().ok()?;
    conn.query_row(
        "SELECT name, content, content_hash, install_method, install_source, cached_at, updated_at
         FROM skill_cache WHERE name = ?1",
        rusqlite::params![name],
        |r| {
            Ok(CachedSkill {
                name: r.get(0)?,
                content: r.get(1)?,
                content_hash: r.get(2)?,
                install_method: r.get(3)?,
                install_source: r.get(4)?,
                cached_at: r.get(5)?,
                updated_at: r.get(6)?,
            })
        },
    )
    .ok()
}

pub fn is_skill_cached(state: &DbState, name: &str) -> bool {
    let Ok(conn) = state.0.lock() else {
        return false;
    };
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM skill_cache WHERE name = ?1)",
        rusqlite::params![name],
        |r| r.get::<_, bool>(0),
    )
    .unwrap_or(false)
}

// ---------------------------------------------------------------------------
// MCP cache
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CachedMcp {
    pub name: String,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub url: Option<String>,
    /// Validated source URL: GitHub repo, homepage, or npmjs.com fallback.
    pub source_url: Option<String>,
    pub cached_at: i64,
    pub updated_at: i64,
}

/// Upsert an MCP into the cache. Preserves existing entry if new values are empty.
pub fn cache_mcp(
    state: &DbState,
    name: &str,
    command: Option<&str>,
    args: &[String],
    url: Option<&str>,
) {
    let args_json = serde_json::to_string(args).unwrap_or_else(|_| "[]".to_string());
    let now = now_ms();
    let Ok(conn) = state.0.lock() else { return };
    let _ = conn.execute(
        "INSERT INTO mcp_cache (name, command, args, url, cached_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT(name) DO UPDATE SET
           command    = COALESCE(excluded.command,    mcp_cache.command),
           args       = CASE WHEN excluded.args != '[]' THEN excluded.args ELSE mcp_cache.args END,
           url        = COALESCE(excluded.url,        mcp_cache.url),
           updated_at = excluded.updated_at",
        rusqlite::params![name, command, args_json, url, now],
    );
}

/// Update only the source_url for an existing cache entry (called after async URL resolution).
pub fn update_mcp_source_url(state: &DbState, name: &str, source_url: &str) {
    let Ok(conn) = state.0.lock() else { return };
    let _ = conn.execute(
        "UPDATE mcp_cache SET source_url = ?1 WHERE name = ?2",
        rusqlite::params![source_url, name],
    );
}

pub fn get_cached_mcp(state: &DbState, name: &str) -> Option<CachedMcp> {
    let conn = state.0.lock().ok()?;
    conn.query_row(
        "SELECT name, command, args, url, source_url, cached_at, updated_at FROM mcp_cache WHERE name = ?1",
        rusqlite::params![name],
        |r| {
            let args_json: String = r.get(2)?;
            let args: Vec<String> = serde_json::from_str(&args_json).unwrap_or_default();
            Ok(CachedMcp {
                name: r.get(0)?,
                command: r.get(1)?,
                args,
                url: r.get(3)?,
                source_url: r.get(4)?,
                cached_at: r.get(5)?,
                updated_at: r.get(6)?,
            })
        },
    )
    .ok()
}

pub fn get_all_cached_mcps(state: &DbState) -> Vec<CachedMcp> {
    let Ok(conn) = state.0.lock() else {
        return vec![];
    };
    let Ok(mut stmt) = conn.prepare(
        "SELECT name, command, args, url, source_url, cached_at, updated_at FROM mcp_cache ORDER BY updated_at DESC",
    ) else { return vec![] };
    stmt.query_map([], |r| {
        let args_json: String = r.get(2)?;
        let args: Vec<String> = serde_json::from_str(&args_json).unwrap_or_default();
        Ok(CachedMcp {
            name: r.get(0)?,
            command: r.get(1)?,
            args,
            url: r.get(3)?,
            source_url: r.get(4)?,
            cached_at: r.get(5)?,
            updated_at: r.get(6)?,
        })
    })
    .map(|rows| rows.flatten().collect())
    .unwrap_or_default()
}

pub fn is_mcp_cached(state: &DbState, name: &str) -> bool {
    let Ok(conn) = state.0.lock() else {
        return false;
    };
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM mcp_cache WHERE name = ?1)",
        rusqlite::params![name],
        |r| r.get::<_, bool>(0),
    )
    .unwrap_or(false)
}

/// FNV-1a 32-bit hash, hex-encoded. Mirrors the Rust engine/skill.rs implementation.
fn fnv1a_hex(data: &[u8]) -> String {
    let mut hash: u32 = 2166136261;
    for &b in data {
        hash ^= b as u32;
        hash = hash.wrapping_mul(16777619);
    }
    format!("{hash:08x}")
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub fn log_event(
    state: &DbState,
    event_type: &str,
    agent_id: &str,
    item_name: &str,
    detail: Option<&str>,
) {
    let Ok(conn) = state.0.lock() else { return };
    let _ = conn.execute(
        "INSERT INTO audit_events (ts_ms, event_type, agent_id, item_name, detail)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![now_ms(), event_type, agent_id, item_name, detail],
    );
}

pub fn get_active_notifications(state: &DbState) -> Result<Vec<Notification>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::MutexPoisoned)?;
    let mut stmt = conn.prepare(
        "SELECT id, ts_ms, level, title, body FROM notifications
         WHERE dismissed = 0 ORDER BY ts_ms DESC LIMIT 100",
    )?;

    let rows: Result<Vec<_>, _> = stmt
        .query_map([], |row| {
            Ok(Notification {
                id: row.get(0)?,
                ts_ms: row.get(1)?,
                level: row.get(2)?,
                title: row.get(3)?,
                body: row.get(4)?,
            })
        })?
        .collect();
    Ok(rows?)
}

pub fn dismiss_notification(state: &DbState, id: i64) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::MutexPoisoned)?;
    conn.execute(
        "UPDATE notifications SET dismissed = 1 WHERE id = ?1",
        rusqlite::params![id],
    )?;
    Ok(())
}

pub fn dismiss_all_notifications(state: &DbState) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::MutexPoisoned)?;
    conn.execute(
        "UPDATE notifications SET dismissed = 1 WHERE dismissed = 0",
        [],
    )?;
    Ok(())
}

/// Insert a notification. Returns true if a new row was inserted, false if a
/// non-dismissed notification with the same dedup_key already exists.
pub fn add_notification(
    state: &DbState,
    level: &str,
    title: &str,
    body: &str,
    dedup_key: Option<&str>,
) -> Result<bool, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::MutexPoisoned)?;

    if let Some(key) = dedup_key {
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM notifications WHERE dedup_key = ?1 AND dismissed = 0)",
                rusqlite::params![key],
                |r| r.get(0),
            )
            .unwrap_or(false);
        if exists {
            return Ok(false);
        }
    }

    conn.execute(
        "INSERT INTO notifications (ts_ms, level, title, body, dedup_key)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![now_ms(), level, title, body, dedup_key],
    )?;
    Ok(true)
}

/// Return dedup_keys of all active (non-dismissed) notifications whose key
/// starts with the given prefix. Used by Doctor to find stale warnings.
pub fn active_keys_with_prefix(state: &DbState, prefix: &str) -> std::collections::HashSet<String> {
    let Ok(conn) = state.0.lock() else {
        return std::collections::HashSet::new();
    };
    let mut stmt = match conn
        .prepare("SELECT dedup_key FROM notifications WHERE dedup_key LIKE ?1 AND dismissed = 0")
    {
        Ok(s) => s,
        Err(_) => return std::collections::HashSet::new(),
    };
    let like_pat = format!("{prefix}%");
    stmt.query_map(rusqlite::params![like_pat], |r| r.get::<_, String>(0))
        .into_iter()
        .flatten()
        .filter_map(|r| r.ok())
        .collect()
}

pub fn dismiss_by_dedup_key(state: &DbState, key: &str) {
    let Ok(conn) = state.0.lock() else { return };
    let _ = conn.execute(
        "UPDATE notifications SET dismissed = 1 WHERE dedup_key = ?1 AND dismissed = 0",
        rusqlite::params![key],
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> DbState {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&mut conn).unwrap();
        DbState(Arc::new(Mutex::new(conn)))
    }

    // ── add_notification ──────────────────────────────────────────────────────

    #[test]
    fn add_notification_inserts_row() {
        let db = test_db();
        let inserted = add_notification(&db, "info", "Title", "Body", None).unwrap();
        assert!(inserted);
        let notifs = get_active_notifications(&db).unwrap();
        assert_eq!(notifs.len(), 1);
        assert_eq!(notifs[0].title, "Title");
        assert_eq!(notifs[0].level, "info");
    }

    #[test]
    fn add_notification_dedup_skips_existing_active() {
        let db = test_db();
        add_notification(&db, "warn", "T", "B", Some("key1")).unwrap();
        let inserted = add_notification(&db, "warn", "T", "B", Some("key1")).unwrap();
        assert!(!inserted, "duplicate active key should not insert");
        assert_eq!(get_active_notifications(&db).unwrap().len(), 1);
    }

    #[test]
    fn add_notification_dedup_allows_after_dismiss() {
        let db = test_db();
        add_notification(&db, "warn", "T", "B", Some("key1")).unwrap();
        let notifs = get_active_notifications(&db).unwrap();
        dismiss_notification(&db, notifs[0].id).unwrap();

        let inserted = add_notification(&db, "warn", "T2", "B2", Some("key1")).unwrap();
        assert!(inserted, "after dismiss, same key can be inserted again");
        let active = get_active_notifications(&db).unwrap();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].title, "T2");
    }

    #[test]
    fn add_notification_no_dedup_key_always_inserts() {
        let db = test_db();
        add_notification(&db, "info", "T", "B", None).unwrap();
        add_notification(&db, "info", "T", "B", None).unwrap();
        assert_eq!(get_active_notifications(&db).unwrap().len(), 2);
    }

    // ── get_active_notifications ──────────────────────────────────────────────

    #[test]
    fn get_active_excludes_dismissed() {
        let db = test_db();
        add_notification(&db, "info", "Keep", "B", None).unwrap();
        add_notification(&db, "warn", "Gone", "B", Some("k")).unwrap();
        let gone_id = get_active_notifications(&db)
            .unwrap()
            .iter()
            .find(|n| n.title == "Gone")
            .unwrap()
            .id;
        dismiss_notification(&db, gone_id).unwrap();

        let active = get_active_notifications(&db).unwrap();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].title, "Keep");
    }

    #[test]
    fn get_active_newest_first() {
        let db = test_db();
        add_notification(&db, "info", "First", "B", None).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        add_notification(&db, "info", "Second", "B", None).unwrap();

        let notifs = get_active_notifications(&db).unwrap();
        assert_eq!(notifs[0].title, "Second");
        assert_eq!(notifs[1].title, "First");
    }

    // ── dismiss_notification ──────────────────────────────────────────────────

    #[test]
    fn dismiss_notification_by_id() {
        let db = test_db();
        add_notification(&db, "info", "T", "B", None).unwrap();
        let id = get_active_notifications(&db).unwrap()[0].id;
        dismiss_notification(&db, id).unwrap();
        assert!(get_active_notifications(&db).unwrap().is_empty());
    }

    #[test]
    fn dismiss_notification_unknown_id_is_noop() {
        let db = test_db();
        assert!(dismiss_notification(&db, 999999).is_ok());
    }

    // ── dismiss_all_notifications ─────────────────────────────────────────────

    #[test]
    fn dismiss_all_clears_all_active() {
        let db = test_db();
        add_notification(&db, "info", "A", "B", None).unwrap();
        add_notification(&db, "warn", "C", "D", None).unwrap();
        dismiss_all_notifications(&db).unwrap();
        assert!(get_active_notifications(&db).unwrap().is_empty());
    }

    #[test]
    fn dismiss_all_on_empty_is_ok() {
        let db = test_db();
        assert!(dismiss_all_notifications(&db).is_ok());
    }

    // ── active_keys_with_prefix ───────────────────────────────────────────────

    #[test]
    fn active_keys_with_prefix_returns_matching() {
        let db = test_db();
        add_notification(&db, "warn", "T", "B", Some("doctor:mcp:claude:foo:missing")).unwrap();
        add_notification(&db, "info", "T", "B", Some("other:key")).unwrap();

        let keys = active_keys_with_prefix(&db, "doctor:");
        assert_eq!(keys.len(), 1);
        assert!(keys.contains("doctor:mcp:claude:foo:missing"));
    }

    #[test]
    fn active_keys_excludes_dismissed() {
        let db = test_db();
        add_notification(&db, "warn", "T", "B", Some("doctor:mcp:x:y:missing")).unwrap();
        let notifs = get_active_notifications(&db).unwrap();
        dismiss_notification(&db, notifs[0].id).unwrap();

        assert!(active_keys_with_prefix(&db, "doctor:").is_empty());
    }

    // ── dismiss_by_dedup_key ──────────────────────────────────────────────────

    #[test]
    fn dismiss_by_dedup_key_dismisses_target() {
        let db = test_db();
        add_notification(&db, "warn", "A", "B", Some("key-a")).unwrap();
        add_notification(&db, "warn", "C", "D", Some("key-c")).unwrap();
        dismiss_by_dedup_key(&db, "key-a");

        let active = get_active_notifications(&db).unwrap();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].title, "C");
    }

    #[test]
    fn dismiss_by_dedup_key_unknown_key_is_noop() {
        let db = test_db();
        add_notification(&db, "info", "T", "B", None).unwrap();
        dismiss_by_dedup_key(&db, "nonexistent-key");
        assert_eq!(get_active_notifications(&db).unwrap().len(), 1);
    }

    // ── log_event ─────────────────────────────────────────────────────────────

    #[test]
    fn log_event_inserts_audit_row() {
        let db = test_db();
        log_event(
            &db,
            "skill_toggled",
            "claude",
            "my-skill",
            Some(r#"{"active":true}"#),
        );

        let conn = db.0.lock().unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM audit_events WHERE event_type = 'skill_toggled'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn log_event_null_detail_allowed() {
        let db = test_db();
        log_event(&db, "mcp_toggled", "cursor", "my-mcp", None);

        let conn = db.0.lock().unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM audit_events", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    // ── session meta (pins, tags) ─────────────────────────────────────────────

    #[test]
    fn pin_then_unpin_roundtrip() {
        let db = test_db();
        set_session_pinned(&db, "s1", true).unwrap();
        let meta = get_all_session_meta(&db);
        assert_eq!(meta.len(), 1);
        assert!(meta[0].pinned);

        set_session_pinned(&db, "s1", false).unwrap();
        assert!(
            get_all_session_meta(&db).is_empty(),
            "unpinned+untagged rows drop out"
        );
    }

    #[test]
    fn tags_normalized_and_preserved_across_pin_updates() {
        let db = test_db();
        set_session_tags(
            &db,
            "s1",
            &["  rust ".into(), "".into(), "Rust".into(), "wip".into()],
        )
        .unwrap();
        set_session_pinned(&db, "s1", true).unwrap();

        let meta = get_all_session_meta(&db);
        assert_eq!(meta.len(), 1);
        assert!(meta[0].pinned);
        assert_eq!(
            meta[0].tags,
            vec!["rust", "wip"],
            "trimmed, deduped case-insensitively"
        );
    }

    #[test]
    fn clearing_tags_on_unpinned_session_removes_from_listing() {
        let db = test_db();
        set_session_tags(&db, "s1", &["a".into()]).unwrap();
        set_session_tags(&db, "s1", &[]).unwrap();
        assert!(get_all_session_meta(&db).is_empty());
    }

    // ── transcript FTS ────────────────────────────────────────────────────────

    #[test]
    fn fts_index_and_search_roundtrip() {
        let db = test_db();
        index_transcript(&db, "s1", "claude", "fix the auth middleware token expiry");
        index_transcript(&db, "s2", "codex", "refactor database connection pooling");

        let hits = search_transcripts(&db, "auth middleware", 10);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].session_id, "s1");
        assert_eq!(hits[0].agent, "claude");
        assert!(hits[0].snippet.contains('\u{1}'), "snippet marks matches");
    }

    #[test]
    fn fts_last_term_is_prefix_match() {
        let db = test_db();
        index_transcript(&db, "s1", "claude", "implement transcript search");
        let hits = search_transcripts(&db, "transcr", 10);
        assert_eq!(hits.len(), 1);
    }

    #[test]
    fn fts_reindex_replaces_old_content() {
        let db = test_db();
        index_transcript(&db, "s1", "claude", "old needle content");
        index_transcript(&db, "s1", "claude", "new content entirely");

        assert!(search_transcripts(&db, "needle", 10).is_empty());
        assert_eq!(search_transcripts(&db, "entirely", 10).len(), 1);
    }

    #[test]
    fn fts_operators_and_quotes_are_neutralized() {
        let db = test_db();
        index_transcript(&db, "s1", "claude", "plain text here");
        // None of these should error or panic
        assert!(search_transcripts(&db, "AND OR NOT", 10).is_empty());
        assert!(search_transcripts(&db, "\"unbalanced", 10).is_empty());
        assert!(search_transcripts(&db, "col:value", 10).is_empty());
        assert!(search_transcripts(&db, "   ", 10).is_empty());
    }

    // ── schema ────────────────────────────────────────────────────────────────

    #[test]
    fn schema_has_dedup_key_column() {
        let db = test_db();
        // If dedup_key column is missing this insert would fail
        let conn = db.0.lock().unwrap();
        conn.execute(
            "INSERT INTO notifications (ts_ms, level, title, body, dedup_key) VALUES (1, 'info', 'T', 'B', 'k')",
            [],
        ).expect("dedup_key column should exist after migration");
    }
}
