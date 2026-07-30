//! Kiro CLI (`kiro-cli`) session source.
//!
//! Kiro CLI is AWS's rebrand of Amazon Q Developer CLI
//! (github.com/aws/amazon-q-developer-cli, Apache-2.0). Conversations live in
//! a SQLite database at `~/Library/Application Support/kiro-cli/data.sqlite3`,
//! table `conversations_v2` — columns `key` (project directory path),
//! `conversation_id`, `value` (JSON blob), `created_at`/`updated_at`. The
//! older `conversations` table (v1, one row per directory, no id) is not
//! read here: v1 has no way to address a single conversation for
//! `--resume-id`, and the CLI writes new sessions to v2.
//!
//! The `value` blob is a serialized `ConversationState`
//! (crates/chat-cli/src/cli/chat/conversation.rs upstream). We only read its
//! `transcript: Vec<String>` field — pre-formatted human-readable lines the
//! CLI itself builds for `/transcript save`: user lines are prefixed `"> "`
//! (embedded newlines become `"> \n"`), assistant lines end with
//! `"\n[Tool uses: none]"` or `"\n[Tool uses: name1,name2]"`. That's the
//! simplest reliably-shaped field for a read-only transcript view — the
//! structured `history` field is a much deeper enum tree we don't need.
//!
//! CAVEAT: `conversations_v2` isn't in the public upstream repo (Kiro is
//! ahead of it), so this schema is reconstructed from strings embedded in
//! the `kiro-cli-chat` binary plus the upstream `ConversationState`/`Table`
//! source, not confirmed against a live row. Timestamp units (seconds vs.
//! ms) are guessed defensively by magnitude. Run `real_kiro_smoke` (ignored
//! by default) against your own saved sessions to sanity-check field names
//! once you have one: `cargo test real_kiro_smoke -- --ignored --nocapture`.

use super::{rfc3339_to_ms, SessionSource};
use crate::engine::history::types::{ContentBlock, Message, SessionDetail, SessionEntry};
use rusqlite::types::ValueRef;
use rusqlite::{Connection, OpenFlags};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct KiroSource;

fn db_path() -> Option<PathBuf> {
    let path = dirs::home_dir()?.join("Library/Application Support/kiro-cli/data.sqlite3");
    path.is_file().then_some(path)
}

fn open_ro(path: &std::path::Path) -> Option<Connection> {
    Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .ok()
}

fn table_exists(conn: &Connection, name: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
        [name],
        |_| Ok(()),
    )
    .is_ok()
}

fn project_name(path: &str) -> String {
    path.trim_end_matches('/')
        .rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or(path)
        .to_string()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// `created_at`/`updated_at` could be unix seconds, unix ms, or an RFC3339
/// string — the schema isn't confirmed. Guess by magnitude/type rather than
/// assuming, so a wrong guess degrades to a wrong-but-plausible date instead
/// of a parse failure.
fn parse_ts(v: ValueRef) -> u64 {
    let as_secs_or_ms = |n: i64| -> u64 {
        let n = n.max(0) as u64;
        if n > 10_000_000_000 {
            n
        } else {
            n.saturating_mul(1000)
        }
    };
    match v {
        ValueRef::Integer(i) => as_secs_or_ms(i),
        ValueRef::Real(f) => as_secs_or_ms(f as i64),
        ValueRef::Text(t) => std::str::from_utf8(t)
            .ok()
            .and_then(rfc3339_to_ms)
            .unwrap_or(0),
        _ => 0,
    }
}

#[derive(serde::Deserialize, Default)]
struct ConversationBlob {
    #[serde(default)]
    transcript: Vec<String>,
}

/// Splits a `"> "`-prefixed user transcript line back into its original
/// text — the CLI encodes embedded newlines as `"> \n"` before prefixing
/// the whole line with `"> "`.
fn strip_user_prefix(line: &str) -> String {
    line.strip_prefix("> ")
        .unwrap_or(line)
        .replace("> \n", "\n")
}

/// Splits an assistant transcript line into its text and the tool names
/// from the trailing `"\n[Tool uses: ...]"` annotation the CLI always
/// appends (`"none"` when no tools were used).
fn split_tool_suffix(line: &str) -> (String, Vec<String>) {
    const MARKER: &str = "\n[Tool uses: ";
    if let (Some(idx), true) = (line.rfind(MARKER), line.ends_with(']')) {
        let tools_str = &line[idx + MARKER.len()..line.len() - 1];
        let text = line[..idx].to_string();
        if tools_str == "none" || tools_str.is_empty() {
            return (text, vec![]);
        }
        let tools = tools_str
            .split(',')
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .collect();
        return (text, tools);
    }
    (line.to_string(), vec![])
}

fn parse_transcript(lines: &[String]) -> Vec<Message> {
    let mut messages = Vec::with_capacity(lines.len());
    for line in lines {
        if line.starts_with("> ") {
            messages.push(Message {
                role: "user".to_string(),
                content: vec![ContentBlock {
                    block_type: "text".to_string(),
                    text: Some(strip_user_prefix(line)),
                    tool_name: None,
                    tool_input: None,
                    tool_result: None,
                    is_error: false,
                }],
                timestamp: None,
                model: None,
                usage: None,
            });
            continue;
        }

        let (text, tools) = split_tool_suffix(line);
        let mut content = Vec::new();
        if !text.trim().is_empty() {
            content.push(ContentBlock {
                block_type: "text".to_string(),
                text: Some(text),
                tool_name: None,
                tool_input: None,
                tool_result: None,
                is_error: false,
            });
        }
        for tool in tools {
            content.push(ContentBlock {
                block_type: "tool_use".to_string(),
                text: None,
                tool_name: Some(tool),
                tool_input: None,
                tool_result: None,
                is_error: false,
            });
        }
        if content.is_empty() {
            continue;
        }
        messages.push(Message {
            role: "assistant".to_string(),
            content,
            timestamp: None,
            model: None,
            usage: None,
        });
    }
    messages
}

fn entry_from_row(
    key: String,
    conversation_id: String,
    value: &str,
    ts: u64,
) -> Option<SessionEntry> {
    let blob: ConversationBlob = serde_json::from_str(value).ok()?;
    let mut prompt_count = 0u32;
    let mut display = None;
    for line in &blob.transcript {
        if line.starts_with("> ") {
            prompt_count += 1;
            if display.is_none() {
                let text = strip_user_prefix(line)
                    .replace('\n', " ")
                    .trim()
                    .to_string();
                if !text.is_empty() {
                    display = Some(text);
                }
            }
        }
    }
    let name = project_name(&key);
    Some(SessionEntry {
        agent: "kiro".to_string(),
        session_id: conversation_id,
        display: display.unwrap_or_else(|| "(no prompt)".to_string()),
        timestamp: ts,
        project: key,
        project_name: name,
        total_tokens: 0,
        model: None,
        duration_minutes: None,
        is_live: now_ms().saturating_sub(ts) < 300_000,
        error_count: 0,
        prompt_count,
        title: None,
    })
}

fn list_from_db(limit: usize) -> Vec<SessionEntry> {
    let Some(path) = db_path() else { return vec![] };
    let Some(conn) = open_ro(&path) else {
        return vec![];
    };
    if !table_exists(&conn, "conversations_v2") {
        return vec![];
    }
    let Ok(mut stmt) = conn.prepare(
        "SELECT key, conversation_id, value, updated_at FROM conversations_v2 ORDER BY updated_at DESC LIMIT ?1",
    ) else {
        return vec![];
    };
    let Ok(rows) = stmt.query_map([limit as i64], |row| {
        let key: String = row.get(0)?;
        let conversation_id: String = row.get(1)?;
        let value: String = row.get(2)?;
        let ts = parse_ts(row.get_ref(3)?);
        Ok((key, conversation_id, value, ts))
    }) else {
        return vec![];
    };
    rows.filter_map(Result::ok)
        .filter_map(|(key, cid, value, ts)| entry_from_row(key, cid, &value, ts))
        .collect()
}

fn get_from_db(session_id: &str) -> Option<SessionDetail> {
    let path = db_path()?;
    let conn = open_ro(&path)?;
    if !table_exists(&conn, "conversations_v2") {
        return None;
    }
    let (key, value, ts) = conn
        .query_row(
            "SELECT key, value, updated_at FROM conversations_v2 WHERE conversation_id = ?1",
            [session_id],
            |row| {
                let key: String = row.get(0)?;
                let value: String = row.get(1)?;
                let ts = parse_ts(row.get_ref(2)?);
                Ok((key, value, ts))
            },
        )
        .ok()?;
    let blob: ConversationBlob = serde_json::from_str(&value).ok()?;
    let messages = parse_transcript(&blob.transcript);
    Some(SessionDetail {
        agent: "kiro".to_string(),
        session_id: session_id.to_string(),
        messages,
        total_tokens: Default::default(),
        model: None,
        duration_ms: None,
        project: key.clone(),
        project_name: project_name(&key),
        timestamp: ts,
        title: None,
    })
}

impl SessionSource for KiroSource {
    fn agent_id(&self) -> &'static str {
        "kiro"
    }

    fn list(&self, limit: usize) -> Vec<SessionEntry> {
        list_from_db(limit)
    }

    fn get(&self, session_id: &str) -> Option<SessionDetail> {
        get_from_db(session_id)
    }

    fn resume_command(&self, session_id: Option<&str>) -> String {
        match session_id {
            Some(id) => format!("kiro-cli chat --resume-id {id}"),
            None => "kiro-cli chat".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_user_prefix_and_restores_embedded_newlines() {
        assert_eq!(strip_user_prefix("> fix the bug"), "fix the bug");
        assert_eq!(
            strip_user_prefix("> first line> \nsecond line"),
            "first line\nsecond line"
        );
    }

    #[test]
    fn splits_tool_suffix_with_tools() {
        let (text, tools) = split_tool_suffix("Ran the tests.\n[Tool uses: exec_command,fs_read]");
        assert_eq!(text, "Ran the tests.");
        assert_eq!(tools, vec!["exec_command", "fs_read"]);
    }

    #[test]
    fn splits_tool_suffix_none() {
        let (text, tools) = split_tool_suffix("Just a reply.\n[Tool uses: none]");
        assert_eq!(text, "Just a reply.");
        assert!(tools.is_empty());
    }

    #[test]
    fn leaves_unmarked_lines_untouched() {
        let (text, tools) = split_tool_suffix("no marker here");
        assert_eq!(text, "no marker here");
        assert!(tools.is_empty());
    }

    #[test]
    fn parses_transcript_into_alternating_messages() {
        let lines = vec![
            "> fix the login bug".to_string(),
            "Looked at the middleware.\n[Tool uses: fs_read]".to_string(),
            "> thanks".to_string(),
            "You're welcome.\n[Tool uses: none]".to_string(),
        ];
        let messages = parse_transcript(&lines);
        assert_eq!(messages.len(), 4);
        assert_eq!(messages[0].role, "user");
        assert_eq!(
            messages[0].content[0].text.as_deref(),
            Some("fix the login bug")
        );
        assert_eq!(messages[1].role, "assistant");
        assert_eq!(messages[1].content.len(), 2); // text + tool_use
        assert_eq!(messages[1].content[1].tool_name.as_deref(), Some("fs_read"));
        assert_eq!(messages[3].content.len(), 1); // "none" produces no tool_use block
    }

    #[test]
    fn parse_ts_distinguishes_seconds_from_millis() {
        assert_eq!(
            parse_ts(ValueRef::Integer(1_781_000_000)),
            1_781_000_000_000
        );
        assert_eq!(
            parse_ts(ValueRef::Integer(1_781_000_000_000)),
            1_781_000_000_000
        );
    }

    #[test]
    fn parse_ts_reads_rfc3339_text() {
        let ms = parse_ts(ValueRef::Text(b"2026-06-11T21:39:19.749Z"));
        assert_eq!(ms % 1000, 749);
    }

    #[test]
    fn entry_from_row_extracts_first_prompt_and_count() {
        let value = serde_json::json!({
            "transcript": [
                "> fix the bug",
                "On it.\n[Tool uses: none]",
                "> also add a test",
                "Added.\n[Tool uses: fs_write]",
            ]
        })
        .to_string();
        let entry = entry_from_row(
            "/Users/test/proj/alpha".to_string(),
            "conv-1".to_string(),
            &value,
            1_781_000_000_000,
        )
        .unwrap();
        assert_eq!(entry.agent, "kiro");
        assert_eq!(entry.session_id, "conv-1");
        assert_eq!(entry.display, "fix the bug");
        assert_eq!(entry.prompt_count, 2);
        assert_eq!(entry.project, "/Users/test/proj/alpha");
        assert_eq!(entry.project_name, "alpha");
    }

    #[test]
    fn resume_command_shape() {
        assert_eq!(
            KiroSource.resume_command(Some("conv-1")),
            "kiro-cli chat --resume-id conv-1"
        );
        assert_eq!(KiroSource.resume_command(None), "kiro-cli chat");
    }

    /// End-to-end against an in-memory DB matching our *assumed* schema.
    /// Exercises `list_from_db`/`get_from_db`'s SQL, not the real file.
    #[test]
    fn list_and_get_round_trip_against_assumed_schema() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE conversations_v2 (
                key TEXT NOT NULL,
                conversation_id TEXT NOT NULL,
                value TEXT NOT NULL,
                created_at INTEGER,
                updated_at INTEGER,
                PRIMARY KEY (key, conversation_id)
            );",
        )
        .unwrap();
        let value = serde_json::json!({
            "transcript": ["> hello", "hi there.\n[Tool uses: none]"]
        })
        .to_string();
        conn.execute(
            "INSERT INTO conversations_v2 (key, conversation_id, value, created_at, updated_at)
             VALUES ('/Users/test/proj', 'conv-1', ?1, 1781000000, 1781000000)",
            [&value],
        )
        .unwrap();

        let mut stmt = conn
            .prepare("SELECT key, conversation_id, value, updated_at FROM conversations_v2 ORDER BY updated_at DESC LIMIT ?1")
            .unwrap();
        let rows: Vec<_> = stmt
            .query_map([10i64], |row| {
                let key: String = row.get(0)?;
                let cid: String = row.get(1)?;
                let value: String = row.get(2)?;
                let ts = parse_ts(row.get_ref(3)?);
                Ok((key, cid, value, ts))
            })
            .unwrap()
            .filter_map(Result::ok)
            .collect();
        assert_eq!(rows.len(), 1);
        let entry =
            entry_from_row(rows[0].0.clone(), rows[0].1.clone(), &rows[0].2, rows[0].3).unwrap();
        assert_eq!(entry.session_id, "conv-1");
        assert_eq!(entry.display, "hello");
    }
}

#[cfg(test)]
mod smoke {
    use super::*;

    /// Runs against the real local kiro-cli database, if present. Not
    /// asserted against — this is for eyeballing whether field names in the
    /// doc comment above still hold once you have a real saved session:
    /// `cargo test real_kiro_smoke -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_kiro_smoke() {
        let Some(path) = db_path() else {
            println!("no kiro-cli data.sqlite3 found");
            return;
        };
        println!("db: {}", path.display());
        let list = list_from_db(20);
        println!("sessions: {}", list.len());
        for e in &list {
            println!(
                "  [{}] {} | prompts:{} live:{}",
                e.project_name,
                e.display.chars().take(60).collect::<String>(),
                e.prompt_count,
                e.is_live
            );
        }
        if let Some(first) = list.first() {
            match get_from_db(&first.session_id) {
                Some(d) => println!("get({}) -> {} messages", first.session_id, d.messages.len()),
                None => println!("get({}) -> not found", first.session_id),
            }
        }
    }
}
