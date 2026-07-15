use super::index::{project_name, session_file_path};
use super::types::{ContentBlock, Message, SessionDetail, TokenUsage};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashSet;
use std::io::{BufRead, BufReader};
use std::path::Path;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawEntry {
    #[serde(rename = "type")]
    entry_type: Option<String>,
    message: Option<RawMessage>,
    timestamp: Option<Value>,
}

#[derive(Deserialize)]
struct RawMessage {
    id: Option<String>,
    content: Option<Value>,
    model: Option<String>,
    usage: Option<RawUsage>,
}

#[derive(Deserialize, Default)]
struct RawUsage {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    cache_read_input_tokens: Option<u64>,
    cache_creation_input_tokens: Option<u64>,
}

pub fn get_session(
    home: &Path,
    session_id: &str,
    project: &str,
    timestamp: u64,
) -> Option<SessionDetail> {
    let session_file = session_file_path(home, project, session_id);
    let file = std::fs::File::open(&session_file).ok()?;
    let reader = BufReader::new(file);

    let mut messages: Vec<Message> = Vec::new();
    let mut seen_ids: HashSet<String> = HashSet::new();
    let mut total_usage = TokenUsage::default();
    let mut overall_model: Option<String> = None;
    let mut first_ts: Option<u64> = None;
    let mut last_ts: Option<u64> = None;
    let mut error_count: u32 = 0;

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let entry: RawEntry = match serde_json::from_str(line) {
            Ok(e) => e,
            Err(_) => continue,
        };

        match entry.entry_type.as_deref() {
            Some("permission-mode") | Some("file-history-snapshot") | None => continue,
            Some("user") => {
                let msg = match &entry.message {
                    Some(m) => m,
                    None => continue,
                };
                let ts = parse_timestamp(&entry.timestamp);
                if let Some(t) = ts {
                    first_ts.get_or_insert(t);
                    last_ts = Some(t);
                }
                let content = parse_content_blocks(msg.content.as_ref(), &mut error_count);
                messages.push(Message {
                    role: "user".to_string(),
                    content,
                    timestamp: ts,
                    model: None,
                    usage: None,
                });
            }
            Some("assistant") => {
                let msg = match &entry.message {
                    Some(m) => m,
                    None => continue,
                };

                // Dedup streaming entries by message.id
                if let Some(msg_id) = &msg.id {
                    if !seen_ids.insert(msg_id.clone()) {
                        continue;
                    }
                }

                let ts = parse_timestamp(&entry.timestamp);
                if let Some(t) = ts {
                    first_ts.get_or_insert(t);
                    last_ts = Some(t);
                }

                let model = msg.model.as_deref().map(shorten_model_name);
                if overall_model.is_none() {
                    overall_model = model.clone();
                }

                let usage = msg.usage.as_ref().map(|u| {
                    let tok = TokenUsage {
                        input_tokens: u.input_tokens.unwrap_or(0),
                        output_tokens: u.output_tokens.unwrap_or(0),
                        cache_read_tokens: u.cache_read_input_tokens.unwrap_or(0),
                        cache_creation_tokens: u.cache_creation_input_tokens.unwrap_or(0),
                    };
                    total_usage.input_tokens += tok.input_tokens;
                    total_usage.output_tokens += tok.output_tokens;
                    total_usage.cache_read_tokens += tok.cache_read_tokens;
                    total_usage.cache_creation_tokens += tok.cache_creation_tokens;
                    tok
                });

                let content = parse_content_blocks(msg.content.as_ref(), &mut error_count);
                messages.push(Message {
                    role: "assistant".to_string(),
                    content,
                    timestamp: ts,
                    model,
                    usage,
                });
            }
            _ => {}
        }
    }

    let duration_ms = match (first_ts, last_ts) {
        (Some(f), Some(l)) if l > f => Some(l - f),
        _ => None,
    };

    Some(SessionDetail {
        agent: "claude".to_string(),
        session_id: session_id.to_string(),
        messages,
        total_tokens: total_usage,
        model: overall_model,
        duration_ms,
        project: project.to_string(),
        project_name: project_name(project),
        timestamp,
    })
}

fn parse_timestamp(ts: &Option<Value>) -> Option<u64> {
    match ts {
        Some(Value::Number(n)) => n.as_u64().or_else(|| n.as_f64().map(|f| f as u64)),
        Some(Value::String(s)) => s.parse::<u64>().ok(),
        _ => None,
    }
}

fn shorten_model_name(model: &str) -> String {
    let stripped = model.trim_start_matches("claude-");
    let parts: Vec<&str> = stripped.split('-').collect();
    // Strip trailing 8-digit date suffix
    if let Some(last) = parts.last() {
        if last.len() == 8 && last.chars().all(|c| c.is_ascii_digit()) {
            return parts[..parts.len() - 1].join("-");
        }
    }
    stripped.to_string()
}

fn parse_content_blocks(content: Option<&Value>, error_count: &mut u32) -> Vec<ContentBlock> {
    let mut blocks = Vec::new();
    match content {
        Some(Value::String(s)) => {
            let sanitized = sanitize_xml(s);
            if !sanitized.trim().is_empty() {
                blocks.push(ContentBlock {
                    block_type: "text".to_string(),
                    text: Some(sanitized),
                    tool_name: None,
                    tool_input: None,
                    tool_result: None,
                    is_error: false,
                });
            }
        }
        Some(Value::Array(arr)) => {
            for item in arr {
                if let Some(block) = parse_single_block(item, error_count) {
                    blocks.push(block);
                }
            }
        }
        _ => {}
    }
    blocks
}

fn parse_single_block(item: &Value, error_count: &mut u32) -> Option<ContentBlock> {
    let block_type = item.get("type")?.as_str()?.to_string();
    match block_type.as_str() {
        "text" => {
            let text = item.get("text")?.as_str()?;
            let sanitized = sanitize_xml(text);
            if sanitized.trim().is_empty() {
                return None;
            }
            Some(ContentBlock {
                block_type: "text".to_string(),
                text: Some(sanitized),
                tool_name: None,
                tool_input: None,
                tool_result: None,
                is_error: false,
            })
        }
        "tool_use" => {
            let name = item.get("name")?.as_str()?.to_string();
            let input = item.get("input").map(|v| truncate_str(&v.to_string(), 500));
            Some(ContentBlock {
                block_type: "tool_use".to_string(),
                text: None,
                tool_name: Some(name),
                tool_input: input,
                tool_result: None,
                is_error: false,
            })
        }
        "tool_result" => {
            // Count errors for badge; don't surface result content (lives in user protocol turn)
            let is_error = item
                .get("is_error")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            if is_error {
                *error_count += 1;
            }
            None
        }
        // Skip thinking blocks — internal model cognition, not user-facing content
        _ => None,
    }
}

fn truncate_str(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        // Truncate at char boundary
        let end = s
            .char_indices()
            .map(|(i, _)| i)
            .take_while(|&i| i <= max)
            .last()
            .unwrap_or(max);
        format!("{}…", &s[..end])
    }
}

fn sanitize_xml(s: &str) -> String {
    let s = strip_tagged_content(s, "system-reminder");
    let s = strip_tagged_content(&s, "command-name");
    s
}

fn strip_tagged_content(s: &str, tag: &str) -> String {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let mut result = String::with_capacity(s.len());
    let mut rest = s;
    loop {
        match rest.find(&*open) {
            None => {
                result.push_str(rest);
                break;
            }
            Some(start) => {
                result.push_str(&rest[..start]);
                rest = &rest[start + open.len()..];
                if let Some(end) = rest.find(&*close) {
                    rest = &rest[end + close.len()..];
                } else {
                    break;
                }
            }
        }
    }
    result
}
