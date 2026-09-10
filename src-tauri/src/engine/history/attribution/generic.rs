//! Default classification, shared by every agent that doesn't override it.

use super::{block_chars, InBucket, OutBucket, TokenAttributor, TurnCtx};
use crate::engine::history::types::ContentBlock;

pub struct GenericAttributor;

impl TokenAttributor for GenericAttributor {
    fn agent_id(&self) -> &'static str {
        "generic"
    }
    fn classify_output(
        &self,
        blocks: &[ContentBlock],
        reasoning_chars: u32,
    ) -> Vec<(OutBucket, u64)> {
        classify_output_with(blocks, reasoning_chars, bucket_for_tool)
    }
}

/// Map a tool name to an output bucket. Covers the common vocabulary across
/// agents (`Bash`/`shell`/`exec_command`, `Edit`/`apply_patch`, …); agents with
/// their own names pass a wrapper that checks theirs first.
pub fn bucket_for_tool(name: &str) -> OutBucket {
    let n = name.to_ascii_lowercase();
    if n.contains("multiedit")
        || n == "edit"
        || n.contains("apply_patch")
        || n.contains("applypatch")
    {
        OutBucket::Edit
    } else if n == "write" || n.contains("create_file") || n.contains("writefile") {
        OutBucket::Write
    } else if n.contains("bash")
        || n == "shell"
        || n.contains("exec")
        || n.contains("run_command")
        || n.contains("terminal")
    {
        OutBucket::Shell
    } else if n.contains("grep")
        || n.contains("glob")
        || n.contains("search")
        || n == "read"
        || n.contains("read_file")
        || n.contains("view")
        || n.contains("ls")
    {
        OutBucket::Search
    } else {
        OutBucket::ToolOther
    }
}

/// Split a turn's output across buckets by the character length of what it
/// produced: prose text, tool-call arguments, and extended reasoning.
pub fn classify_output_with(
    blocks: &[ContentBlock],
    reasoning_chars: u32,
    tool_bucket: impl Fn(&str) -> OutBucket,
) -> Vec<(OutBucket, u64)> {
    let mut out: Vec<(OutBucket, u64)> = Vec::new();
    let mut add = |bucket: OutBucket, w: u64| {
        if w == 0 {
            return;
        }
        match out.iter_mut().find(|(k, _)| *k == bucket) {
            Some(e) => e.1 += w,
            None => out.push((bucket, w)),
        }
    };

    if reasoning_chars > 0 {
        add(OutBucket::Reasoning, reasoning_chars as u64);
    }
    for b in blocks {
        match b.block_type.as_str() {
            "text" => add(OutBucket::Answer, block_chars(b).max(1)),
            "tool_use" => {
                let name = b.tool_name.as_deref().unwrap_or("");
                // A tool call is output the model generated (its arguments);
                // floor it so a bare call still registers.
                add(tool_bucket(name), block_chars(b).max(20));
            }
            _ => {}
        }
    }
    if out.is_empty() {
        out.push((OutBucket::Answer, 1));
    }
    out
}

/// Blame an input charge on the preceding user turn's tool result, then (in
/// order) the opening prompt, a just-invoked skill, a compaction spike, or the
/// user's own prompt text.
pub fn classify_input(ctx: &TurnCtx) -> InBucket {
    let prev = ctx.index.checked_sub(1).and_then(|k| ctx.messages.get(k));
    if let Some(p) = prev {
        for b in &p.content {
            if b.block_type == "tool_result" {
                if let Some(name) = b.tool_use_id.as_ref().and_then(|id| ctx.tool_by_id.get(id)) {
                    return match name
                        .strip_prefix("mcp__")
                        .and_then(|r| r.split("__").next())
                    {
                        Some(server) => InBucket::Mcp(server.to_string()),
                        None => InBucket::Tool(name.clone()),
                    };
                }
            }
        }
    }
    if ctx.index <= 1 {
        return InBucket::Initial;
    }
    if let Some(sk) = &ctx.prev_skill {
        return InBucket::Skill(sk.clone());
    }
    // A real Claude /compact leaves a summary as the next user turn.
    let prev_text = prev
        .and_then(|p| p.content.iter().find(|b| b.block_type == "text"))
        .and_then(|b| b.text.as_deref())
        .unwrap_or("");
    if prev_text.contains("session is being continued from a previous conversation")
        || prev_text.contains("<summary>")
    {
        return InBucket::Compaction;
    }
    // Larger uncategorised charges are context accumulating without a tool or
    // skill behind it — long assistant turns, pasted content, plan text.
    if ctx.has_cache && ctx.charge >= 20_000 {
        InBucket::Growth
    } else {
        InBucket::Prompt
    }
}
