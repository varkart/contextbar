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

use super::{is_recently_modified, rfc3339_to_ms, SessionSource};
use crate::engine::history::types::{
    ContentBlock, Message, SessionDetail, SessionEntry, TokenUsage,
};
use serde_json::Value;
use std::io::{BufRead, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

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

/// Build the session index from each project's `logs.json` — a small
/// append-only prompt log `[{sessionId, messageId, type, message, timestamp}]`,
/// the direct analogue of Claude's history.jsonl. Chat files are only touched
/// for the newest sessions' live check and for full transcripts in `get()`.
fn list_from_tmp(tmp: &Path) -> Vec<SessionEntry> {
    let mut out: Vec<SessionEntry> = Vec::new();
    let Ok(dirs) = std::fs::read_dir(tmp) else {
        return out;
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    for dir in dirs.flatten() {
        let dir = dir.path();
        if !dir.is_dir() {
            continue;
        }
        let Ok(project) = std::fs::read_to_string(dir.join(".project_root")) else {
            continue;
        };
        let project = project.trim().to_string();
        if project.is_empty() {
            continue;
        }
        let Ok(raw) = std::fs::read_to_string(dir.join("logs.json")) else {
            continue;
        };
        let Ok(entries) = serde_json::from_str::<Vec<Value>>(&raw) else {
            continue;
        };

        // Group prompts by sessionId: first = display, last = activity time.
        let mut sessions: std::collections::HashMap<String, SessionEntry> =
            std::collections::HashMap::new();
        for e in &entries {
            if e.get("type").and_then(|t| t.as_str()) != Some("user") {
                continue;
            }
            let Some(id) = e.get("sessionId").and_then(|s| s.as_str()) else {
                continue;
            };
            let msg = e.get("message").and_then(|m| m.as_str()).unwrap_or("");
            let ts = e
                .get("timestamp")
                .and_then(|t| t.as_str())
                .and_then(rfc3339_to_ms)
                .unwrap_or(0);
            match sessions.get_mut(id) {
                Some(entry) => {
                    entry.timestamp = entry.timestamp.max(ts);
                    entry.prompt_count += 1;
                }
                None => {
                    sessions.insert(
                        id.to_string(),
                        SessionEntry {
                            agent: "gemini".to_string(),
                            session_id: id.to_string(),
                            display: msg.trim().chars().take(300).collect(),
                            timestamp: ts,
                            project_name: project_name(&project),
                            project: project.clone(),
                            total_tokens: 0,
                            model: None,
                            duration_minutes: None,
                            is_live: false,
                            error_count: 0,
                            prompt_count: 1,
                        },
                    );
                }
            }
        }

        // Live check only for sessions active within the last hour — needs a
        // chat-file mtime lookup, so keep it bounded.
        let chats = dir.join("chats");
        for entry in sessions.values_mut() {
            if now.saturating_sub(entry.timestamp) > 3_600_000 {
                continue;
            }
            let short: String = entry.session_id.chars().take(8).collect();
            if let Ok(files) = std::fs::read_dir(&chats) {
                entry.is_live = files.flatten().any(|f| {
                    f.file_name().to_string_lossy().contains(&short)
                        && is_recently_modified(&f.path())
                });
            }
        }

        out.extend(sessions.into_values());
    }
    out
}

impl SessionSource for GeminiSource {
    fn agent_id(&self) -> &'static str {
        "gemini"
    }

    fn list(&self, limit: usize) -> Vec<SessionEntry> {
        let Some(home) = dirs::home_dir() else {
            return vec![];
        };
        let mut out = list_from_tmp(&home.join(".gemini").join("tmp"));
        out.sort_by_key(|e| std::cmp::Reverse(e.timestamp));
        out.truncate(limit);
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
    fn lists_sessions_from_logs_json() {
        let tmp = tempfile::tempdir().unwrap();
        let proj = tmp.path().join("somehash");
        std::fs::create_dir_all(proj.join("chats")).unwrap();
        std::fs::write(proj.join(".project_root"), "/Users/x/myproj\n").unwrap();
        std::fs::write(
            proj.join("logs.json"),
            r#"[
              {"sessionId":"s1","messageId":0,"type":"user","message":"first prompt","timestamp":"2026-03-18T00:20:00.000Z"},
              {"sessionId":"s1","messageId":1,"type":"user","message":"second prompt","timestamp":"2026-03-18T00:23:18.000Z"},
              {"sessionId":"s2","messageId":0,"type":"user","message":"other session","timestamp":"2026-03-19T10:00:00.000Z"}
            ]"#,
        )
        .unwrap();
        // Dir without .project_root is skipped
        let orphan = tmp.path().join("orphan");
        std::fs::create_dir_all(orphan.join("chats")).unwrap();
        std::fs::write(orphan.join("logs.json"), r#"[{"sessionId":"x","messageId":0,"type":"user","message":"hidden","timestamp":"2026-03-01T00:00:00.000Z"}]"#).unwrap();

        let mut out = list_from_tmp(tmp.path());
        out.sort_by_key(|e| e.session_id.clone());
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].session_id, "s1");
        assert_eq!(out[0].display, "first prompt");
        assert_eq!(out[0].prompt_count, 2);
        assert_eq!(out[0].project, "/Users/x/myproj");
        assert_eq!(out[0].project_name, "myproj");
        // timestamp = last activity
        assert!(out[0].timestamp > rfc3339_to_ms("2026-03-18T00:22:00.000Z").unwrap());
        assert_eq!(out[1].session_id, "s2");
    }
}
