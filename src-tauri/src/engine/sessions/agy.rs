//! Antigravity CLI (`agy`) session source.
//!
//! Data lives under `~/.gemini/antigravity-cli/` (see the `agy` manifest for
//! the skills/MCP side of this same tool). Two files matter here:
//!
//! - `history.jsonl` — one line per prompt: `{display, timestamp (unix ms),
//!   workspace, conversationId}`. Same shape as Claude's `history.jsonl`;
//!   grouped by `conversationId` the same way (first prompt = display, last
//!   timestamp = activity). Lines without a `conversationId` are internal/
//!   pre-session noise and are skipped.
//! - `brain/<conversationId>/.system_generated/logs/transcript.jsonl` — a
//!   readable per-step log (not the binary-blob `conversations/<id>.db`,
//!   which stores protobuf we have no schema for). Present for most but not
//!   all conversations (older ones predate this log); `get()` returns an
//!   error when it's missing rather than a fake empty transcript.

use super::{rfc3339_to_ms, SessionSource};
use crate::engine::history::types::{ContentBlock, Message, SessionDetail, SessionEntry};
use std::path::PathBuf;

pub struct AgySource;

fn root() -> Option<PathBuf> {
    let dir = dirs::home_dir()?.join(".gemini").join("antigravity-cli");
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

fn transcript_path(root: &std::path::Path, conversation_id: &str) -> PathBuf {
    root.join("brain")
        .join(conversation_id)
        .join(".system_generated")
        .join("logs")
        .join("transcript.jsonl")
}

fn is_live(root: &std::path::Path, conversation_id: &str) -> bool {
    super::is_recently_modified(&transcript_path(root, conversation_id))
}

/// Extract the human prompt from a USER_INPUT entry — real content is
/// wrapped `<USER_REQUEST>...</USER_REQUEST>` alongside metadata we don't
/// want to surface.
fn extract_user_request(content: &str) -> String {
    if let (Some(start), Some(end)) = (
        content.find("<USER_REQUEST>"),
        content.find("</USER_REQUEST>"),
    ) {
        let inner = &content[start + "<USER_REQUEST>".len()..end];
        return inner.trim().to_string();
    }
    content.trim().to_string()
}

fn list_from_root(root: &std::path::Path, limit: usize) -> Vec<SessionEntry> {
    let Ok(content) = std::fs::read_to_string(root.join("history.jsonl")) else {
        return vec![];
    };

    #[derive(serde::Deserialize)]
    struct Line {
        display: Option<String>,
        timestamp: Option<u64>,
        workspace: Option<String>,
        #[serde(rename = "conversationId")]
        conversation_id: Option<String>,
    }

    let mut sessions: std::collections::HashMap<String, SessionEntry> =
        std::collections::HashMap::new();
    for line in content.lines() {
        let Ok(h) = serde_json::from_str::<Line>(line.trim()) else {
            continue;
        };
        let Some(id) = h.conversation_id.filter(|s| !s.is_empty()) else {
            continue; // pre-conversation or internal line — can't attribute
        };
        let timestamp = h.timestamp.unwrap_or(0);
        let workspace = h.workspace.unwrap_or_default();
        let display = h.display.unwrap_or_else(|| "(no prompt)".to_string());

        match sessions.get_mut(&id) {
            Some(entry) => {
                entry.timestamp = entry.timestamp.max(timestamp);
                entry.prompt_count += 1;
            }
            None => {
                sessions.insert(
                    id.clone(),
                    SessionEntry {
                        agent: "agy".to_string(),
                        session_id: id.clone(),
                        display,
                        timestamp,
                        project_name: project_name(&workspace),
                        project: workspace,
                        total_tokens: 0,
                        model: None,
                        duration_minutes: None,
                        is_live: is_live(root, &id),
                        error_count: 0,
                        prompt_count: 1,
                        title: None,
                    },
                );
            }
        }
    }

    let mut out: Vec<SessionEntry> = sessions.into_values().collect();
    out.sort_by_key(|e| std::cmp::Reverse(e.timestamp));
    out.truncate(limit);
    out
}

fn get_from_root(root: &std::path::Path, session_id: &str) -> Option<SessionDetail> {
    let path = transcript_path(root, session_id);
    let content = std::fs::read_to_string(&path).ok()?;

    #[derive(serde::Deserialize)]
    struct ToolCall {
        name: Option<String>,
    }
    #[derive(serde::Deserialize)]
    struct Step {
        source: Option<String>,
        #[serde(rename = "type")]
        step_type: Option<String>,
        created_at: Option<String>,
        content: Option<String>,
        tool_calls: Option<Vec<ToolCall>>,
    }

    let mut messages = Vec::new();
    for line in content.lines() {
        let Ok(step) = serde_json::from_str::<Step>(line.trim()) else {
            continue;
        };
        let ts = step.created_at.as_deref().and_then(rfc3339_to_ms);
        let text = step.content.unwrap_or_default();
        match step.source.as_deref() {
            Some("USER_EXPLICIT") => {
                messages.push(Message {
                    role: "user".to_string(),
                    content: vec![ContentBlock {
                        block_type: "text".to_string(),
                        text: Some(extract_user_request(&text)),
                        tool_name: None,
                        tool_input: None,
                        tool_result: None,
                        is_error: false,
                    }],
                    timestamp: ts,
                    model: None,
                    usage: None,
                });
            }
            Some("MODEL") if step.step_type.as_deref() == Some("PLANNER_RESPONSE") => {
                if !text.trim().is_empty() {
                    messages.push(Message {
                        role: "assistant".to_string(),
                        content: vec![ContentBlock {
                            block_type: "text".to_string(),
                            text: Some(text),
                            tool_name: None,
                            tool_input: None,
                            tool_result: None,
                            is_error: false,
                        }],
                        timestamp: ts,
                        model: None,
                        usage: None,
                    });
                }
            }
            Some("MODEL") => {
                // Tool-shaped step (RUN_COMMAND, GREP_SEARCH, VIEW_FILE, …).
                // Unknown future types land here too — safe as a generic tool call.
                let name = step
                    .tool_calls
                    .and_then(|calls| calls.into_iter().next())
                    .and_then(|c| c.name)
                    .or(step.step_type)
                    .unwrap_or_else(|| "tool".to_string());
                messages.push(Message {
                    role: "assistant".to_string(),
                    content: vec![ContentBlock {
                        block_type: "tool_use".to_string(),
                        text: None,
                        tool_name: Some(name),
                        tool_input: Some(text.chars().take(500).collect()),
                        tool_result: None,
                        is_error: false,
                    }],
                    timestamp: ts,
                    model: None,
                    usage: None,
                });
            }
            _ => {} // SYSTEM and anything else: internal noise, skip
        }
    }

    // Project/timestamp come from the session index, not the transcript.
    let entry = list_from_root(root, 2000)
        .into_iter()
        .find(|e| e.session_id == session_id)?;
    let start_ms = messages
        .first()
        .and_then(|m| m.timestamp)
        .unwrap_or(entry.timestamp);
    let last_ms = messages
        .last()
        .and_then(|m| m.timestamp)
        .unwrap_or(start_ms);
    Some(SessionDetail {
        agent: "agy".to_string(),
        session_id: session_id.to_string(),
        messages,
        title: None,
        total_tokens: Default::default(),
        model: None,
        duration_ms: last_ms.checked_sub(start_ms),
        project_name: project_name(&entry.project),
        project: entry.project,
        timestamp: start_ms,
    })
}

impl SessionSource for AgySource {
    fn agent_id(&self) -> &'static str {
        "agy"
    }

    fn list(&self, limit: usize) -> Vec<SessionEntry> {
        let Some(root) = root() else { return vec![] };
        list_from_root(&root, limit)
    }

    fn get(&self, session_id: &str) -> Option<SessionDetail> {
        get_from_root(&root()?, session_id)
    }

    fn resume_command(&self, session_id: Option<&str>) -> String {
        match session_id {
            Some(id) => format!("agy --conversation {id}"),
            None => "agy".to_string(),
        }
    }

    fn transcript_file(&self, entry: &SessionEntry) -> Option<PathBuf> {
        Some(transcript_path(&root()?, &entry.session_id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_user_request_and_drops_metadata() {
        let raw = "<USER_REQUEST>\nwhat does the npx cmd do ?\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nThe current local time is: 2026-07-01.\n</ADDITIONAL_METADATA>";
        assert_eq!(extract_user_request(raw), "what does the npx cmd do ?");
    }

    #[test]
    fn falls_back_to_raw_text_when_unwrapped() {
        assert_eq!(extract_user_request("plain prompt"), "plain prompt");
    }

    #[test]
    fn resume_command_shape() {
        assert_eq!(
            AgySource.resume_command(Some("abc-123")),
            "agy --conversation abc-123"
        );
        assert_eq!(AgySource.resume_command(None), "agy");
    }

    #[test]
    fn groups_history_lines_by_conversation_and_skips_unattributed() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::write(
            root.join("history.jsonl"),
            concat!(
                r#"{"display":"first","timestamp":1000,"workspace":"/x/proj","conversationId":"c1"}"#, "\n",
                r#"{"display":"second","timestamp":2000,"workspace":"/x/proj","conversationId":"c1"}"#, "\n",
                r#"{"display":"orphan, no id"}"#, "\n",
                r#"{"display":"other","timestamp":1500,"workspace":"/y/proj2","conversationId":"c2"}"#, "\n",
            ),
        )
        .unwrap();

        let mut out = list_from_root(root, 10);
        out.sort_by_key(|e| e.session_id.clone());
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].session_id, "c1");
        assert_eq!(out[0].display, "first");
        assert_eq!(out[0].timestamp, 2000);
        assert_eq!(out[0].prompt_count, 2);
        assert_eq!(out[0].project, "/x/proj");
        assert_eq!(out[0].project_name, "proj");
        assert_eq!(out[1].session_id, "c2");
    }

    #[test]
    fn get_parses_transcript_user_tool_and_response_steps() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::write(
            root.join("history.jsonl"),
            r#"{"display":"fix the bug","timestamp":1000,"workspace":"/x/proj","conversationId":"c1"}"#,
        )
        .unwrap();
        let logs_dir = root
            .join("brain")
            .join("c1")
            .join(".system_generated")
            .join("logs");
        std::fs::create_dir_all(&logs_dir).unwrap();
        std::fs::write(
            logs_dir.join("transcript.jsonl"),
            concat!(
                r#"{"step_index":1,"source":"USER_EXPLICIT","type":"USER_INPUT","created_at":"2026-07-01T20:19:30Z","content":"<USER_REQUEST>\nfix the bug\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nnoise\n</ADDITIONAL_METADATA>"}"#, "\n",
                r#"{"step_index":2,"source":"MODEL","type":"RUN_COMMAND","created_at":"2026-07-01T20:19:31Z","content":"ran ls","tool_calls":[{"name":"exec_command"}]}"#, "\n",
                r#"{"step_index":3,"source":"SYSTEM","type":"SYSTEM_MESSAGE","created_at":"2026-07-01T20:19:32Z","content":"internal noise"}"#, "\n",
                r#"{"step_index":4,"source":"MODEL","type":"PLANNER_RESPONSE","created_at":"2026-07-01T20:19:33Z","content":"Fixed it."}"#, "\n",
            ),
        )
        .unwrap();

        let detail = get_from_root(root, "c1").unwrap();
        assert_eq!(detail.messages.len(), 3); // SYSTEM step skipped
        assert_eq!(detail.messages[0].role, "user");
        assert_eq!(
            detail.messages[0].content[0].text.as_deref(),
            Some("fix the bug")
        );
        assert_eq!(detail.messages[1].content[0].block_type, "tool_use");
        assert_eq!(
            detail.messages[1].content[0].tool_name.as_deref(),
            Some("exec_command")
        );
        assert_eq!(detail.messages[2].role, "assistant");
        assert_eq!(
            detail.messages[2].content[0].text.as_deref(),
            Some("Fixed it.")
        );
        assert_eq!(detail.project, "/x/proj");
    }

    #[test]
    fn list_respects_limit_and_orders_newest_first() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::write(
            root.join("history.jsonl"),
            concat!(
                r#"{"display":"a","timestamp":1000,"workspace":"/p","conversationId":"c1"}"#,
                "\n",
                r#"{"display":"b","timestamp":3000,"workspace":"/p","conversationId":"c2"}"#,
                "\n",
                r#"{"display":"c","timestamp":2000,"workspace":"/p","conversationId":"c3"}"#,
                "\n",
            ),
        )
        .unwrap();
        let out = list_from_root(root, 2);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].session_id, "c2");
        assert_eq!(out[1].session_id, "c3");
    }
}

#[cfg(test)]
mod smoke {
    use super::*;

    #[test]
    #[ignore]
    fn real_agy_smoke() {
        let root = root().expect("agy not installed on this machine");
        let list = list_from_root(&root, 10);
        println!("agy sessions: {}", list.len());
        for e in &list {
            println!(
                "  {} | {} | prompts:{} live:{}",
                e.project_name,
                e.display.chars().take(50).collect::<String>(),
                e.prompt_count,
                e.is_live
            );
        }
        if let Some(first) = list.first() {
            match get_from_root(&root, &first.session_id) {
                Some(d) => println!("get({}) -> {} messages", first.session_id, d.messages.len()),
                None => println!(
                    "get({}) -> no transcript.jsonl (expected for some)",
                    first.session_id
                ),
            }
        }
        // Try a few more to see transcript coverage
        let mut found = 0;
        for e in list.iter().take(10) {
            if get_from_root(&root, &e.session_id).is_some() {
                found += 1;
            }
        }
        println!("transcripts found: {}/10", found);
    }
}
