//! In-session token attribution — "where did this session's tokens go".
//!
//! The shared [`compute`] loop walks a normalised [`SessionDetail`] and splits
//! both sides of the ledger:
//!
//! * **input** — each assistant turn's *new* context (`cache_creation + input`,
//!   or plain `input` for agents without cache accounting) is blamed on the
//!   preceding tool result, MCP payload, skill file, opening prompt, or
//!   conversation growth.
//! * **output** — each turn's `output_tokens` are divided across what the turn
//!   produced: file edits, shell commands, searches, written answers, extended
//!   reasoning.
//!
//! Per-agent quirks live behind the [`TokenAttributor`] trait; [`for_agent`]
//! picks the implementation and everything falls back to [`generic`].

use super::stats::est_cost;
use super::types::{ContentBlock, Message, SessionDetail};
use serde::Serialize;
use std::collections::HashMap;

pub mod agy;
pub mod claude;
pub mod codex;
pub mod gemini;
pub mod generic;
pub mod kiro;
pub mod opencode;

/// One attributed slice of a session's tokens.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Driver {
    /// `"input"` or `"output"` — which half of the ledger.
    pub side: &'static str,
    /// input: tool | mcp | skill | prompt | initial | compaction | reread
    /// output: edit | write | shell | search | answer | reasoning | tool
    pub kind: &'static str,
    pub name: String,
    pub calls: u64,
    pub tokens: u64,
    pub approx_cost_usd: Option<f64>,
    /// Share of its own side's attributed tokens, 0..100.
    pub pct: f64,
    pub hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionDrivers {
    pub session_id: String,
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_cost_usd: Option<f64>,
    /// True when the agent reports no cache token counts, so input attribution
    /// leans on plain input deltas and is rougher.
    pub coarse: bool,
    /// Both sides, each sorted by tokens descending.
    pub drivers: Vec<Driver>,
}

fn fmt_tok(n: u64) -> String {
    if n >= 1_000_000 {
        format!("{:.1}M", n as f64 / 1_000_000.0)
    } else if n >= 1_000 {
        format!("{}k", (n as f64 / 1_000.0).round() as u64)
    } else {
        n.to_string()
    }
}

/// What an assistant turn's output was spent producing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum OutBucket {
    Edit,
    Write,
    Shell,
    Search,
    Answer,
    Reasoning,
    ToolOther,
}

impl OutBucket {
    fn kind(self) -> &'static str {
        match self {
            OutBucket::Edit => "edit",
            OutBucket::Write => "write",
            OutBucket::Shell => "shell",
            OutBucket::Search => "search",
            OutBucket::Answer => "answer",
            OutBucket::Reasoning => "reasoning",
            OutBucket::ToolOther => "tool",
        }
    }
    fn label(self) -> &'static str {
        match self {
            OutBucket::Edit => "File edits",
            OutBucket::Write => "New files",
            OutBucket::Shell => "Shell commands",
            OutBucket::Search => "Searches / reads",
            OutBucket::Answer => "Written answers",
            OutBucket::Reasoning => "Extended reasoning",
            OutBucket::ToolOther => "Other tool calls",
        }
    }
}

/// What added the context an assistant turn paid for on the input side.
#[derive(Debug, Clone)]
pub enum InBucket {
    Tool(String),
    Mcp(String),
    Skill(String),
    Prompt,
    Initial,
    Compaction,
}

/// Everything a [`TokenAttributor::classify_input`] impl needs about the turn.
pub struct TurnCtx<'a> {
    pub index: usize,
    pub messages: &'a [Message],
    pub tool_by_id: &'a HashMap<String, String>,
    pub prev_skill: Option<String>,
    pub has_cache: bool,
    pub charge: u64,
}

/// Per-agent classification. The math (proportional split, pricing, hints) is
/// shared in [`compute`]; impls only decide *what bucket*.
pub trait TokenAttributor: Sync {
    /// The agent this impl serves. Used by the registry sanity test and handy
    /// for logging; not needed on the hot path.
    #[allow(dead_code)]
    fn agent_id(&self) -> &'static str;

    /// Does the agent report cache token counts? When false, input attribution
    /// uses plain `input_tokens` deltas and the result is marked `coarse`.
    fn has_cache_semantics(&self) -> bool {
        true
    }

    /// Split a turn's output across buckets; the returned weights are relative
    /// and get scaled to the turn's real `output_tokens`.
    fn classify_output(
        &self,
        blocks: &[ContentBlock],
        reasoning_chars: u32,
    ) -> Vec<(OutBucket, u64)>;

    /// Which context source an input charge belongs to.
    fn classify_input(&self, ctx: &TurnCtx) -> InBucket {
        generic::classify_input(ctx)
    }
}

/// Pick the attributor for an agent id, falling back to the generic one.
pub fn for_agent(agent: &str) -> &'static dyn TokenAttributor {
    match agent {
        "claude" => &claude::ClaudeAttributor,
        "codex" => &codex::CodexAttributor,
        "gemini" => &gemini::GeminiAttributor,
        "kiro" => &kiro::KiroAttributor,
        "agy" => &agy::AgyAttributor,
        "opencode" => &opencode::OpencodeAttributor,
        _ => &generic::GenericAttributor,
    }
}

/// Char length of a block, preferring the untruncated `content_chars` and
/// falling back to whatever visible text survived truncation.
pub(crate) fn block_chars(b: &ContentBlock) -> u64 {
    if b.content_chars > 0 {
        return b.content_chars as u64;
    }
    b.text
        .as_deref()
        .map(|s| s.chars().count() as u64)
        .unwrap_or(0)
        + b.tool_input
            .as_deref()
            .map(|s| s.chars().count() as u64)
            .unwrap_or(0)
        + b.tool_result
            .as_deref()
            .map(|s| s.chars().count() as u64)
            .unwrap_or(0)
}

fn skill_invoked_in(msg: &Message) -> Option<String> {
    for b in &msg.content {
        if b.block_type != "tool_use" {
            continue;
        }
        let name = b.tool_name.as_deref().unwrap_or("");
        if name == "Skill" || name == "skill" {
            if let Some(s) = b
                .tool_input
                .as_deref()
                .and_then(super::stats::skill_name_from_input)
            {
                return Some(s);
            }
        }
    }
    None
}

/// The shared attribution pass. Agent-agnostic; delegates classification only.
pub fn compute(detail: &SessionDetail) -> SessionDrivers {
    let att = for_agent(&detail.agent);
    let model = detail.model.clone().unwrap_or_default();
    let msgs = &detail.messages;

    let has_cache = att.has_cache_semantics()
        && msgs.iter().any(|m| {
            m.usage
                .as_ref()
                .map(|u| u.cache_creation_tokens > 0 || u.cache_read_tokens > 0)
                .unwrap_or(false)
        });

    let mut tool_by_id: HashMap<String, String> = HashMap::new();
    for m in msgs {
        for b in &m.content {
            if b.block_type == "tool_use" {
                if let (Some(id), Some(name)) = (b.tool_use_id.as_ref(), b.tool_name.as_ref()) {
                    tool_by_id.insert(id.clone(), name.clone());
                }
            }
        }
    }

    // input: (kind, name) -> (tokens, calls)
    let mut input: HashMap<(&'static str, String), (u64, u64)> = HashMap::new();
    // output: bucket -> (tokens, calls)
    let mut output: HashMap<OutBucket, (u64, u64)> = HashMap::new();
    let mut reread = 0u64;
    let mut pending_skill: Option<String> = None;
    let mut prev_skill: Option<String> = None;

    for (i, msg) in msgs.iter().enumerate() {
        if msg.role == "assistant" {
            prev_skill = pending_skill.take();
            pending_skill = skill_invoked_in(msg);
        }
        if msg.role != "assistant" {
            continue;
        }
        let Some(u) = &msg.usage else { continue };
        reread += u.cache_read_tokens;

        // ── output side ────────────────────────────────────────────────────
        if u.output_tokens > 0 {
            let weights = att.classify_output(&msg.content, msg.reasoning_chars);
            let total_w: u64 = weights.iter().map(|(_, w)| *w).sum::<u64>().max(1);
            let mut handed = 0u64;
            for (k, (bucket, w)) in weights.iter().enumerate() {
                let share = if k + 1 == weights.len() {
                    u.output_tokens - handed
                } else {
                    u.output_tokens * w / total_w
                };
                handed += share;
                let e = output.entry(*bucket).or_insert((0, 0));
                e.0 += share;
                if !matches!(bucket, OutBucket::Answer | OutBucket::Reasoning) {
                    e.1 += 1;
                }
            }
        }

        // ── input side ─────────────────────────────────────────────────────
        let charge = if has_cache {
            u.cache_creation_tokens + u.input_tokens
        } else {
            u.input_tokens
        };
        if charge == 0 {
            continue;
        }
        let ctx = TurnCtx {
            index: i,
            messages: msgs,
            tool_by_id: &tool_by_id,
            prev_skill: prev_skill.clone(),
            has_cache,
            charge,
        };
        let (kind, name, calls): (&'static str, String, u64) = match att.classify_input(&ctx) {
            InBucket::Tool(n) => ("tool", n, 1),
            InBucket::Mcp(n) => ("mcp", n, 1),
            InBucket::Skill(n) => ("skill", n, 1),
            InBucket::Prompt => ("prompt", "Your prompts".into(), 0),
            InBucket::Initial => ("initial", "Initial prompt + system".into(), 0),
            InBucket::Compaction => ("compaction", "Context compaction".into(), 0),
        };
        let e = input.entry((kind, name)).or_insert((0, 0));
        e.0 += charge;
        e.1 += calls;
    }

    let mut drivers: Vec<Driver> = Vec::new();
    for ((kind, name), (tokens, calls)) in input {
        drivers.push(Driver {
            side: "input",
            kind,
            name,
            calls,
            tokens,
            approx_cost_usd: None,
            pct: 0.0,
            hint: None,
        });
    }
    if reread > 0 {
        drivers.push(Driver {
            side: "input",
            kind: "reread",
            name: "Conversation re-read (cache)".into(),
            calls: 0,
            tokens: reread,
            approx_cost_usd: None,
            pct: 0.0,
            hint: None,
        });
    }
    for (bucket, (tokens, calls)) in output {
        drivers.push(Driver {
            side: "output",
            kind: bucket.kind(),
            name: bucket.label().into(),
            calls,
            tokens,
            approx_cost_usd: None,
            pct: 0.0,
            hint: None,
        });
    }

    let in_total: u64 = drivers
        .iter()
        .filter(|d| d.side == "input")
        .map(|d| d.tokens)
        .sum();
    let out_total: u64 = drivers
        .iter()
        .filter(|d| d.side == "output")
        .map(|d| d.tokens)
        .sum();
    for d in &mut drivers {
        let side_total = if d.side == "input" {
            in_total
        } else {
            out_total
        };
        d.pct = if side_total > 0 {
            d.tokens as f64 / side_total as f64 * 100.0
        } else {
            0.0
        };
        d.approx_cost_usd = match d.kind {
            "reread" => est_cost(0, 0, d.tokens, 0, &model),
            _ if d.side == "output" => est_cost(0, d.tokens, 0, 0, &model),
            "prompt" => est_cost(d.tokens, 0, 0, 0, &model),
            _ if has_cache => est_cost(0, 0, 0, d.tokens, &model),
            _ => est_cost(d.tokens, 0, 0, 0, &model),
        };
        d.hint = hint(
            d,
            if d.side == "input" {
                in_total
            } else {
                out_total
            },
        );
    }
    drivers.sort_by(|a, b| {
        (a.side != "input")
            .cmp(&(b.side != "input"))
            .then(b.tokens.cmp(&a.tokens))
    });

    SessionDrivers {
        session_id: detail.session_id.clone(),
        model,
        input_tokens: in_total,
        output_tokens: out_total,
        total_cost_usd: drivers
            .iter()
            .filter_map(|d| d.approx_cost_usd)
            .sum::<f64>()
            .into(),
        coarse: !has_cache,
        drivers,
    }
}

fn hint(d: &Driver, side_total: u64) -> Option<String> {
    let pct = (d.tokens * 100).checked_div(side_total).unwrap_or(0);
    match d.kind {
        "reread" if pct >= 50 => Some(
            "Most input is re-read cached context — a long session. /compact earlier or split the task."
                .into(),
        ),
        "tool" if matches!(d.name.as_str(), "Read" | "Bash" | "Grep" | "shell") && pct >= 40 => {
            Some(format!(
                "{} added {pct}% of this session's context — narrow it (offset/limit, head, tighter globs).",
                d.name
            ))
        }
        "mcp" if d.tokens >= 200_000 => Some(format!(
            "{} returned ~{} — cache results or narrow the query.",
            d.name,
            fmt_tok(d.tokens)
        )),
        "skill" if d.calls > 0 && d.tokens / d.calls >= 8_000 => Some(format!(
            "{} loads ~{} of instructions per call ({}×).",
            d.name,
            fmt_tok(d.tokens / d.calls),
            d.calls
        )),
        "compaction" => {
            Some("Context was compacted mid-session — the task may be too large for one pass.".into())
        }
        "initial" if d.tokens >= 60_000 => Some(
            "Large initial context — trim CLAUDE.md and disable unused MCP servers / skills.".into(),
        ),
        "reasoning" if pct >= 40 => Some(
            "Extended thinking is most of the output — turn it down for routine work.".into(),
        ),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::history::types::{ContentBlock, Message, SessionDetail, TokenUsage};

    fn blk(kind: &str, text: Option<&str>, tool: Option<&str>, chars: u32) -> ContentBlock {
        ContentBlock {
            block_type: kind.into(),
            text: text.map(Into::into),
            tool_name: tool.map(Into::into),
            content_chars: chars,
            ..Default::default()
        }
    }

    #[test]
    fn registry_agent_ids_match() {
        for a in ["claude", "codex", "gemini", "kiro", "agy", "opencode"] {
            assert_eq!(for_agent(a).agent_id(), a);
        }
        assert_eq!(for_agent("cursor").agent_id(), "generic");
    }

    #[test]
    fn output_split_weights_the_bigger_block() {
        let out = claude::ClaudeAttributor.classify_output(
            &[
                blk("text", Some("hi"), None, 2_000),
                blk("tool_use", None, Some("Edit"), 8_000),
            ],
            0,
        );
        let edit = out.iter().find(|(b, _)| *b == OutBucket::Edit).unwrap().1;
        let answer = out.iter().find(|(b, _)| *b == OutBucket::Answer).unwrap().1;
        assert!(edit > answer, "edit {edit} vs answer {answer}");
    }

    #[test]
    fn claude_session_attributes_both_sides() {
        let d = SessionDetail {
            agent: "claude".into(),
            session_id: "s".into(),
            messages: vec![
                Message {
                    role: "user".into(),
                    content: vec![blk("text", Some("do it"), None, 5)],
                    ..Default::default()
                },
                Message {
                    role: "assistant".into(),
                    content: vec![
                        blk("tool_use", None, Some("Read"), 40),
                        blk("text", Some("done"), None, 400),
                    ],
                    usage: Some(TokenUsage {
                        input_tokens: 1_000,
                        output_tokens: 500,
                        cache_creation_tokens: 20_000,
                        cache_read_tokens: 3_000,
                    }),
                    reasoning_chars: 100,
                    ..Default::default()
                },
            ],
            total_tokens: TokenUsage {
                input_tokens: 1_000,
                output_tokens: 500,
                ..Default::default()
            },
            model: Some("claude-sonnet-4-5".into()),
            duration_ms: None,
            project: "p".into(),
            project_name: "p".into(),
            timestamp: 0,
            title: None,
        };
        let sd = compute(&d);
        assert!(!sd.coarse);
        assert!(sd.input_tokens > 0 && sd.output_tokens > 0);
        assert!(sd.drivers.iter().any(|x| x.side == "input"));
        assert!(sd.drivers.iter().any(|x| x.side == "output"));
        assert!(sd.drivers.iter().any(|x| x.kind == "reasoning"));
    }
}
