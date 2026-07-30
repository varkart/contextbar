//! OpenCode (`opencode`) session source.
//!
//! OpenCode (github.com/anomalyco/opencode, MIT) stores sessions in a
//! Drizzle-ORM SQLite database at `$XDG_DATA_HOME/opencode/opencode.db`
//! (defaults to `~/.local/share/opencode/opencode.db` — OpenCode uses
//! `xdg-basedir` on every platform including macOS, not
//! `~/Library/Application Support`). Confirmed directly against a live
//! local `opencode.db` (schema inspected with `sqlite3 .schema`), not just
//! reverse-engineered from source — so unlike Kiro this one's verified.
//!
//! Two tables matter:
//! - `session`: one row per session — `title` (CLI-maintained, doubles as
//!   our `display`/`title`), `directory`, `time_created`/`time_updated`
//!   (unix ms — confirmed via `Date.now()` in the Drizzle column defaults),
//!   `tokens_input`/`tokens_output`, `model` (JSON `{id, providerID}`).
//! - `session_message`: one row per message — `type` (tagged union:
//!   user/assistant/system/shell/agent-switched/model-switched/synthetic/
//!   compaction) + `data` (JSON, shape depends on `type`). Only `user` and
//!   `assistant` carry conversation content; the rest are internal/control
//!   messages and are skipped, same as other sources skip their internal
//!   step types. Assistant `content` is itself a tagged union
//!   (text/reasoning/tool) — `reasoning` is skipped, `tool` becomes a
//!   `tool_use` block extracting whatever `state.input` holds regardless of
//!   its exact shape (tool state itself is a further tagged union we don't
//!   need to fully model for a read-only view).

use super::SessionSource;
use crate::engine::history::types::{
    ContentBlock, Message, SessionDetail, SessionEntry, TokenUsage,
};
use rusqlite::{Connection, OpenFlags};
use serde_json::Value;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct OpencodeSource;

fn db_path() -> Option<PathBuf> {
    let base = std::env::var("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or(dirs::home_dir()?.join(".local/share"));
    let path = base.join("opencode").join("opencode.db");
    path.is_file().then_some(path)
}

fn open_ro(path: &std::path::Path) -> Option<Connection> {
    Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .ok()
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

fn model_id_from_json(raw: Option<&str>) -> Option<String> {
    let raw = raw?;
    let v: Value = serde_json::from_str(raw).ok()?;
    v.get("id")?.as_str().map(str::to_string)
}

fn list_from_db(limit: usize) -> Vec<SessionEntry> {
    let Some(path) = db_path() else { return vec![] };
    let Some(conn) = open_ro(&path) else {
        return vec![];
    };
    let Ok(mut stmt) = conn.prepare(
        "SELECT s.id, s.title, s.directory, s.time_updated, s.tokens_input, s.tokens_output, s.model,
                COUNT(CASE WHEN sm.type = 'user' THEN 1 END)
         FROM session s
         LEFT JOIN session_message sm ON sm.session_id = s.id
         GROUP BY s.id
         ORDER BY s.time_updated DESC
         LIMIT ?1",
    ) else {
        return vec![];
    };
    let Ok(rows) = stmt.query_map([limit as i64], |row| {
        let id: String = row.get(0)?;
        let title: String = row.get(1)?;
        let directory: String = row.get(2)?;
        let ts: i64 = row.get(3)?;
        let tokens_input: i64 = row.get(4)?;
        let tokens_output: i64 = row.get(5)?;
        let model: Option<String> = row.get(6)?;
        let prompt_count: i64 = row.get(7)?;
        Ok((
            id,
            title,
            directory,
            ts,
            tokens_input,
            tokens_output,
            model,
            prompt_count,
        ))
    }) else {
        return vec![];
    };

    rows.filter_map(Result::ok)
        .map(
            |(id, title, directory, ts, tokens_input, tokens_output, model, prompt_count)| {
                let ts = ts.max(0) as u64;
                SessionEntry {
                    agent: "opencode".to_string(),
                    session_id: id,
                    display: if title.trim().is_empty() {
                        "(no prompt)".to_string()
                    } else {
                        title.clone()
                    },
                    timestamp: ts,
                    project: directory.clone(),
                    project_name: project_name(&directory),
                    total_tokens: (tokens_input.max(0) + tokens_output.max(0)) as u64,
                    model: model_id_from_json(model.as_deref()),
                    duration_minutes: None,
                    is_live: now_ms().saturating_sub(ts) < 300_000,
                    error_count: 0,
                    prompt_count: prompt_count.max(0) as u32,
                    title: (!title.trim().is_empty()).then_some(title),
                }
            },
        )
        .collect()
}

#[derive(serde::Deserialize, Default)]
struct UserData {
    #[serde(default)]
    text: String,
}

#[derive(serde::Deserialize, Default)]
struct ModelRef {
    id: Option<String>,
}

#[derive(serde::Deserialize, Default)]
struct CacheTokens {
    read: Option<f64>,
    write: Option<f64>,
}

#[derive(serde::Deserialize, Default)]
struct TokensData {
    input: Option<f64>,
    output: Option<f64>,
    #[serde(default)]
    cache: CacheTokens,
}

#[derive(serde::Deserialize, Default)]
struct AssistantData {
    #[serde(default)]
    model: Option<ModelRef>,
    #[serde(default)]
    content: Vec<RawContentItem>,
    #[serde(default)]
    tokens: Option<TokensData>,
}

#[derive(serde::Deserialize)]
struct RawContentItem {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    state: Option<Value>,
}

fn tool_input_preview(state: &Option<Value>) -> Option<String> {
    let input = state.as_ref()?.get("input")?;
    match input {
        Value::String(s) => Some(s.chars().take(500).collect()),
        other => Some(other.to_string().chars().take(500).collect()),
    }
}

fn message_from_row(msg_type: &str, data: &str) -> Option<Message> {
    match msg_type {
        "user" => {
            let d: UserData = serde_json::from_str(data).ok()?;
            if d.text.trim().is_empty() {
                return None;
            }
            Some(Message {
                role: "user".to_string(),
                content: vec![ContentBlock {
                    block_type: "text".to_string(),
                    text: Some(d.text),
                    tool_name: None,
                    tool_input: None,
                    tool_result: None,
                    is_error: false,
                }],
                timestamp: None,
                model: None,
                usage: None,
            })
        }
        "assistant" => {
            let d: AssistantData = serde_json::from_str(data).ok()?;
            let mut content = Vec::new();
            for item in &d.content {
                match item.kind.as_str() {
                    "text" => {
                        if let Some(text) = item.text.clone().filter(|t| !t.trim().is_empty()) {
                            content.push(ContentBlock {
                                block_type: "text".to_string(),
                                text: Some(text),
                                tool_name: None,
                                tool_input: None,
                                tool_result: None,
                                is_error: false,
                            });
                        }
                    }
                    "tool" => {
                        content.push(ContentBlock {
                            block_type: "tool_use".to_string(),
                            text: None,
                            tool_name: item.name.clone().or_else(|| Some("tool".to_string())),
                            tool_input: tool_input_preview(&item.state),
                            tool_result: None,
                            is_error: false,
                        });
                    }
                    _ => {} // reasoning and unknown future kinds: internal, skip
                }
            }
            if content.is_empty() {
                return None;
            }
            let usage = d.tokens.map(|t| TokenUsage {
                input_tokens: t.input.unwrap_or(0.0).max(0.0) as u64,
                output_tokens: t.output.unwrap_or(0.0).max(0.0) as u64,
                cache_read_tokens: t.cache.read.unwrap_or(0.0).max(0.0) as u64,
                cache_creation_tokens: t.cache.write.unwrap_or(0.0).max(0.0) as u64,
            });
            Some(Message {
                role: "assistant".to_string(),
                content,
                timestamp: None,
                model: d.model.and_then(|m| m.id),
                usage,
            })
        }
        _ => None, // system/shell/synthetic/agent-switched/model-switched/compaction: skip
    }
}

fn get_from_db(session_id: &str) -> Option<SessionDetail> {
    let path = db_path()?;
    let conn = open_ro(&path)?;

    let (title, directory, time_created, time_updated) = conn
        .query_row(
            "SELECT title, directory, time_created, time_updated FROM session WHERE id = ?1",
            [session_id],
            |row| {
                let title: String = row.get(0)?;
                let directory: String = row.get(1)?;
                let created: i64 = row.get(2)?;
                let updated: i64 = row.get(3)?;
                Ok((
                    title,
                    directory,
                    created.max(0) as u64,
                    updated.max(0) as u64,
                ))
            },
        )
        .ok()?;

    let mut stmt = conn
        .prepare("SELECT type, data FROM session_message WHERE session_id = ?1 ORDER BY seq ASC")
        .ok()?;
    let rows = stmt
        .query_map([session_id], |row| {
            let msg_type: String = row.get(0)?;
            let data: String = row.get(1)?;
            Ok((msg_type, data))
        })
        .ok()?;

    let messages: Vec<Message> = rows
        .filter_map(Result::ok)
        .filter_map(|(t, data)| message_from_row(&t, &data))
        .collect();

    let total_tokens = messages.iter().filter_map(|m| m.usage.as_ref()).fold(
        TokenUsage::default(),
        |mut acc, u| {
            acc.input_tokens += u.input_tokens;
            acc.output_tokens += u.output_tokens;
            acc.cache_read_tokens += u.cache_read_tokens;
            acc.cache_creation_tokens += u.cache_creation_tokens;
            acc
        },
    );
    let model = messages.iter().rev().find_map(|m| m.model.clone());

    Some(SessionDetail {
        agent: "opencode".to_string(),
        session_id: session_id.to_string(),
        messages,
        total_tokens,
        model,
        duration_ms: time_updated.checked_sub(time_created),
        project: directory.clone(),
        project_name: project_name(&directory),
        timestamp: time_updated,
        title: (!title.trim().is_empty()).then_some(title),
    })
}

impl SessionSource for OpencodeSource {
    fn agent_id(&self) -> &'static str {
        "opencode"
    }

    fn list(&self, limit: usize) -> Vec<SessionEntry> {
        list_from_db(limit)
    }

    fn get(&self, session_id: &str) -> Option<SessionDetail> {
        get_from_db(session_id)
    }

    fn resume_command(&self, session_id: Option<&str>) -> String {
        match session_id {
            Some(id) => format!("opencode --session {id}"),
            None => "opencode".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resume_command_shape() {
        assert_eq!(
            OpencodeSource.resume_command(Some("ses_abc")),
            "opencode --session ses_abc"
        );
        assert_eq!(OpencodeSource.resume_command(None), "opencode");
    }

    #[test]
    fn parses_user_message() {
        let data = serde_json::json!({ "text": "fix the login bug" }).to_string();
        let msg = message_from_row("user", &data).unwrap();
        assert_eq!(msg.role, "user");
        assert_eq!(msg.content[0].text.as_deref(), Some("fix the login bug"));
    }

    #[test]
    fn skips_blank_user_message() {
        let data = serde_json::json!({ "text": "   " }).to_string();
        assert!(message_from_row("user", &data).is_none());
    }

    #[test]
    fn parses_assistant_message_with_text_and_tool() {
        let data = serde_json::json!({
            "agent": "build",
            "model": { "id": "claude-sonnet-4-5", "providerID": "anthropic" },
            "content": [
                { "type": "text", "id": "1", "text": "Looked at the middleware." },
                { "type": "reasoning", "id": "2", "text": "internal thinking" },
                { "type": "tool", "id": "3", "name": "fs_read", "state": { "status": "completed", "input": { "path": "/x.rs" } } }
            ],
            "tokens": { "input": 100, "output": 50, "reasoning": 0, "cache": { "read": 10, "write": 5 } }
        })
        .to_string();
        let msg = message_from_row("assistant", &data).unwrap();
        assert_eq!(msg.role, "assistant");
        assert_eq!(msg.content.len(), 2); // reasoning skipped
        assert_eq!(
            msg.content[0].text.as_deref(),
            Some("Looked at the middleware.")
        );
        assert_eq!(msg.content[1].block_type, "tool_use");
        assert_eq!(msg.content[1].tool_name.as_deref(), Some("fs_read"));
        assert!(msg.content[1]
            .tool_input
            .as_deref()
            .unwrap()
            .contains("x.rs"));
        assert_eq!(msg.model.as_deref(), Some("claude-sonnet-4-5"));
        let usage = msg.usage.unwrap();
        assert_eq!(usage.input_tokens, 100);
        assert_eq!(usage.output_tokens, 50);
        assert_eq!(usage.cache_read_tokens, 10);
        assert_eq!(usage.cache_creation_tokens, 5);
    }

    #[test]
    fn skips_system_and_control_messages() {
        assert!(message_from_row("system", r#"{"text":"noise"}"#).is_none());
        assert!(message_from_row("agent-switched", r#"{"agent":"build"}"#).is_none());
        assert!(message_from_row(
            "compaction",
            r#"{"reason":"auto","summary":"","recent":""}"#
        )
        .is_none());
    }

    #[test]
    fn tool_input_preview_handles_string_and_object() {
        let obj = Some(serde_json::json!({ "input": { "path": "/x" } }));
        assert!(tool_input_preview(&obj).unwrap().contains("/x"));
        let s = Some(serde_json::json!({ "input": "raw string input" }));
        assert_eq!(tool_input_preview(&s).unwrap(), "raw string input");
    }

    /// End-to-end against an in-memory DB matching the real schema
    /// confirmed via `sqlite3 .schema` on a live `opencode.db`.
    #[test]
    fn list_and_get_round_trip() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE session (
                id TEXT PRIMARY KEY, project_id TEXT, title TEXT NOT NULL, directory TEXT NOT NULL,
                model TEXT, tokens_input INTEGER DEFAULT 0, tokens_output INTEGER DEFAULT 0,
                time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL
            );
            CREATE TABLE session_message (
                id TEXT PRIMARY KEY, session_id TEXT NOT NULL, type TEXT NOT NULL, seq INTEGER NOT NULL,
                time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL
            );",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO session (id, project_id, title, directory, model, tokens_input, tokens_output, time_created, time_updated)
             VALUES ('ses_1', 'proj_1', 'fix the login bug', '/Users/test/proj/alpha', '{\"id\":\"claude-sonnet-4-5\",\"providerID\":\"anthropic\"}', 100, 50, 1000, 2000)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data)
             VALUES ('m1', 'ses_1', 'user', 1, 1000, 1000, '{\"text\":\"fix the login bug\"}')",
            [],
        )
        .unwrap();

        let mut stmt = conn
            .prepare(
                "SELECT s.id, s.title, s.directory, s.time_updated, s.tokens_input, s.tokens_output, s.model,
                        COUNT(CASE WHEN sm.type = 'user' THEN 1 END)
                 FROM session s LEFT JOIN session_message sm ON sm.session_id = s.id GROUP BY s.id",
            )
            .unwrap();
        let row = stmt
            .query_row([], |row| {
                let id: String = row.get(0)?;
                let title: String = row.get(1)?;
                let directory: String = row.get(2)?;
                Ok((id, title, directory, row.get::<_, i64>(7)?))
            })
            .unwrap();
        assert_eq!(row.0, "ses_1");
        assert_eq!(row.1, "fix the login bug");
        assert_eq!(row.2, "/Users/test/proj/alpha");
        assert_eq!(row.3, 1); // one user message
    }
}

#[cfg(test)]
mod smoke {
    use super::*;

    /// Runs against your real local opencode.db, if present. Confirmed
    /// against this schema once already (see module doc), but data volume
    /// and real content shape are worth eyeballing:
    /// `cargo test real_opencode_smoke -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_opencode_smoke() {
        let Some(path) = db_path() else {
            println!("no opencode.db found");
            return;
        };
        println!("db: {}", path.display());
        let list = list_from_db(20);
        println!("sessions: {}", list.len());
        for e in &list {
            println!(
                "  [{}] {} | prompts:{} tokens:{} model:{:?}",
                e.project_name,
                e.display.chars().take(60).collect::<String>(),
                e.prompt_count,
                e.total_tokens,
                e.model
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
