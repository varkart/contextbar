//! Gemini CLI session source.
//!
//! Gemini stores sessions under `~/.gemini/tmp/<project-dir>/chats/`, where
//! `<project-dir>` is a path hash (or plain name for some forks). A sibling
//! `.project_root` file holds the real project path — dirs without it are
//! skipped (unattributable). Two on-disk formats exist:
//!
//! - Older `.json`: one object `{sessionId, startTime, lastUpdated, messages}`.
//! - Newer `.jsonl`: append-only stream of header lines
//!   `{sessionId, startTime, lastUpdated, kind}` interleaved with full-state
//!   snapshots `{"$set":{"messages":[…]}}` — the LAST `$set` is the final
//!   transcript. The first user message is an injected `<session_context>`
//!   preamble and is filtered out.

use super::{file_mtime_ms, is_recently_modified, rfc3339_to_ms, SessionSource};
use crate::engine::history::types::{
    ContentBlock, Message, SessionDetail, SessionEntry, TokenUsage,
};
use serde_json::Value;
use std::io::{BufRead, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

/// Bounded read when listing (.jsonl first snapshot lives at the top).
const LIST_SCAN_BYTES: u64 = 512 * 1024;
/// Full-parse cap; larger .jsonl files fall back to a tail read of this size.
const GET_SCAN_BYTES: u64 = 25 * 1024 * 1024;

pub struct GeminiSource;

/// (chat file, project path) pairs across all attributable project dirs.
fn chat_files() -> Vec<(PathBuf, String)> {
    let Some(home) = dirs::home_dir() else {
        return vec![];
    };
    let tmp = home.join(".gemini").join("tmp");
    let mut out = Vec::new();
    let Ok(dirs) = std::fs::read_dir(&tmp) else {
        return vec![];
    };
    for dir in dirs.flatten() {
        let dir = dir.path();
        if !dir.is_dir() {
            continue;
        }
        let Ok(project) = std::fs::read_to_string(dir.join(".project_root")) else {
            continue; // no way to attribute sessions to a project
        };
        let project = project.trim().to_string();
        if project.is_empty() {
            continue;
        }
        let Ok(files) = std::fs::read_dir(dir.join("chats")) else {
            continue;
        };
        for f in files.flatten() {
            let p = f.path();
            let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
            if p.is_file() && (ext == "json" || ext == "jsonl") {
                out.push((p, project.clone()));
            }
        }
    }
    out
}

fn text_of(content: &Value) -> String {
    match content {
        Value::String(s) => s.clone(),
        Value::Array(parts) => parts
            .iter()
            .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join(""),
        _ => String::new(),
    }
}

fn is_context_preamble(text: &str) -> bool {
    text.trim_start().starts_with("<session_context")
}

/// First real user text + user-message count from a messages array.
fn scan_messages(messages: &[Value]) -> (String, u32) {
    let mut display = String::new();
    let mut prompts = 0u32;
    for m in messages {
        if m.get("type").and_then(|t| t.as_str()) == Some("user") {
            let text = text_of(m.get("content").unwrap_or(&Value::Null));
            if is_context_preamble(&text) {
                continue;
            }
            prompts += 1;
            if display.is_empty() && !text.trim().is_empty() {
                display = text.trim().chars().take(300).collect();
            }
        }
    }
    (display, prompts)
}

struct Summary {
    session_id: String,
    display: String,
    prompt_count: u32,
    start_ms: u64,
}

fn summarize(path: &Path) -> Option<Summary> {
    let ext = path.extension().and_then(|e| e.to_str())?;
    if ext == "json" {
        if path.metadata().ok()?.len() > GET_SCAN_BYTES {
            return None;
        }
        let v: Value = serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()?;
        let (display, prompts) = scan_messages(v.get("messages")?.as_array()?);
        return Some(Summary {
            session_id: v.get("sessionId")?.as_str()?.to_string(),
            display,
            prompt_count: prompts,
            start_ms: v
                .get("startTime")
                .and_then(|t| t.as_str())
                .and_then(rfc3339_to_ms)
                .unwrap_or(0),
        });
    }
    // .jsonl: header line + first $set within the bounded read
    let file = std::fs::File::open(path).ok()?;
    let reader = std::io::BufReader::new(file.take(LIST_SCAN_BYTES));
    let mut session_id = None;
    let mut start_ms = 0u64;
    let mut display = String::new();
    let mut prompts = 0u32;
    for line in reader.lines().map_while(Result::ok) {
        let Ok(v) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if session_id.is_none() {
            if let Some(id) = v.get("sessionId").and_then(|s| s.as_str()) {
                session_id = Some(id.to_string());
                start_ms = v
                    .get("startTime")
                    .and_then(|t| t.as_str())
                    .and_then(rfc3339_to_ms)
                    .unwrap_or(0);
                continue;
            }
        }
        if let Some(messages) = v.pointer("/$set/messages").and_then(|m| m.as_array()) {
            let (d, p) = scan_messages(messages);
            display = d;
            prompts = p;
            break; // first snapshot is enough for a summary
        }
    }
    Some(Summary {
        session_id: session_id?,
        display,
        prompt_count: prompts,
        start_ms,
    })
}

/// Latest full message array from a .jsonl session (last `$set` snapshot).
fn latest_snapshot(path: &Path) -> Option<Vec<Value>> {
    let size = path.metadata().ok()?.len();
    let content = if size <= GET_SCAN_BYTES {
        std::fs::read_to_string(path).ok()?
    } else {
        // Tail read: the last snapshot is at the end of the file.
        let mut f = std::fs::File::open(path).ok()?;
        f.seek(SeekFrom::End(-(GET_SCAN_BYTES as i64))).ok()?;
        let mut buf = String::new();
        std::io::BufReader::new(f).read_to_string(&mut buf).ok()?;
        // Drop the first (probably partial) line
        buf.splitn(2, '\n').nth(1).unwrap_or("").to_string()
    };
    let mut last: Option<Vec<Value>> = None;
    for line in content.lines() {
        if !line.starts_with("{\"$set\"") {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<Value>(line) {
            if let Some(m) = v.pointer("/$set/messages").and_then(|m| m.as_array()) {
                last = Some(m.clone());
            }
        }
    }
    last
}

fn messages_to_detail(raw: &[Value]) -> (Vec<Message>, TokenUsage) {
    let mut out = Vec::new();
    let mut usage = TokenUsage::default();
    for m in raw {
        let ts = m
            .get("timestamp")
            .and_then(|t| t.as_str())
            .and_then(rfc3339_to_ms);
        // Per-message token stats when recorded (newer CLI versions)
        if let Some(t) = m.get("tokens") {
            usage.input_tokens += t.get("input").and_then(|v| v.as_u64()).unwrap_or(0);
            usage.output_tokens += t.get("output").and_then(|v| v.as_u64()).unwrap_or(0);
            usage.cache_read_tokens += t.get("cached").and_then(|v| v.as_u64()).unwrap_or(0);
        }
        let mtype = m.get("type").and_then(|t| t.as_str()).unwrap_or("");
        let role = match mtype {
            "user" => "user",
            "gemini" | "model" | "assistant" => "assistant",
            _ => {
                // Tool records vary by version — surface anything with a name
                if let Some(name) = m
                    .get("toolCall")
                    .and_then(|t| t.get("name"))
                    .or_else(|| m.get("name"))
                    .and_then(|n| n.as_str())
                {
                    out.push(Message {
                        role: "assistant".to_string(),
                        content: vec![ContentBlock {
                            block_type: "tool_use".to_string(),
                            text: None,
                            tool_name: Some(name.to_string()),
                            tool_input: None,
                            tool_result: None,
                            is_error: false,
                        }],
                        timestamp: ts,
                        model: None,
                        usage: None,
                    });
                }
                continue;
            }
        };
        let text = text_of(m.get("content").unwrap_or(&Value::Null));
        if text.trim().is_empty() || is_context_preamble(&text) {
            continue;
        }
        out.push(Message {
            role: role.to_string(),
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
    (out, usage)
}

fn project_name(path: &str) -> String {
    path.trim_end_matches('/')
        .rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or(path)
        .to_string()
}

impl SessionSource for GeminiSource {
    fn agent_id(&self) -> &'static str {
        "gemini"
    }

    fn list(&self, limit: usize) -> Vec<SessionEntry> {
        // Sort by mtime (metadata only) BEFORE parsing — there can be
        // thousands of chat files; we only open the newest `limit`.
        let mut files = chat_files();
        files.sort_by_key(|(p, _)| std::cmp::Reverse(file_mtime_ms(p).unwrap_or(0)));

        let mut out: Vec<SessionEntry> = Vec::new();
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        for (path, project) in files {
            if out.len() >= limit {
                break;
            }
            let Some(s) = summarize(&path) else { continue };
            // A session can exist as both auto-saved .jsonl and /chat-saved
            // .json — newest file wins (files are mtime-sorted).
            if !seen.insert(s.session_id.clone()) {
                continue;
            }
            if s.display.is_empty() && s.prompt_count == 0 {
                continue; // context-only session, nothing to show
            }
            out.push(SessionEntry {
                agent: "gemini".to_string(),
                session_id: s.session_id,
                display: if s.display.is_empty() {
                    "(no prompt)".into()
                } else {
                    s.display
                },
                timestamp: file_mtime_ms(&path).unwrap_or(s.start_ms),
                project_name: project_name(&project),
                project,
                total_tokens: 0,
                model: None,
                duration_minutes: None,
                is_live: is_recently_modified(&path),
                error_count: 0,
                prompt_count: s.prompt_count.max(1),
            });
        }
        out
    }

    fn get(&self, session_id: &str) -> Option<SessionDetail> {
        // Filenames embed a short id prefix; verify by reading the meta.
        let short: String = session_id.chars().take(8).collect();
        for (path, project) in chat_files() {
            let name = path.file_name().map(|n| n.to_string_lossy().to_string())?;
            if !name.contains(&short) {
                continue;
            }
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            let (meta_id, start_ms, raw_messages) = if ext == "json" {
                let v: Value = serde_json::from_str(&std::fs::read_to_string(&path).ok()?).ok()?;
                let id = v.get("sessionId")?.as_str()?.to_string();
                let start = v
                    .get("startTime")
                    .and_then(|t| t.as_str())
                    .and_then(rfc3339_to_ms)
                    .unwrap_or(0);
                let msgs = v.get("messages")?.as_array()?.clone();
                (id, start, msgs)
            } else {
                let file = std::fs::File::open(&path).ok()?;
                let mut first = String::new();
                std::io::BufReader::new(file).read_line(&mut first).ok()?;
                let header: Value = serde_json::from_str(&first).ok()?;
                let id = header.get("sessionId")?.as_str()?.to_string();
                if id != session_id {
                    continue;
                }
                let start = header
                    .get("startTime")
                    .and_then(|t| t.as_str())
                    .and_then(rfc3339_to_ms)
                    .unwrap_or(0);
                (id, start, latest_snapshot(&path)?)
            };
            if meta_id != session_id {
                continue;
            }
            let (messages, usage) = messages_to_detail(&raw_messages);
            let last_ms = messages
                .iter()
                .filter_map(|m| m.timestamp)
                .max()
                .unwrap_or(start_ms);
            return Some(SessionDetail {
                agent: "gemini".to_string(),
                session_id: session_id.to_string(),
                messages,
                total_tokens: usage,
                model: None,
                duration_ms: last_ms.checked_sub(start_ms),
                project_name: project_name(&project),
                project,
                timestamp: start_ms,
            });
        }
        None
    }

    fn resume_command(&self, _session_id: Option<&str>) -> String {
        // Per-id resume is only exposed through gemini's interactive browser;
        // --resume reopens the most recent session in this project.
        "gemini --resume".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const JSONL: &str = concat!(
        r#"{"sessionId":"aaaa1111-2222-3333-4444-555566667777","projectHash":"h","startTime":"2026-06-16T15:28:41.807Z","lastUpdated":"2026-06-16T15:28:41.807Z","kind":"main"}"#,
        "\n",
        r#"{"$set":{"messages":[{"id":"1","timestamp":"2026-06-16T15:28:41.807Z","type":"user","content":[{"text":"<session_context>injected setup</session_context>"}]},{"id":"2","timestamp":"2026-06-16T15:28:50.000Z","type":"user","content":[{"text":"build the parser"}]}]}}"#,
        "\n",
        r#"{"sessionId":"aaaa1111-2222-3333-4444-555566667777","projectHash":"h","startTime":"2026-06-16T15:28:41.807Z","lastUpdated":"2026-06-16T15:30:00.000Z","kind":"main"}"#,
        "\n",
        r#"{"$set":{"messages":[{"id":"1","timestamp":"2026-06-16T15:28:41.807Z","type":"user","content":[{"text":"<session_context>injected setup</session_context>"}]},{"id":"2","timestamp":"2026-06-16T15:28:50.000Z","type":"user","content":[{"text":"build the parser"}]},{"id":"3","timestamp":"2026-06-16T15:29:10.000Z","type":"gemini","content":[{"text":"Done — parser built."}]},{"id":"4","timestamp":"2026-06-16T15:29:12.000Z","type":"info","content":"noise"}]}}"#,
        "\n",
    );

    #[test]
    fn jsonl_summary_skips_context_preamble() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("session-x-aaaa1111.jsonl");
        std::fs::write(&p, JSONL).unwrap();
        let s = summarize(&p).unwrap();
        assert_eq!(s.session_id, "aaaa1111-2222-3333-4444-555566667777");
        assert_eq!(s.display, "build the parser");
        assert_eq!(s.prompt_count, 1);
    }

    #[test]
    fn jsonl_latest_snapshot_wins() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("session-x-aaaa1111.jsonl");
        std::fs::write(&p, JSONL).unwrap();
        let msgs = latest_snapshot(&p).unwrap();
        assert_eq!(msgs.len(), 4);
        let (detail, _) = messages_to_detail(&msgs);
        // preamble + info filtered; user + gemini kept
        assert_eq!(detail.len(), 2);
        assert_eq!(detail[0].role, "user");
        assert_eq!(detail[1].role, "assistant");
    }

    #[test]
    fn json_format_and_string_content() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("session-y-bbbb2222.json");
        std::fs::write(
            &p,
            r#"{"sessionId":"bbbb2222-0000-0000-0000-000000000000","startTime":"2026-01-19T01:05:32.651Z","lastUpdated":"2026-01-19T01:06:29.826Z","messages":[{"id":"1","timestamp":"2026-01-19T01:05:32.651Z","type":"user","content":"investigate the codebase"},{"id":"2","timestamp":"2026-01-19T01:06:00.000Z","type":"gemini","content":"Here is what I found."}]}"#,
        )
        .unwrap();
        let s = summarize(&p).unwrap();
        assert_eq!(s.display, "investigate the codebase");
        assert_eq!(s.prompt_count, 1);
    }
}
