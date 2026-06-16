use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

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
            let mut conn =
                Connection::open_in_memory().expect("in-memory SQLite must always open");
            let _ = migrate(&mut conn);
            DbState(Arc::new(Mutex::new(conn)))
        }
    }
}

fn try_open() -> Result<DbState, String> {
    let data_dir = dirs::data_dir()
        .ok_or("cannot resolve data dir")?
        .join("llmmanager");
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    let db_path = data_dir.join("llmmanager.db");
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    migrate(&mut conn)?;
    Ok(DbState(Arc::new(Mutex::new(conn))))
}

fn migrate(conn: &mut Connection) -> Result<(), String> {
    let version: i32 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    if version < 1 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS audit_events (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                ts_ms      INTEGER NOT NULL,
                event_type TEXT    NOT NULL,
                tool_id    TEXT    NOT NULL,
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
        )
        .map_err(|e| e.to_string())?;
        conn.pragma_update(None, "user_version", 1)
            .map_err(|e| e.to_string())?;
    }

    if version < 2 {
        conn.execute_batch(
            "ALTER TABLE notifications ADD COLUMN dedup_key TEXT;",
        )
        .map_err(|e| e.to_string())?;
        conn.pragma_update(None, "user_version", 2)
            .map_err(|e| e.to_string())?;
    }

    Ok(())
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
    tool_id: &str,
    item_name: &str,
    detail: Option<&str>,
) {
    let Ok(conn) = state.0.lock() else { return };
    let _ = conn.execute(
        "INSERT INTO audit_events (ts_ms, event_type, tool_id, item_name, detail)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![now_ms(), event_type, tool_id, item_name, detail],
    );
}

pub fn get_active_notifications(state: &DbState) -> Result<Vec<Notification>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, ts_ms, level, title, body FROM notifications
             WHERE dismissed = 0 ORDER BY ts_ms DESC LIMIT 100",
        )
        .map_err(|e| e.to_string())?;

    let mapped = stmt
        .query_map([], |row| {
            Ok(Notification {
                id: row.get(0)?,
                ts_ms: row.get(1)?,
                level: row.get(2)?,
                title: row.get(3)?,
                body: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let rows: Result<Vec<_>, _> = mapped.collect();
    rows.map_err(|e| e.to_string())
}

pub fn dismiss_notification(state: &DbState, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE notifications SET dismissed = 1 WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn dismiss_all_notifications(state: &DbState) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE notifications SET dismissed = 1 WHERE dismissed = 0", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn count_active_notifications(state: &DbState) -> i64 {
    let Ok(conn) = state.0.lock() else { return 0 };
    conn.query_row(
        "SELECT COUNT(*) FROM notifications WHERE dismissed = 0",
        [],
        |r| r.get(0),
    )
    .unwrap_or(0)
}

/// Insert a notification. Returns true if a new row was inserted, false if a
/// non-dismissed notification with the same dedup_key already exists.
pub fn add_notification(
    state: &DbState,
    level: &str,
    title: &str,
    body: &str,
    dedup_key: Option<&str>,
) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

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
    )
    .map_err(|e| e.to_string())?;
    Ok(true)
}

/// Return dedup_keys of all active (non-dismissed) notifications whose key
/// starts with the given prefix. Used by Doctor to find stale warnings.
pub fn active_keys_with_prefix(state: &DbState, prefix: &str) -> std::collections::HashSet<String> {
    let Ok(conn) = state.0.lock() else {
        return std::collections::HashSet::new();
    };
    let mut stmt = match conn.prepare(
        "SELECT dedup_key FROM notifications WHERE dedup_key LIKE ?1 AND dismissed = 0",
    ) {
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
