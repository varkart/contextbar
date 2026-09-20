//! Background aggregation of per-session statistics (tokens, model, tool
//! calls) into SQLite. A session backed by a single trackable transcript
//! file is parsed at most once per (mtime, size) — re-parsing only happens
//! when that file changes, so the warm pass is cheap after the first run.
//! A session with no such file (see `warm_reparse_decision`) always
//! re-parses; there's no cheap way to detect "unchanged" without one.

use super::parser;
use super::types::TokenUsage;
use crate::db::DbState;
use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCount {
    pub name: String,
    pub count: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStat {
    pub model: String,
    pub sessions: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_creation_tokens: u64,
    /// None when the model doesn't match any known pricing entry.
    pub est_cost_usd: Option<f64>,
}

/// One agent's token + cost total for the window — a real full aggregate
/// over every matching session, computed independently of `per_session`'s
/// sort order.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTokens {
    pub agent: String,
    pub tokens: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub sessions: u64,
    pub est_cost_usd: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTokens {
    pub project: String,
    pub project_name: String,
    pub tokens: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub prompts: u64,
    pub sessions: u64,
    /// None when no session in the group matched a known pricing entry.
    pub est_cost_usd: Option<f64>,
}

/// One session's token + cost line, for the drill-down "Sessions" pivot and
/// the per-repo drill.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCost {
    pub session_id: String,
    pub display: String,
    pub project: String,
    pub project_name: String,
    pub agent: String,
    pub model: String,
    pub ts: i64,
    pub tokens: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub prompts: u64,
    pub est_cost_usd: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeaviestSession {
    pub session_id: String,
    pub display: String,
    pub tokens: u64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionInsights {
    pub sessions_analyzed: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_creation_tokens: u64,
    pub est_cost_usd: f64,
    pub cache_read_ratio: f64,
    pub avg_tool_calls: f64,
    pub per_model: Vec<ModelStat>,
    pub per_project: Vec<ProjectTokens>,
    /// Full per-agent totals for the window.
    pub per_agent: Vec<AgentTokens>,
    /// Every session in the window, ranked by tokens descending.
    pub per_session: Vec<SessionCost>,
    pub tool_counts: Vec<ToolCount>,
    pub mcp_tool_counts: Vec<ToolCount>,
    pub skill_counts: Vec<ToolCount>,
    /// Every distinct skill name invoked at least once in the window —
    /// untruncated, unlike `skill_counts`. Lets the UI flag installed-but-
    /// unused skills without a false positive past the top-N cutoff.
    pub skill_names_used: Vec<String>,
    /// Every distinct MCP server name called at least once in the window.
    pub mcp_names_used: Vec<String>,
    pub heaviest: Option<HeaviestSession>,
}

/// Extract the invoked skill name from a skill-tool input. Shapes seen:
/// Claude `{"skill":"graphify",…}`, OpenCode `{"name":"graphify"}`,
/// slash form `{"command":"graphify"}`. Input may be truncated JSON.
pub(crate) fn skill_name_from_input(input: &str) -> Option<String> {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(input) {
        for key in ["skill", "name", "command"] {
            if let Some(s) = v.get(key).and_then(|s| s.as_str()) {
                return Some(s.to_string());
            }
        }
    }
    // Truncated JSON fallback: find the first "<key>":"…"
    for key in ["\"skill\"", "\"name\"", "\"command\""] {
        if let Some(idx) = input.find(key) {
            let rest = &input[idx + key.len()..];
            if let Some(start) = rest.find('"') {
                let rest = &rest[start + 1..];
                if let Some(end) = rest.find('"') {
                    return Some(rest[..end].to_string());
                }
            }
        }
    }
    None
}

/// Kiro's own slash commands — not skills. A leading `/<one-of-these>` in a
/// prompt is a builtin, not a skill invocation.
const KIRO_BUILTIN_SLASH: &[&str] = &[
    "resume", "help", "model", "config", "usage", "tasks", "rename", "mcp", "skills", "clear",
    "login", "logout", "quit", "exit", "compact", "context", "tools", "agent", "agents", "init",
    "doctor", "feedback", "new", "save", "undo", "redo", "profile", "settings", "history",
];

/// Kiro can invoke a skill with a leading `/<skill-name>` in the prompt.
/// Returns the slug if the text opens with such a slash command and it isn't
/// a Kiro builtin. Downstream matching against the installed-skill set
/// discards anything that isn't a real skill.
fn kiro_slash_skill(text: &str) -> Option<String> {
    let token = text
        .trim_start()
        .strip_prefix('/')?
        .split_whitespace()
        .next()?;
    if token.len() > 60
        || !token.chars().any(|c| c.is_ascii_alphabetic())
        || !token
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | ':'))
        || KIRO_BUILTIN_SLASH.contains(&token)
    {
        return None;
    }
    Some(token.to_string())
}

/// Codex uses a skill by opening its `SKILL.md`. Given a shell-tool input,
/// return the skill-directory name immediately before `/SKILL.md`. Heuristic:
/// a plain inspection of a skill file also matches, and skills read without
/// opening the file are missed.
fn codex_skill_from_read(input: &str) -> Option<String> {
    let idx = input.to_ascii_lowercase().find("/skill.md")?;
    let seg = input[..idx].rsplit(['/', '\\', '"', '\'', ' ']).next()?;
    if seg.is_empty()
        || seg.len() > 60
        || seg == ".system"
        || !seg.chars().any(|c| c.is_ascii_alphabetic())
        || !seg
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    {
        return None;
    }
    Some(seg.to_string())
}

// ── Pricing (bundled data, refreshed weekly by CI) ───────────────────────────

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PricingModel {
    /// Substring matched against the lowercased model id.
    #[serde(rename = "match")]
    pattern: String,
    input_per_mtok: f64,
    output_per_mtok: f64,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Pricing {
    cache_read_multiplier: f64,
    cache_write_multiplier: f64,
    models: Vec<PricingModel>,
}

impl Default for Pricing {
    fn default() -> Self {
        // Safety net if the bundled JSON ever fails to parse.
        Pricing {
            cache_read_multiplier: 0.1,
            cache_write_multiplier: 1.25,
            models: vec![
                PricingModel {
                    pattern: "opus".into(),
                    input_per_mtok: 15.0,
                    output_per_mtok: 75.0,
                },
                PricingModel {
                    pattern: "sonnet".into(),
                    input_per_mtok: 3.0,
                    output_per_mtok: 15.0,
                },
                PricingModel {
                    pattern: "haiku".into(),
                    input_per_mtok: 1.0,
                    output_per_mtok: 5.0,
                },
            ],
        }
    }
}

fn pricing() -> &'static Pricing {
    static PRICING: std::sync::OnceLock<Pricing> = std::sync::OnceLock::new();
    PRICING.get_or_init(|| {
        serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/resources/pricing.json"
        )))
        .unwrap_or_default()
    })
}

/// Cache reads are the same content resent, billed at this fraction of a
/// fresh input token — used to down-weight cache re-read counts wherever raw
/// tokens would otherwise wildly overstate a long, heavily-cached session's
/// real context footprint (see [`super::attribution::aggregate_drivers`]).
pub(crate) fn cache_read_multiplier() -> f64 {
    pricing().cache_read_multiplier
}

fn rates(model: &str) -> Option<(f64, f64)> {
    let m = model.to_lowercase();
    pricing()
        .models
        .iter()
        .find(|p| m.contains(&p.pattern))
        .map(|p| (p.input_per_mtok, p.output_per_mtok))
}

pub(crate) fn est_cost(
    input: u64,
    output: u64,
    cache_read: u64,
    cache_creation: u64,
    model: &str,
) -> Option<f64> {
    let (rin, rout) = rates(model)?;
    let p = pricing();
    let mtok = 1_000_000.0;
    Some(
        input as f64 / mtok * rin
            + output as f64 / mtok * rout
            + cache_read as f64 / mtok * rin * p.cache_read_multiplier
            + cache_creation as f64 / mtok * rin * p.cache_write_multiplier,
    )
}

// ── In-session token attribution ──────────────────────────────────────────
// Lives in the `attribution` module (per-agent facade); re-exported here so
// existing callers keep working.
use super::attribution::{aggregate_drivers, CachedDriver, CachedSessionDrivers};
pub use super::attribution::{compute as compute_drivers, SessionDrivers};

// ── Usage windows (rolling 5h / 7d meters per agent) ─────────────────────────

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentUsage {
    pub agent: String,
    pub tokens_5h: u64,
    pub cost_5h: f64,
    pub sessions_5h: u64,
    pub tokens_7d: u64,
    pub cost_7d: f64,
    pub sessions_7d: u64,
}

/// Per-agent token/cost totals for the rolling 5-hour and 7-day windows,
/// aggregated from the session_stats cache. Approximate: a session's whole
/// usage is attributed to its last-activity timestamp.
pub fn usage_windows(db: &DbState) -> Vec<AgentUsage> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let cut_5h = now - 5 * 3_600_000;
    let cut_7d = now - 7 * 86_400_000;

    let mut by_agent: HashMap<String, AgentUsage> = HashMap::new();
    {
        let Ok(conn) = db.0.lock() else { return vec![] };
        let Ok(mut stmt) = conn.prepare(
            "SELECT agent, ts, model, input_tokens, output_tokens, cache_read, cache_creation
             FROM session_stats WHERE ts >= ?1",
        ) else {
            return vec![];
        };
        let rows = stmt.query_map([cut_7d], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?.max(0) as u64,
                r.get::<_, i64>(4)?.max(0) as u64,
                r.get::<_, i64>(5)?.max(0) as u64,
                r.get::<_, i64>(6)?.max(0) as u64,
            ))
        });
        let Ok(rows) = rows else { return vec![] };
        for (agent, ts, model, input, output, cache_read, cache_creation) in rows.flatten() {
            let tokens = input + output;
            let cost = est_cost(input, output, cache_read, cache_creation, &model).unwrap_or(0.0);
            let u = by_agent.entry(agent.clone()).or_insert_with(|| AgentUsage {
                agent,
                ..Default::default()
            });
            u.tokens_7d += tokens;
            u.cost_7d += cost;
            u.sessions_7d += 1;
            if ts >= cut_5h {
                u.tokens_5h += tokens;
                u.cost_5h += cost;
                u.sessions_5h += 1;
            }
        }
    }

    let mut out: Vec<AgentUsage> = by_agent.into_values().collect();
    out.sort_by_key(|u| std::cmp::Reverse(u.tokens_7d));
    out
}

/// Concatenated user/assistant text of a session, capped so one huge
/// transcript can't bloat the FTS index.
fn transcript_text(detail: &super::SessionDetail) -> String {
    const CAP: usize = 256 * 1024;
    let mut out = String::new();
    'outer: for msg in &detail.messages {
        if msg.role != "user" && msg.role != "assistant" {
            continue;
        }
        for block in &msg.content {
            if let Some(t) = &block.text {
                if t.is_empty() {
                    continue;
                }
                out.push_str(t);
                out.push('\n');
                if out.len() >= CAP {
                    break 'outer;
                }
            }
        }
    }
    out
}

/// Parse any session files that are new or changed since the last warm pass
/// and upsert one stats row per session (plus its FTS transcript row).
/// Covers every session source, not just Claude. Returns the number of
/// (re)parsed sessions. Safe to call repeatedly.
/// Whether a session should be (re-)parsed this warm pass, and with what
/// `(mtime, size)` to record for next time. `None` means skip — already
/// cached and unchanged. A session with no trackable file (`file_meta ==
/// None`, either because the source's `transcript_file()` doesn't apply —
/// e.g. OpenCode's sessions live in one shared DB with no per-session file
/// — or the file it named doesn't exist) always reparses: there's no cheap
/// way to detect "unchanged" without one, matching the documented fallback
/// (`transcript_file()`'s own doc comment: "skip it and the warm pass just
/// re-parses every time"). Getting this case wrong once meant such sessions
/// were silently skipped from session_stats forever instead — exactly the
/// bug this function exists to make directly testable.
fn warm_reparse_decision(
    file_meta: Option<(i64, i64)>,
    cached: Option<(i64, i64)>,
) -> Option<(i64, i64)> {
    match file_meta {
        Some((mtime, size)) => (cached != Some((mtime, size))).then_some((mtime, size)),
        None => Some((0, 0)),
    }
}

pub fn warm(db: &DbState) -> usize {
    let Some(home) = dirs::home_dir() else {
        return 0;
    };
    let mut parsed = 0usize;

    for source in crate::engine::sessions::sources() {
        let is_claude = source.agent_id() == "claude";
        // Large limit — listing is cheap; parsing is what the cache guards.
        let limit = if is_claude { 2000 } else { 500 };

        for entry in source.list(limit) {
            // `transcript_file()` returning None — either because this
            // source doesn't override it (e.g. OpenCode, whose sessions
            // live in one shared DB with no per-session file to track), or
            // because the file it named doesn't exist on disk (e.g. an Agy
            // conversation predating the transcript-log feature) — used to
            // `continue` here, silently skipping the session from
            // session_stats forever. That contradicted this trait method's
            // own documented contract ("skip it and the warm pass just
            // re-parses every time," CLAUDE.md) and made such sessions
            // permanently invisible to every session_stats-backed tile
            // (Usage per agent, Usage & cost, Context Efficiency) while
            // they stayed visible in list()-backed ones (Hours spent,
            // Parallel sessions) — exactly the symptom that surfaced this.
            let file_meta = source.transcript_file(&entry).and_then(|p| {
                std::fs::metadata(&p).ok().map(|meta| {
                    let mtime = meta
                        .modified()
                        .ok()
                        .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0);
                    (mtime, meta.len() as i64)
                })
            });
            let cached: Option<(i64, i64)> = {
                let conn = db.0.lock().unwrap();
                conn.query_row(
                    "SELECT mtime, size FROM session_stats WHERE session_id = ?1",
                    [&entry.session_id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .ok()
            };
            let Some((mtime, size)) = warm_reparse_decision(file_meta, cached) else {
                continue;
            };

            // Claude fast path: source.get() would rescan history.jsonl per
            // session to find the project; we already have it on the entry.
            let detail = if is_claude {
                parser::get_session(&home, &entry.session_id, &entry.project, entry.timestamp)
            } else {
                source.get(&entry.session_id)
            };
            let detail = match detail {
                Some(d) => d,
                // get() also needs the same file transcript_file() named
                // (when it named one) — if that file is simply missing
                // rather than corrupt, get() returning None is expected,
                // not a parse failure to keep silently retrying. Cache what
                // list() already knows honestly (real project/timestamp,
                // zero tokens) so the session is at least visible, once —
                // guarded so a genuine parse failure (file exists, get()
                // still fails) doesn't get masked the same way, since that
                // case already returned a real (mtime, size) above and
                // would naturally retry once the file changes.
                None if file_meta.is_none() => super::SessionDetail {
                    agent: source.agent_id().to_string(),
                    session_id: entry.session_id.clone(),
                    messages: Vec::new(),
                    title: None,
                    total_tokens: TokenUsage::default(),
                    model: None,
                    duration_ms: None,
                    project: entry.project.clone(),
                    project_name: entry.project_name.clone(),
                    timestamp: entry.timestamp,
                },
                None => continue,
            };

            upsert_session(db, &entry, &detail, mtime, size);
            parsed += 1;
        }
    }
    parsed
}

/// Write one session's stats row and FTS transcript.
fn upsert_session(
    db: &DbState,
    entry: &super::SessionEntry,
    detail: &super::SessionDetail,
    mtime: i64,
    size: i64,
) {
    let mut tool_calls: HashMap<String, u64> = HashMap::new();
    let mut skill_calls: HashMap<String, u64> = HashMap::new();
    for msg in &detail.messages {
        for block in &msg.content {
            if block.block_type == "tool_use" {
                if let Some(name) = &block.tool_name {
                    *tool_calls.entry(name.clone()).or_insert(0) += 1;
                    // Claude Code invokes skills via a `Skill` tool; OpenCode
                    // via a lowercase `skill` tool (`skill({ name })`). Both
                    // carry the skill name in the tool input.
                    let is_skill_tool =
                        name == "Skill" || (entry.agent == "opencode" && name == "skill");
                    if is_skill_tool {
                        if let Some(skill) =
                            block.tool_input.as_deref().and_then(skill_name_from_input)
                        {
                            *skill_calls.entry(skill).or_insert(0) += 1;
                        }
                    }
                }
            }
            // Kiro invokes skills with a leading `/<skill-name>` in the prompt.
            if entry.agent == "kiro" && msg.role == "user" && block.block_type == "text" {
                if let Some(skill) = block.text.as_deref().and_then(kiro_slash_skill) {
                    *skill_calls.entry(skill).or_insert(0) += 1;
                }
            }
            // Codex has no skill tool — it opens `<name>/SKILL.md` via a shell
            // command when it uses a skill. Heuristic, so it can over- or
            // under-count; downstream matching keeps only real skill names.
            if entry.agent == "codex" && block.block_type == "tool_use" {
                if let Some(skill) = block.tool_input.as_deref().and_then(codex_skill_from_read) {
                    *skill_calls.entry(skill).or_insert(0) += 1;
                }
            }
        }
    }
    let tool_calls_json = serde_json::to_string(&tool_calls).unwrap_or_else(|_| "{}".into());
    let skill_calls_json = serde_json::to_string(&skill_calls).unwrap_or_else(|_| "{}".into());
    let drivers = CachedSessionDrivers::from(&compute_drivers(detail));
    let drivers_json = serde_json::to_string(&drivers).unwrap_or_else(|_| "{}".into());
    let t = &detail.total_tokens;
    // Count real user turns — those carrying typed text — not the `user`-role
    // envelopes that only wrap a tool_result. Kiro's own list()-side prompt
    // count uses a cheaper, different definition (every recorded turn,
    // content-agnostic) — see the comment in sessions/kiro.rs — so the two
    // can legitimately disagree for the same session; not a bug to unify,
    // this one is the source of truth for every aggregate/tile that reads
    // session_stats.
    let prompt_count = detail
        .messages
        .iter()
        .filter(|m| {
            m.role == "user"
                && m.content.iter().any(|b| {
                    b.block_type == "text"
                        && b.text.as_deref().is_some_and(|t| !t.trim().is_empty())
                })
        })
        .count() as i64;

    let conn = db.0.lock().unwrap();
    let _ = conn.execute(
        "INSERT INTO session_stats
               (session_id, agent, project, project_name, display, title, ts, model,
                input_tokens, output_tokens, cache_read, cache_creation,
                msg_count, prompt_count, tool_calls, skill_calls, mtime, size)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)
             ON CONFLICT(session_id) DO UPDATE SET
               ts=excluded.ts, model=excluded.model, title=excluded.title,
               input_tokens=excluded.input_tokens, output_tokens=excluded.output_tokens,
               cache_read=excluded.cache_read, cache_creation=excluded.cache_creation,
               msg_count=excluded.msg_count, prompt_count=excluded.prompt_count,
               tool_calls=excluded.tool_calls,
               skill_calls=excluded.skill_calls, mtime=excluded.mtime, size=excluded.size",
        rusqlite::params![
            entry.session_id,
            entry.agent,
            entry.project,
            entry.project_name,
            entry.display,
            detail.title,
            entry.timestamp as i64,
            detail.model.clone().unwrap_or_default(),
            t.input_tokens as i64,
            t.output_tokens as i64,
            t.cache_read_tokens as i64,
            t.cache_creation_tokens as i64,
            detail.messages.len() as i64,
            prompt_count,
            tool_calls_json,
            skill_calls_json,
            mtime,
            size,
        ],
    );
    let _ = conn.execute(
        "INSERT INTO session_drivers (session_id, mtime, drivers_json) VALUES (?1,?2,?3)
             ON CONFLICT(session_id) DO UPDATE SET mtime=excluded.mtime, drivers_json=excluded.drivers_json",
        rusqlite::params![entry.session_id, mtime, drivers_json],
    );
    drop(conn);

    let mut text = transcript_text(detail);
    if text.is_empty() {
        text = entry.display.clone();
    }
    crate::db::index_transcript(db, &entry.session_id, &entry.agent, &text);
}

/// Aggregate cached rows with `since_ms <= ts < until_ms` into one insights
/// payload. Pass `u64::MAX` for `until_ms` to leave the window open-ended.
/// When `projects` is set, only sessions whose cwd is one of those paths
/// count (used for per-repo insights; a repo passes all its worktree paths).
pub fn aggregate(
    db: &DbState,
    since_ms: u64,
    until_ms: u64,
    projects: Option<&[String]>,
) -> SessionInsights {
    struct Row {
        session_id: String,
        project: String,
        project_name: String,
        display: String,
        agent: String,
        model: String,
        ts: i64,
        input: u64,
        output: u64,
        cache_read: u64,
        cache_creation: u64,
        prompts: u64,
        tool_calls: HashMap<String, u64>,
        skill_calls: HashMap<String, u64>,
    }

    let rows: Vec<Row> = {
        let conn = db.0.lock().unwrap();
        let mut stmt = match conn.prepare(
            "SELECT session_id, project, project_name, display, model,
                    input_tokens, output_tokens, cache_read, cache_creation, tool_calls,
                    skill_calls, agent, ts, prompt_count
             FROM session_stats WHERE ts >= ?1 AND ts < ?2",
        ) {
            Ok(s) => s,
            Err(_) => return SessionInsights::default(),
        };
        stmt.query_map(
            [since_ms as i64, until_ms.min(i64::MAX as u64) as i64],
            |r| {
                Ok(Row {
                    session_id: r.get(0)?,
                    project: r.get(1)?,
                    project_name: r.get(2)?,
                    display: r.get(3)?,
                    model: r.get(4)?,
                    input: r.get::<_, i64>(5)? as u64,
                    output: r.get::<_, i64>(6)? as u64,
                    cache_read: r.get::<_, i64>(7)? as u64,
                    cache_creation: r.get::<_, i64>(8)? as u64,
                    tool_calls: serde_json::from_str(&r.get::<_, String>(9)?).unwrap_or_default(),
                    skill_calls: serde_json::from_str(&r.get::<_, String>(10)?).unwrap_or_default(),
                    agent: r.get(11)?,
                    ts: r.get(12)?,
                    prompts: r.get::<_, i64>(13)? as u64,
                })
            },
        )
        .map(|it| it.flatten().collect())
        .unwrap_or_default()
    };

    // Rust-side filter keeps the SQL static; row counts are small (hundreds).
    let rows: Vec<Row> = match projects {
        Some(paths) => rows
            .into_iter()
            .filter(|r| paths.contains(&r.project))
            .collect(),
        None => rows,
    };

    let mut out = SessionInsights {
        sessions_analyzed: rows.len() as u64,
        ..Default::default()
    };
    if rows.is_empty() {
        return out;
    }

    let mut per_model: HashMap<String, ModelStat> = HashMap::new();
    let mut per_project: HashMap<String, ProjectTokens> = HashMap::new();
    let mut per_agent: HashMap<String, AgentTokens> = HashMap::new();
    let mut per_session: Vec<SessionCost> = Vec::with_capacity(rows.len());
    let mut tools: HashMap<String, u64> = HashMap::new();
    let mut skills: HashMap<String, u64> = HashMap::new();
    let mut total_tool_calls = 0u64;
    let mut heaviest: Option<HeaviestSession> = None;

    for row in &rows {
        out.input_tokens += row.input;
        out.output_tokens += row.output;
        out.cache_read_tokens += row.cache_read;
        out.cache_creation_tokens += row.cache_creation;

        let model_key = if row.model.is_empty() {
            "unknown".to_string()
        } else {
            row.model.clone()
        };
        let m = per_model
            .entry(model_key.clone())
            .or_insert_with(|| ModelStat {
                model: model_key,
                sessions: 0,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_creation_tokens: 0,
                est_cost_usd: None,
            });
        m.sessions += 1;
        m.input_tokens += row.input;
        m.output_tokens += row.output;
        m.cache_read_tokens += row.cache_read;
        m.cache_creation_tokens += row.cache_creation;

        let session_tokens = row.input + row.output;
        let session_cost = est_cost(
            row.input,
            row.output,
            row.cache_read,
            row.cache_creation,
            &row.model,
        );
        let p = per_project
            .entry(row.project.clone())
            .or_insert_with(|| ProjectTokens {
                project: row.project.clone(),
                project_name: row.project_name.clone(),
                tokens: 0,
                input_tokens: 0,
                output_tokens: 0,
                prompts: 0,
                sessions: 0,
                est_cost_usd: None,
            });
        p.tokens += session_tokens;
        p.input_tokens += row.input;
        p.output_tokens += row.output;
        p.prompts += row.prompts;
        p.sessions += 1;
        if let Some(c) = session_cost {
            *p.est_cost_usd.get_or_insert(0.0) += c;
        }

        let a = per_agent
            .entry(row.agent.clone())
            .or_insert_with(|| AgentTokens {
                agent: row.agent.clone(),
                tokens: 0,
                input_tokens: 0,
                output_tokens: 0,
                sessions: 0,
                est_cost_usd: None,
            });
        a.tokens += session_tokens;
        a.input_tokens += row.input;
        a.output_tokens += row.output;
        a.sessions += 1;
        if let Some(c) = session_cost {
            *a.est_cost_usd.get_or_insert(0.0) += c;
        }

        per_session.push(SessionCost {
            session_id: row.session_id.clone(),
            display: row.display.clone(),
            project: row.project.clone(),
            project_name: row.project_name.clone(),
            agent: row.agent.clone(),
            model: row.model.clone(),
            ts: row.ts,
            tokens: session_tokens,
            input_tokens: row.input,
            output_tokens: row.output,
            prompts: row.prompts,
            est_cost_usd: session_cost,
        });

        for (name, count) in &row.tool_calls {
            *tools.entry(name.clone()).or_insert(0) += count;
            total_tool_calls += count;
        }
        for (name, count) in &row.skill_calls {
            *skills.entry(name.clone()).or_insert(0) += count;
        }

        if heaviest
            .as_ref()
            .map(|h| session_tokens > h.tokens)
            .unwrap_or(true)
        {
            heaviest = Some(HeaviestSession {
                session_id: row.session_id.clone(),
                display: row.display.clone(),
                tokens: session_tokens,
            });
        }
    }

    for m in per_model.values_mut() {
        m.est_cost_usd = est_cost(
            m.input_tokens,
            m.output_tokens,
            m.cache_read_tokens,
            m.cache_creation_tokens,
            &m.model,
        );
    }
    out.est_cost_usd = per_model.values().filter_map(|m| m.est_cost_usd).sum();

    let denom = out.input_tokens + out.cache_read_tokens;
    out.cache_read_ratio = if denom > 0 {
        out.cache_read_tokens as f64 / denom as f64
    } else {
        0.0
    };
    out.avg_tool_calls = total_tool_calls as f64 / rows.len() as f64;

    let mut per_model: Vec<ModelStat> = per_model.into_values().collect();
    per_model.sort_by_key(|m| std::cmp::Reverse(m.sessions));
    out.per_model = per_model;

    // No cap here, same reasoning as per_session below: the frontend looks
    // up a specific project's tokens by path (Top Repos, keyed off its own
    // recency-ordered project list, not this one's sort order) rather than
    // only ever consuming a ranked prefix — a cap silently made that lookup
    // return "0 tokens" for any project ranked below it.
    let mut per_project: Vec<ProjectTokens> = per_project.into_values().collect();
    per_project.sort_by_key(|p| std::cmp::Reverse(p.tokens));
    out.per_project = per_project;

    let mut per_agent: Vec<AgentTokens> = per_agent.into_values().collect();
    per_agent.sort_by_key(|a| std::cmp::Reverse(a.tokens));
    out.per_agent = per_agent;

    // No cap here: besides the top-5 "Top sessions" view (unaffected either
    // way — sorted-desc top-N is a subset of any larger prefix), the
    // frontend also derives full-window aggregates from this list (daily
    // per-agent token chart, day-level session counts). A cap silently
    // dropped sessions ranked below it from those, which on a machine
    // running several agents in parallel could make a heavily-used agent
    // with many smaller sessions vanish behind one with fewer, larger ones.
    per_session.sort_by_key(|s| std::cmp::Reverse(s.tokens));
    out.per_session = per_session;

    let (mcp, native): (Vec<_>, Vec<_>) =
        tools.into_iter().partition(|(n, _)| n.starts_with("mcp__"));
    let mut tool_counts: Vec<ToolCount> = native
        .into_iter()
        .map(|(name, count)| ToolCount { name, count })
        .collect();
    tool_counts.sort_by_key(|t| std::cmp::Reverse(t.count));
    tool_counts.truncate(8);
    out.tool_counts = tool_counts;

    // Group MCP calls by server: "mcp__server__tool" → "server".
    let mut mcp_by_server: HashMap<String, u64> = HashMap::new();
    for (name, count) in mcp {
        let server = name
            .trim_start_matches("mcp__")
            .split("__")
            .next()
            .unwrap_or("mcp")
            .to_string();
        *mcp_by_server.entry(server).or_insert(0) += count;
    }
    let mut mcp_names_used: Vec<String> = mcp_by_server.keys().cloned().collect();
    mcp_names_used.sort();
    out.mcp_names_used = mcp_names_used;
    let mut mcp_counts: Vec<ToolCount> = mcp_by_server
        .into_iter()
        .map(|(name, count)| ToolCount { name, count })
        .collect();
    mcp_counts.sort_by_key(|t| std::cmp::Reverse(t.count));
    mcp_counts.truncate(8);
    out.mcp_tool_counts = mcp_counts;

    let mut skill_names_used: Vec<String> = skills.keys().cloned().collect();
    skill_names_used.sort();
    out.skill_names_used = skill_names_used;
    let mut skill_counts: Vec<ToolCount> = skills
        .into_iter()
        .map(|(name, count)| ToolCount { name, count })
        .collect();
    skill_counts.sort_by_key(|t| std::cmp::Reverse(t.count));
    skill_counts.truncate(12);
    out.skill_counts = skill_counts;

    out.heaviest = heaviest;
    out
}

// ── Context efficiency (cross-session attribution) ─────────────────────────
// Kiro and Agy have no token-usage data in their transcript formats at all
// (verified against real transcripts, not a version gap) — excluding them
// here means the tile never shows a broken/empty score for them, rather than
// leaving that to the frontend to notice.
const CONTEXT_EFFICIENCY_EXCLUDED_AGENTS: &[&str] = &["kiro", "agy"];

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentContextEfficiency {
    pub agent: String,
    pub sessions: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    /// True when any included session had no cache token accounting, so
    /// attribution leans on plain input deltas and is rougher.
    pub coarse: bool,
    /// 0..100. `100 - (compaction% + growth% of input tokens this window)`.
    /// A first-pass heuristic, not a final spec — sanity-check against real
    /// windows before treating the exact formula as settled.
    pub score: f64,
    /// Aggregated drivers with a hint, sorted by tokens desc, capped at 5.
    pub top_drivers: Vec<CachedDriver>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContextEfficiency {
    pub sessions_analyzed: u64,
    pub excluded_agents: Vec<String>,
    pub overall: AgentContextEfficiency,
    pub per_agent: Vec<AgentContextEfficiency>,
}

fn score_from(window: &super::attribution::WindowDrivers) -> f64 {
    if window.input_tokens == 0 {
        return 100.0;
    }
    let waste: u64 = window
        .drivers
        .iter()
        .filter(|d| d.side == "input" && (d.kind == "compaction" || d.kind == "growth"))
        .map(|d| d.tokens)
        .sum();
    let waste_pct = (waste as f64 / window.input_tokens as f64 * 100.0).clamp(0.0, 100.0);
    (100.0 - waste_pct).round()
}

fn agent_context_efficiency(
    agent: String,
    sessions: &[&CachedSessionDrivers],
) -> AgentContextEfficiency {
    let window = aggregate_drivers(sessions.iter().copied());
    let mut top_drivers: Vec<_> = window
        .drivers
        .iter()
        .filter(|d| d.hint.is_some())
        .cloned()
        .collect();
    top_drivers.sort_by_key(|d| std::cmp::Reverse(d.tokens));
    top_drivers.truncate(5);
    AgentContextEfficiency {
        agent,
        sessions: sessions.len() as u64,
        input_tokens: window.input_tokens,
        output_tokens: window.output_tokens,
        coarse: window.coarse,
        score: score_from(&window),
        top_drivers,
    }
}

/// Aggregate cached per-session attribution (`session_drivers`, populated by
/// [`upsert_session`]) across `since_ms <= ts < until_ms`, grouped by agent,
/// excluding agents with no usable token-usage data at all.
pub fn context_efficiency(
    db: &DbState,
    since_ms: u64,
    until_ms: u64,
    projects: Option<&[String]>,
) -> ContextEfficiency {
    struct Row {
        agent: String,
        project: String,
        drivers: CachedSessionDrivers,
    }

    let rows: Vec<Row> = {
        let conn = db.0.lock().unwrap();
        let mut stmt = match conn.prepare(
            "SELECT sd.drivers_json, ss.agent, ss.project
             FROM session_drivers sd JOIN session_stats ss ON ss.session_id = sd.session_id
             WHERE ss.ts >= ?1 AND ss.ts < ?2",
        ) {
            Ok(s) => s,
            Err(_) => return ContextEfficiency::default(),
        };
        stmt.query_map(
            [since_ms as i64, until_ms.min(i64::MAX as u64) as i64],
            |r| {
                let json: String = r.get(0)?;
                Ok(Row {
                    agent: r.get(1)?,
                    project: r.get(2)?,
                    drivers: serde_json::from_str(&json).unwrap_or_default(),
                })
            },
        )
        .map(|it| it.flatten().collect())
        .unwrap_or_default()
    };

    // Single source of truth for exclusion — filtered here in Rust, not
    // duplicated as a second hardcoded list in the SQL, so `excluded_agents`
    // (what the response tells the UI is excluded) can never drift from
    // what's actually excluded from `overall`/`per_agent`.
    let rows: Vec<Row> = rows
        .into_iter()
        .filter(|r| !CONTEXT_EFFICIENCY_EXCLUDED_AGENTS.contains(&r.agent.as_str()))
        .collect();
    let rows: Vec<Row> = match projects {
        Some(paths) => rows
            .into_iter()
            .filter(|r| paths.contains(&r.project))
            .collect(),
        None => rows,
    };

    let mut by_agent: HashMap<String, Vec<&CachedSessionDrivers>> = HashMap::new();
    for r in &rows {
        by_agent
            .entry(r.agent.clone())
            .or_default()
            .push(&r.drivers);
    }

    let all: Vec<&CachedSessionDrivers> = rows.iter().map(|r| &r.drivers).collect();
    let overall = agent_context_efficiency("all".to_string(), &all);

    let mut per_agent: Vec<AgentContextEfficiency> = by_agent
        .into_iter()
        .map(|(agent, sessions)| agent_context_efficiency(agent, &sessions))
        .collect();
    per_agent.sort_by(|a, b| a.agent.cmp(&b.agent));

    ContextEfficiency {
        sessions_analyzed: rows.len() as u64,
        excluded_agents: CONTEXT_EFFICIENCY_EXCLUDED_AGENTS
            .iter()
            .map(|s| s.to_string())
            .collect(),
        overall,
        per_agent,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        codex_skill_from_read, context_efficiency, est_cost, kiro_slash_skill, rates,
        skill_name_from_input, warm_reparse_decision, CachedDriver, CachedSessionDrivers,
    };

    #[test]
    fn warm_reparse_decision_skips_when_cached_and_unchanged() {
        assert_eq!(
            warm_reparse_decision(Some((100, 200)), Some((100, 200))),
            None
        );
    }

    #[test]
    fn warm_reparse_decision_reparses_when_file_changed() {
        assert_eq!(
            warm_reparse_decision(Some((150, 200)), Some((100, 200))),
            Some((150, 200))
        );
    }

    #[test]
    fn warm_reparse_decision_reparses_when_never_cached() {
        assert_eq!(
            warm_reparse_decision(Some((100, 200)), None),
            Some((100, 200))
        );
    }

    #[test]
    fn warm_reparse_decision_always_reparses_with_no_trackable_file() {
        // The exact bug this function exists to prevent: a session with no
        // trackable file (transcript_file() not overridden, or the file it
        // named doesn't exist) must never resolve to "skip" — regardless of
        // whatever happens to already be cached for it.
        assert_eq!(warm_reparse_decision(None, None), Some((0, 0)));
        assert_eq!(warm_reparse_decision(None, Some((999, 999))), Some((0, 0)));
    }

    fn test_db() -> crate::db::DbState {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate_for_test(&mut conn);
        crate::db::DbState(std::sync::Arc::new(std::sync::Mutex::new(conn)))
    }

    fn insert_session_with_drivers(
        db: &crate::db::DbState,
        session_id: &str,
        agent: &str,
        ts: i64,
        drivers: CachedSessionDrivers,
    ) {
        let conn = db.0.lock().unwrap();
        conn.execute(
            "INSERT INTO session_stats (session_id, agent, project, project_name, ts) VALUES (?1,?2,'/p','p',?3)",
            rusqlite::params![session_id, agent, ts],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO session_drivers (session_id, mtime, drivers_json) VALUES (?1, 1, ?2)",
            rusqlite::params![session_id, serde_json::to_string(&drivers).unwrap()],
        )
        .unwrap();
    }

    fn growth_drivers(tokens: u64) -> CachedSessionDrivers {
        CachedSessionDrivers {
            input_tokens: tokens,
            output_tokens: 0,
            coarse: false,
            drivers: vec![CachedDriver {
                side: "input".into(),
                kind: "growth".into(),
                name: "Conversation growth".into(),
                calls: 0,
                tokens,
                created_tokens: Some(tokens),
                reread_tokens: Some(0),
                approx_cost_usd: None,
                pct: 100.0,
                hint: None,
            }],
        }
    }

    #[test]
    fn context_efficiency_excludes_kiro_and_agy() {
        let db = test_db();
        insert_session_with_drivers(&db, "s-claude", "claude", 10, growth_drivers(100));
        insert_session_with_drivers(&db, "s-kiro", "kiro", 10, growth_drivers(9_999));

        let ce = context_efficiency(&db, 0, i64::MAX as u64, None);
        assert_eq!(ce.sessions_analyzed, 1);
        assert!(ce.per_agent.iter().all(|a| a.agent != "kiro"));
        assert_eq!(ce.overall.input_tokens, 100);
    }

    #[test]
    fn pricing_loads_from_bundled_json() {
        let (rin, rout) = rates("claude-opus-4-1").unwrap();
        assert!(rin > 0.0 && rout > rin);
        assert!(rates("gpt-5-codex").is_none());
        // 1M input + 1M output on sonnet ≈ input+output rates
        let cost = est_cost(1_000_000, 1_000_000, 0, 0, "claude-sonnet-4-5").unwrap();
        let (sin, sout) = rates("sonnet").unwrap();
        assert!((cost - (sin + sout)).abs() < 1e-9);
    }

    #[test]
    fn extracts_skill_name_from_json_and_truncated_input() {
        assert_eq!(
            skill_name_from_input(r#"{"skill":"graphify","args":"x"}"#),
            Some("graphify".to_string())
        );
        // Truncated JSON (parse fails) still yields the name
        assert_eq!(
            skill_name_from_input(r#"{"skill": "caveman", "args": "very long trunc"#),
            Some("caveman".to_string())
        );
        assert_eq!(skill_name_from_input(r#"{"args":"no skill"}"#), None);
    }

    #[test]
    fn kiro_slash_skill_matches_only_real_slash_invocations() {
        assert_eq!(
            kiro_slash_skill("/human-review fix the copy"),
            Some("human-review".into())
        );
        assert_eq!(kiro_slash_skill("  /graphify"), Some("graphify".into()));
        assert_eq!(
            kiro_slash_skill("/visualcave:visualcave x"),
            Some("visualcave:visualcave".into())
        );
        // builtins and non-slash prompts are ignored
        assert_eq!(kiro_slash_skill("/resume"), None);
        assert_eq!(kiro_slash_skill("/mcp"), None);
        assert_eq!(kiro_slash_skill("just a normal prompt"), None);
        assert_eq!(kiro_slash_skill("/"), None);
        assert_eq!(kiro_slash_skill("/Users/vk/some/path"), None); // has a slash mid-token
        assert_eq!(kiro_slash_skill("/123"), None); // no letters
    }

    #[test]
    fn codex_skill_from_read_pulls_the_dir_before_skill_md() {
        assert_eq!(
            codex_skill_from_read(
                r#"{"cmd":"sed -n '1,220p' /Users/x/.codex/skills/skill-creator/SKILL.md"}"#
            ),
            Some("skill-creator".into())
        );
        assert_eq!(
            codex_skill_from_read(r#"{"cmd":"cat ~/.agents/skills/app-name-check/SKILL.md"}"#),
            Some("app-name-check".into())
        );
        // the .system wrapper is not a skill; the skill dir sits under it
        assert_eq!(
            codex_skill_from_read(r#"{"cmd":"cat ~/.codex/skills/.system/imagegen/SKILL.md"}"#),
            Some("imagegen".into())
        );
        // no SKILL.md → nothing
        assert_eq!(codex_skill_from_read(r#"{"cmd":"ls src"}"#), None);
        assert_eq!(codex_skill_from_read(r#"{"cmd":"cat /SKILL.md"}"#), None);
    }

    #[test]
    fn extracts_skill_name_from_opencode_and_slash_shapes() {
        // OpenCode: skill({ name: "…" })
        assert_eq!(
            skill_name_from_input(r#"{"name":"algorithmic-art"}"#),
            Some("algorithmic-art".to_string())
        );
        // Slash form
        assert_eq!(
            skill_name_from_input(r#"{"command":"ship"}"#),
            Some("ship".to_string())
        );
        // "skill" still wins when several keys are present
        assert_eq!(
            skill_name_from_input(r#"{"name":"other","skill":"graphify"}"#),
            Some("graphify".to_string())
        );
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenPoint {
    pub ts_ms: u64,
    pub tokens: u64,
}

/// One (timestamp, input+output tokens) point per cached session — the
/// frontend buckets these into day/week/month series in local time.
pub fn token_activity(db: &DbState, since_ms: u64, projects: Option<&[String]>) -> Vec<TokenPoint> {
    let conn = db.0.lock().unwrap();
    let Ok(mut stmt) = conn.prepare(
        "SELECT ts, project, input_tokens + output_tokens FROM session_stats WHERE ts >= ?1",
    ) else {
        return vec![];
    };
    let points: Vec<(i64, String, i64)> = stmt
        .query_map([since_ms as i64], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map(|it| it.flatten().collect())
        .unwrap_or_default();
    points
        .into_iter()
        .filter(|(_, project, _)| projects.map(|p| p.contains(project)).unwrap_or(true))
        .map(|(ts, _, tokens)| TokenPoint {
            ts_ms: ts as u64,
            tokens: tokens.max(0) as u64,
        })
        .collect()
}

/// Earliest session timestamp on record, in ms — the floor for the "My Work"
/// Advanced date-range picker (nothing to show before the user's first
/// recorded session). `None` when the DB is empty.
pub fn first_session_ts(db: &DbState) -> Option<u64> {
    let conn = db.0.lock().unwrap();
    conn.query_row("SELECT MIN(ts) FROM session_stats", [], |r| {
        r.get::<_, Option<i64>>(0)
    })
    .ok()
    .flatten()
    .map(|ts| ts as u64)
}

#[cfg(test)]
mod smoke {
    // Runs against the real home dir: `cargo test -- --ignored warm_and_search`.
    #[test]
    #[ignore]
    fn warm_and_search_real_data() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate_for_test(&mut conn);
        let db = crate::db::DbState(std::sync::Arc::new(std::sync::Mutex::new(conn)));

        let t0 = std::time::Instant::now();
        let parsed = super::warm(&db);
        println!("warm: parsed {parsed} sessions in {:?}", t0.elapsed());

        let agents: Vec<(String, i64)> = {
            let conn = db.0.lock().unwrap();
            let mut stmt = conn
                .prepare("SELECT agent, COUNT(*) FROM session_stats GROUP BY agent")
                .unwrap();
            stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
                .unwrap()
                .flatten()
                .collect()
        };
        println!("session_stats rows by agent: {agents:?}");

        for q in ["error", "test", "fix"] {
            let hits = crate::db::search_transcripts(&db, q, 5);
            println!(
                "search '{q}': {} hits, first: {:?}",
                hits.len(),
                hits.first().map(|h| (
                    h.agent.clone(),
                    h.snippet.chars().take(60).collect::<String>()
                ))
            );
        }

        for u in super::usage_windows(&db) {
            println!(
                "usage {}: 5h {} tok (${:.2}, {} sessions) | 7d {} tok (${:.2}, {} sessions)",
                u.agent,
                u.tokens_5h,
                u.cost_5h,
                u.sessions_5h,
                u.tokens_7d,
                u.cost_7d,
                u.sessions_7d
            );
        }
    }

    /// Regression guard for the exact bug `warm_reparse_decision` was
    /// extracted to prevent: a session with no trackable file used to be
    /// silently skipped from `session_stats` forever, even though `list()`
    /// found it — invisible to every session_stats-backed tile (Usage per
    /// agent, Usage & cost, Context Efficiency) while still showing up in
    /// list()-backed ones (Hours spent, Parallel sessions). Run against the
    /// real home dir: `cargo test -- --ignored warm_covers_every_listed_session`.
    #[test]
    #[ignore]
    fn warm_covers_every_listed_session() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate_for_test(&mut conn);
        let db = crate::db::DbState(std::sync::Arc::new(std::sync::Mutex::new(conn)));

        super::warm(&db);

        let cached: std::collections::HashSet<String> = {
            let conn = db.0.lock().unwrap();
            let mut stmt = conn
                .prepare("SELECT session_id FROM session_stats")
                .unwrap();
            stmt.query_map([], |r| r.get::<_, String>(0))
                .unwrap()
                .flatten()
                .collect()
        };

        let mut missing: Vec<(String, String)> = Vec::new();
        for source in crate::engine::sessions::sources() {
            let limit = if source.agent_id() == "claude" {
                2000
            } else {
                500
            };
            for entry in source.list(limit) {
                if !cached.contains(&entry.session_id) {
                    missing.push((source.agent_id().to_string(), entry.session_id));
                }
            }
        }

        assert!(
            missing.is_empty(),
            "{} session(s) list() found but warm() never cached: {:?}",
            missing.len(),
            &missing[..missing.len().min(10)]
        );
    }
}
