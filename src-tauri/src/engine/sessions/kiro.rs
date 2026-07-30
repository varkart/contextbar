//! Kiro CLI (`kiro-cli`) session source.
//!
//! Kiro CLI auto-saves every chat turn as files under
//! `~/.kiro/sessions/cli/`, one session per directory (confirmed against
//! real local session files — the sqlite `data.sqlite3` this module
//! originally targeted turned out to be unrelated app state, not the
//! conversation store). Three files per session:
//!
//! - `{id}.json` — metadata: `cwd`, `title`, `created_at`/`updated_at`
//!   (RFC3339), and `session_state.conversation_metadata
//!   .user_turn_metadatas` (one entry per user turn — its length is a cheap
//!   prompt count without touching the jsonl).
//! - `{id}.jsonl` — the conversation, one JSON object per line tagged by
//!   `kind`: `Prompt` (user turn, `data.content[].kind == "text"`),
//!   `AssistantMessage` (`data.content[]` mixes `text` and `toolUse`
//!   blocks), `ToolResults` (the tool output fed back to the model — often
//!   huge documentation/file dumps, skipped here same as other sources drop
//!   mechanical results and keep just the call).
//! - `{id}.lock` — exists only while the session is actively open, so its
//!   presence is a more accurate "live" signal than the mtime heuristic
//!   other sources fall back to.

use super::{rfc3339_to_ms, SessionSource};
use crate::engine::history::types::{ContentBlock, Message, SessionDetail, SessionEntry};
use std::path::PathBuf;

pub struct KiroSource;

fn sessions_root() -> Option<PathBuf> {
    let dir = dirs::home_dir()?.join(".kiro").join("sessions").join("cli");
    dir.is_dir().then_some(dir)
}

fn project_name(path: &str) -> String {
    path.trim_end_matches('/')
        .rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or(path)
        .to_string()
}

#[derive(serde::Deserialize, Default)]
struct SessionMeta {
    #[serde(default)]
    cwd: String,
    #[serde(default)]
    created_at: String,
    #[serde(default)]
    updated_at: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    session_state: Option<SessionState>,
}

#[derive(serde::Deserialize, Default)]
struct SessionState {
    #[serde(default)]
    conversation_metadata: Option<ConversationMetadata>,
}

#[derive(serde::Deserialize, Default)]
struct ConversationMetadata {
    #[serde(default)]
    user_turn_metadatas: Vec<serde_json::Value>,
}

fn read_meta(path: &std::path::Path) -> Option<SessionMeta> {
    let content = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

fn list_from_root(root: &std::path::Path, limit: usize) -> Vec<SessionEntry> {
    let Ok(entries) = std::fs::read_dir(root) else {
        return vec![];
    };

    let mut sessions: Vec<SessionEntry> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                return None;
            }
            let session_id = path.file_stem()?.to_str()?.to_string();
            let meta = read_meta(&path)?;

            let ts = rfc3339_to_ms(&meta.updated_at)
                .or_else(|| rfc3339_to_ms(&meta.created_at))
                .unwrap_or(0);
            let prompt_count = meta
                .session_state
                .as_ref()
                .and_then(|s| s.conversation_metadata.as_ref())
                .map(|c| c.user_turn_metadatas.len())
                .unwrap_or(0) as u32;
            let is_live = root.join(format!("{session_id}.lock")).exists();

            Some(SessionEntry {
                agent: "kiro".to_string(),
                session_id,
                display: if meta.title.trim().is_empty() {
                    "(no prompt)".to_string()
                } else {
                    meta.title.clone()
                },
                timestamp: ts,
                project: meta.cwd.clone(),
                project_name: project_name(&meta.cwd),
                total_tokens: 0,
                model: None,
                duration_minutes: None,
                is_live,
                error_count: 0,
                prompt_count,
                title: (!meta.title.trim().is_empty()).then_some(meta.title),
            })
        })
        .collect();

    sessions.sort_by_key(|e| std::cmp::Reverse(e.timestamp));
    sessions.truncate(limit);
    sessions
}

#[derive(serde::Deserialize)]
struct JsonlLine {
    kind: String,
    data: JsonlData,
}

#[derive(serde::Deserialize)]
struct JsonlData {
    #[serde(default)]
    content: Vec<ContentItem>,
    #[serde(default)]
    meta: Option<TurnMeta>,
}

#[derive(serde::Deserialize)]
struct TurnMeta {
    #[serde(default)]
    timestamp: Option<i64>,
}

#[derive(serde::Deserialize)]
struct ContentItem {
    kind: String,
    #[serde(default)]
    data: serde_json::Value,
}

fn parse_content(items: &[ContentItem]) -> Vec<ContentBlock> {
    let mut out = Vec::new();
    for item in items {
        match item.kind.as_str() {
            "text" => {
                if let Some(text) = item.data.as_str().filter(|t| !t.trim().is_empty()) {
                    out.push(ContentBlock {
                        block_type: "text".to_string(),
                        text: Some(text.to_string()),
                        tool_name: None,
                        tool_input: None,
                        tool_result: None,
                        is_error: false,
                    });
                }
            }
            "toolUse" => {
                let name = item
                    .data
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("tool")
                    .to_string();
                let input = item
                    .data
                    .get("input")
                    .map(|v| v.to_string().chars().take(500).collect());
                out.push(ContentBlock {
                    block_type: "tool_use".to_string(),
                    text: None,
                    tool_name: Some(name),
                    tool_input: input,
                    tool_result: None,
                    is_error: false,
                });
            }
            _ => {} // other/future content kinds: skip
        }
    }
    out
}

fn parse_jsonl(content: &str) -> Vec<Message> {
    let mut messages = Vec::new();
    for line in content.lines() {
        let Ok(parsed) = serde_json::from_str::<JsonlLine>(line.trim()) else {
            continue;
        };
        let role = match parsed.kind.as_str() {
            "Prompt" => "user",
            "AssistantMessage" => "assistant",
            _ => continue, // ToolResults and anything else: internal, skip
        };
        let content = parse_content(&parsed.data.content);
        if content.is_empty() {
            continue;
        }
        let timestamp = parsed
            .data
            .meta
            .and_then(|m| m.timestamp)
            .map(|secs| (secs.max(0) as u64) * 1000);
        messages.push(Message {
            role: role.to_string(),
            content,
            timestamp,
            model: None,
            usage: None,
        });
    }
    messages
}

fn get_from_root(root: &std::path::Path, session_id: &str) -> Option<SessionDetail> {
    let meta = read_meta(&root.join(format!("{session_id}.json")))?;
    let jsonl = std::fs::read_to_string(root.join(format!("{session_id}.jsonl"))).ok()?;
    let messages = parse_jsonl(&jsonl);

    let created_ms = rfc3339_to_ms(&meta.created_at);
    let updated_ms = rfc3339_to_ms(&meta.updated_at);
    let timestamp = updated_ms.or(created_ms).unwrap_or(0);

    Some(SessionDetail {
        agent: "kiro".to_string(),
        session_id: session_id.to_string(),
        messages,
        total_tokens: Default::default(),
        model: None,
        duration_ms: match (created_ms, updated_ms) {
            (Some(c), Some(u)) => u.checked_sub(c),
            _ => None,
        },
        project: meta.cwd.clone(),
        project_name: project_name(&meta.cwd),
        timestamp,
        title: (!meta.title.trim().is_empty()).then_some(meta.title),
    })
}

impl SessionSource for KiroSource {
    fn agent_id(&self) -> &'static str {
        "kiro"
    }

    fn list(&self, limit: usize) -> Vec<SessionEntry> {
        let Some(root) = sessions_root() else {
            return vec![];
        };
        list_from_root(&root, limit)
    }

    fn get(&self, session_id: &str) -> Option<SessionDetail> {
        get_from_root(&sessions_root()?, session_id)
    }

    fn resume_command(&self, session_id: Option<&str>) -> String {
        match session_id {
            Some(id) => format!("kiro-cli chat --resume-id {id}"),
            None => "kiro-cli chat".to_string(),
        }
    }

    fn transcript_file(&self, entry: &SessionEntry) -> Option<PathBuf> {
        Some(sessions_root()?.join(format!("{}.jsonl", entry.session_id)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resume_command_shape() {
        assert_eq!(
            KiroSource.resume_command(Some("abc-123")),
            "kiro-cli chat --resume-id abc-123"
        );
        assert_eq!(KiroSource.resume_command(None), "kiro-cli chat");
    }

    #[test]
    fn parses_prompt_and_assistant_text() {
        let jsonl = concat!(
            r#"{"version":"v1","kind":"Prompt","data":{"message_id":"1","content":[{"kind":"text","data":"hello"}],"meta":{"timestamp":1785350924}}}"#,
            "\n",
            r#"{"version":"v1","kind":"AssistantMessage","data":{"message_id":"2","content":[{"kind":"text","data":"Hi there"}]}}"#,
        );
        let messages = parse_jsonl(jsonl);
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[0].content[0].text.as_deref(), Some("hello"));
        assert_eq!(messages[0].timestamp, Some(1785350924000));
        assert_eq!(messages[1].role, "assistant");
        assert_eq!(messages[1].timestamp, None); // assistant turns carry no meta.timestamp
    }

    #[test]
    fn parses_tool_use_and_skips_tool_results() {
        let jsonl = concat!(
            r#"{"version":"v1","kind":"AssistantMessage","data":{"message_id":"1","content":[{"kind":"text","data":""},{"kind":"toolUse","data":{"toolUseId":"t1","name":"introspect","input":{"query":"x"}}}]}}"#,
            "\n",
            r#"{"version":"v1","kind":"ToolResults","data":{"message_id":"2","content":[{"kind":"toolResult","data":{"toolUseId":"t1","content":[{"kind":"json","data":{"documentation":"huge dump"}}]}}]}}"#,
        );
        let messages = parse_jsonl(jsonl);
        // ToolResults skipped entirely; the empty text block is dropped too.
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].content.len(), 1);
        assert_eq!(messages[0].content[0].block_type, "tool_use");
        assert_eq!(
            messages[0].content[0].tool_name.as_deref(),
            Some("introspect")
        );
        assert!(messages[0].content[0]
            .tool_input
            .as_deref()
            .unwrap()
            .contains("\"x\""));
    }

    #[test]
    fn skips_unparseable_lines() {
        assert!(parse_jsonl("not json\n{}\n").is_empty());
    }

    #[test]
    fn list_and_get_round_trip_against_real_shape() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let id = "sess-1";

        std::fs::write(
            root.join(format!("{id}.json")),
            serde_json::json!({
                "session_id": id,
                "cwd": "/Users/test/proj/alpha",
                "created_at": "2026-07-29T18:48:27.458722Z",
                "updated_at": "2026-07-29T18:48:51.842947Z",
                "title": "fix the login bug",
                "session_state": {
                    "version": "v1",
                    "conversation_metadata": {
                        "user_turn_metadatas": [serde_json::json!({}), serde_json::json!({})]
                    }
                }
            })
            .to_string(),
        )
        .unwrap();
        std::fs::write(
            root.join(format!("{id}.jsonl")),
            concat!(
                r#"{"version":"v1","kind":"Prompt","data":{"message_id":"1","content":[{"kind":"text","data":"fix the login bug"}],"meta":{"timestamp":1785350924}}}"#, "\n",
                r#"{"version":"v1","kind":"AssistantMessage","data":{"message_id":"2","content":[{"kind":"text","data":"Fixed it."}]}}"#,
            ),
        )
        .unwrap();

        let entries = list_from_root(root, 10);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].session_id, "sess-1");
        assert_eq!(entries[0].display, "fix the login bug");
        assert_eq!(entries[0].prompt_count, 2);
        assert_eq!(entries[0].project, "/Users/test/proj/alpha");
        assert_eq!(entries[0].project_name, "alpha");
        assert!(!entries[0].is_live); // no .lock file written

        let detail = get_from_root(root, id).unwrap();
        assert_eq!(detail.messages.len(), 2);
        assert_eq!(detail.messages[0].role, "user");
        assert_eq!(detail.messages[1].role, "assistant");
    }

    #[test]
    fn is_live_reflects_lock_file_presence() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let id = "sess-live";
        std::fs::write(
            root.join(format!("{id}.json")),
            serde_json::json!({
                "cwd": "/Users/test/proj",
                "created_at": "2026-07-29T18:48:27Z",
                "updated_at": "2026-07-29T18:48:27Z",
                "title": "t",
            })
            .to_string(),
        )
        .unwrap();
        std::fs::write(root.join(format!("{id}.lock")), "").unwrap();

        let entries = list_from_root(root, 10);
        assert!(entries[0].is_live);
    }
}

#[cfg(test)]
mod smoke {
    use super::*;

    /// Runs against your real `~/.kiro/sessions/cli/` files:
    /// `cargo test real_kiro_smoke -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_kiro_smoke() {
        let Some(root) = sessions_root() else {
            println!("no ~/.kiro/sessions/cli found");
            return;
        };
        println!("root: {}", root.display());
        let list = list_from_root(&root, 20);
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
            match get_from_root(&root, &first.session_id) {
                Some(d) => println!("get({}) -> {} messages", first.session_id, d.messages.len()),
                None => println!("get({}) -> not found", first.session_id),
            }
        }
    }
}
