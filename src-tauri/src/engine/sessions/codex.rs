//! Codex CLI session source.
//!
//! Codex stores one JSONL "rollout" per session under
//! `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl`. Line 1 is
//! `session_meta` (id, cwd, timestamp); the stream then mixes `event_msg`
//! entries (user_message / agent_message / token_count) with `response_item`
//! entries (function_call etc.). Parsing is tolerant: unknown line types are
//! skipped so format additions don't break us.

use super::{file_mtime_ms, is_recently_modified, rfc3339_to_ms, SessionSource};
use crate::engine::history::types::{
    ContentBlock, Message, SessionDetail, SessionEntry, TokenUsage,
};
use serde_json::Value;
use std::io::BufRead;
use std::path::{Path, PathBuf};

/// Cap per-file read during listing — summaries live near the top.
const LIST_SCAN_BYTES: u64 = 5 * 1024 * 1024;
/// Hard cap for full transcript parsing.
const GET_SCAN_BYTES: u64 = 25 * 1024 * 1024;

pub struct CodexSource;

fn sessions_root() -> Option<PathBuf> {
    let root = dirs::home_dir()?.join(".codex").join("sessions");
    root.is_dir().then_some(root)
}

/// All rollout files, newest first (directory names sort chronologically).
fn rollout_files(limit_hint: usize) -> Vec<PathBuf> {
    let Some(root) = sessions_root() else {
        return vec![];
    };
    let mut days: Vec<PathBuf> = Vec::new();
    let mut sorted_dirs = |p: &Path| -> Vec<PathBuf> {
        let mut v: Vec<PathBuf> = std::fs::read_dir(p)
            .map(|it| {
                it.flatten()
                    .map(|e| e.path())
                    .filter(|p| p.is_dir())
                    .collect()
            })
            .unwrap_or_default();
        v.sort();
        v.reverse();
        v
    };
    'outer: for year in sorted_dirs(&root) {
        for month in sorted_dirs(&year) {
            for day in sorted_dirs(&month) {
                days.push(day);
                // Generous margin: several sessions per day is typical.
                if days.len() > limit_hint {
                    break 'outer;
                }
            }
        }
    }
    let mut files: Vec<PathBuf> = Vec::new();
    for day in days {
        let mut day_files: Vec<PathBuf> = std::fs::read_dir(&day)
            .map(|it| {
                it.flatten()
                    .map(|e| e.path())
                    .filter(|p| {
                        p.extension().is_some_and(|e| e == "jsonl")
                            && p.file_name()
                                .is_some_and(|n| n.to_string_lossy().starts_with("rollout-"))
                    })
                    .collect()
            })
            .unwrap_or_default();
        day_files.sort();
        day_files.reverse();
        files.extend(day_files);
        if files.len() >= limit_hint {
            break;
        }
    }
    files
}

struct Summary {
    id: String,
    cwd: String,
    ts_ms: u64,
    display: String,
    prompt_count: u32,
    total_tokens: u64,
    model: Option<String>,
    error_count: u32,
}

fn line_reader(path: &Path, cap: u64) -> Option<impl Iterator<Item = String>> {
    let file = std::fs::File::open(path).ok()?;
    let reader = std::io::BufReader::new(std::io::Read::take(file, cap));
    Some(reader.lines().map_while(Result::ok))
}

fn parse_summary(path: &Path) -> Option<Summary> {
    let mut lines = line_reader(path, LIST_SCAN_BYTES)?;
    let meta: Value = serde_json::from_str(&lines.next()?).ok()?;
    if meta.get("type")?.as_str()? != "session_meta" {
        return None;
    }
    let payload = meta.get("payload")?;
    let id = payload.get("id")?.as_str()?.to_string();
    let cwd = payload
        .get("cwd")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let ts_ms = payload
        .get("timestamp")
        .and_then(|v| v.as_str())
        .and_then(rfc3339_to_ms)
        .or_else(|| file_mtime_ms(path))
        .unwrap_or(0);

    let mut display = String::new();
    let mut prompt_count = 0u32;
    let mut total_tokens = 0u64;
    let mut model = None;
    let mut error_count = 0u32;
    for line in lines {
        let Ok(v) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let (t, p) = (v.get("type").and_then(|t| t.as_str()), v.get("payload"));
        let Some(p) = p else { continue };
        match (t, p.get("type").and_then(|t| t.as_str())) {
            (Some("event_msg"), Some("user_message")) => {
                prompt_count += 1;
                if display.is_empty() {
                    if let Some(m) = p.get("message").and_then(|m| m.as_str()) {
                        display = m.chars().take(300).collect();
                    }
                }
            }
            (Some("event_msg"), Some("token_count")) => {
                if let Some(total) = p
                    .pointer("/info/total_token_usage/total_tokens")
                    .and_then(|v| v.as_u64())
                {
                    total_tokens = total;
                }
            }
            (Some("event_msg"), Some("error")) => error_count += 1,
            (Some("turn_context"), _) => {
                if model.is_none() {
                    model = p.get("model").and_then(|m| m.as_str()).map(String::from);
                }
            }
            _ => {}
        }
    }
    Some(Summary {
        id,
        cwd,
        ts_ms,
        display: if display.is_empty() {
            "(no prompt)".into()
        } else {
            display
        },
        prompt_count: prompt_count.max(1),
        total_tokens,
        model,
        error_count,
    })
}

fn project_name(path: &str) -> String {
    path.trim_end_matches('/')
        .rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or(path)
        .to_string()
}

fn find_session_file(session_id: &str) -> Option<PathBuf> {
    rollout_files(usize::MAX).into_iter().find(|p| {
        p.file_name()
            .is_some_and(|n| n.to_string_lossy().contains(session_id))
    })
}

impl SessionSource for CodexSource {
    fn agent_id(&self) -> &'static str {
        "codex"
    }

    fn list(&self, limit: usize) -> Vec<SessionEntry> {
        let mut out = Vec::new();
        for path in rollout_files(limit) {
            if out.len() >= limit {
                break;
            }
            let Some(s) = parse_summary(&path) else {
                continue;
            };
            // Last activity = file mtime (rollout is append-only).
            let timestamp = file_mtime_ms(&path).unwrap_or(s.ts_ms);
            out.push(SessionEntry {
                agent: "codex".to_string(),
                session_id: s.id,
                display: s.display,
                timestamp,
                project_name: project_name(&s.cwd),
                project: s.cwd,
                total_tokens: s.total_tokens,
                model: s.model,
                duration_minutes: None,
                is_live: is_recently_modified(&path),
                error_count: s.error_count,
                prompt_count: s.prompt_count,
            });
        }
        out
    }

    fn get(&self, session_id: &str) -> Option<SessionDetail> {
        let path = find_session_file(session_id)?;
        let mut lines = line_reader(&path, GET_SCAN_BYTES)?;
        let meta: Value = serde_json::from_str(&lines.next()?).ok()?;
        let payload = meta.get("payload")?;
        let cwd = payload
            .get("cwd")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let start_ms = payload
            .get("timestamp")
            .and_then(|v| v.as_str())
            .and_then(rfc3339_to_ms)
            .unwrap_or(0);

        let mut messages: Vec<Message> = Vec::new();
        let mut usage = TokenUsage::default();
        let mut model = None;
        let mut last_ms = start_ms;
        for line in lines {
            let Ok(v) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            let ts = v
                .get("timestamp")
                .and_then(|t| t.as_str())
                .and_then(rfc3339_to_ms);
            if let Some(t) = ts {
                last_ms = last_ms.max(t);
            }
            let Some(p) = v.get("payload") else { continue };
            let text_msg = |role: &str, text: &str| Message {
                role: role.to_string(),
                content: vec![ContentBlock {
                    block_type: "text".to_string(),
                    text: Some(text.to_string()),
                    tool_name: None,
                    tool_input: None,
                    tool_result: None,
                    is_error: false,
                }],
                timestamp: ts,
                model: None,
                usage: None,
            };
            match (
                v.get("type").and_then(|t| t.as_str()),
                p.get("type").and_then(|t| t.as_str()),
            ) {
                (Some("event_msg"), Some("user_message")) => {
                    if let Some(m) = p.get("message").and_then(|m| m.as_str()) {
                        messages.push(text_msg("user", m));
                    }
                }
                (Some("event_msg"), Some("agent_message")) => {
                    if let Some(m) = p.get("message").and_then(|m| m.as_str()) {
                        messages.push(text_msg("assistant", m));
                    }
                }
                (Some("event_msg"), Some("token_count")) => {
                    if let Some(info) = p.pointer("/info/total_token_usage") {
                        usage = TokenUsage {
                            input_tokens: info
                                .get("input_tokens")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0),
                            output_tokens: info
                                .get("output_tokens")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0),
                            cache_read_tokens: info
                                .get("cached_input_tokens")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0),
                            cache_creation_tokens: 0,
                        };
                    }
                }
                (Some("response_item"), Some("function_call")) => {
                    let name = p
                        .get("name")
                        .and_then(|n| n.as_str())
                        .unwrap_or("tool")
                        .to_string();
                    let input = p
                        .get("arguments")
                        .and_then(|a| a.as_str())
                        .map(|a| a.chars().take(500).collect::<String>());
                    messages.push(Message {
                        role: "assistant".to_string(),
                        content: vec![ContentBlock {
                            block_type: "tool_use".to_string(),
                            text: None,
                            tool_name: Some(name),
                            tool_input: input,
                            tool_result: None,
                            is_error: false,
                        }],
                        timestamp: ts,
                        model: None,
                        usage: None,
                    });
                }
                (Some("turn_context"), _) => {
                    if model.is_none() {
                        model = p.get("model").and_then(|m| m.as_str()).map(String::from);
                    }
                }
                _ => {}
            }
        }

        Some(SessionDetail {
            agent: "codex".to_string(),
            session_id: session_id.to_string(),
            messages,
            total_tokens: usage,
            model,
            duration_ms: last_ms.checked_sub(start_ms),
            project_name: project_name(&cwd),
            project: cwd,
            timestamp: start_ms,
        })
    }

    fn resume_command(&self, session_id: Option<&str>) -> String {
        match session_id {
            Some(id) => format!("codex resume {id}"),
            None => "codex".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = concat!(
        r#"{"timestamp":"2026-06-11T21:39:19.749Z","type":"session_meta","payload":{"id":"abc-123","timestamp":"2026-06-11T21:38:38.258Z","cwd":"/Users/x/proj","originator":"codex-tui","cli_version":"0.139.0"}}"#,
        "\n",
        r#"{"timestamp":"2026-06-11T21:39:20.000Z","type":"event_msg","payload":{"type":"user_message","message":"fix the login bug"}}"#,
        "\n",
        r#"{"timestamp":"2026-06-11T21:39:21.000Z","type":"turn_context","payload":{"model":"gpt-5-codex"}}"#,
        "\n",
        r#"{"timestamp":"2026-06-11T21:39:25.000Z","type":"response_item","payload":{"type":"function_call","name":"exec_command","arguments":"{\"cmd\":\"ls\"}"}}"#,
        "\n",
        r#"{"timestamp":"2026-06-11T21:39:30.000Z","type":"event_msg","payload":{"type":"agent_message","message":"Fixed it."}}"#,
        "\n",
        r#"{"timestamp":"2026-06-11T21:39:31.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":1000,"cached_input_tokens":600,"output_tokens":50,"total_tokens":1050}}}}"#,
        "\n",
        r#"{"timestamp":"2026-06-11T21:40:00.000Z","type":"event_msg","payload":{"type":"user_message","message":"thanks"}}"#,
        "\n",
    );

    fn fixture_file(dir: &std::path::Path) -> PathBuf {
        let p = dir.join("rollout-2026-06-11T21-38-38-abc-123.jsonl");
        std::fs::write(&p, FIXTURE).unwrap();
        p
    }

    #[test]
    fn parses_rollout_summary() {
        let dir = tempfile::tempdir().unwrap();
        let p = fixture_file(dir.path());
        let s = parse_summary(&p).unwrap();
        assert_eq!(s.id, "abc-123");
        assert_eq!(s.cwd, "/Users/x/proj");
        assert_eq!(s.display, "fix the login bug");
        assert_eq!(s.prompt_count, 2);
        assert_eq!(s.total_tokens, 1050);
        assert_eq!(s.model.as_deref(), Some("gpt-5-codex"));
    }

    #[test]
    fn tolerates_unknown_line_types() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("rollout-x.jsonl");
        std::fs::write(
            &p,
            format!(
                "{}\n{{\"type\":\"future_thing\",\"payload\":{{}}}}\nnot json at all\n",
                FIXTURE.lines().next().unwrap()
            ),
        )
        .unwrap();
        let s = parse_summary(&p).unwrap();
        assert_eq!(s.id, "abc-123");
        assert_eq!(s.display, "(no prompt)");
    }

    #[test]
    fn resume_command_shape() {
        assert_eq!(CodexSource.resume_command(Some("abc")), "codex resume abc");
        assert_eq!(CodexSource.resume_command(None), "codex");
    }
}
