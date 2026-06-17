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
        .join("llmmanager");
    std::fs::create_dir_all(&data_dir)?;

    let db_path = data_dir.join("llmmanager.db");
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
        )?;
        conn.pragma_update(None, "user_version", 1)?;
    }

    if version < 2 {
        conn.execute_batch("ALTER TABLE notifications ADD COLUMN dedup_key TEXT;")?;
        conn.pragma_update(None, "user_version", 2)?;
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

#[allow(dead_code)]
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
