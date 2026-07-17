//! Background aggregation of per-session statistics (tokens, model, tool
//! calls) into SQLite. Session JSONL files are parsed at most once per
//! (mtime, size) — re-parsing only happens when a file changes, so the warm
//! pass is cheap after the first run.

use super::{index, parser};
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTokens {
    pub project: String,
    pub project_name: String,
    pub tokens: u64,
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
    pub tool_counts: Vec<ToolCount>,
    pub mcp_tool_counts: Vec<ToolCount>,
    pub skill_counts: Vec<ToolCount>,
    pub heaviest: Option<HeaviestSession>,
}

/// Extract the invoked skill name from a Skill tool_use input.
/// `tool_input` is a possibly-truncated JSON string like {"skill":"graphify",…}.
fn skill_name_from_input(input: &str) -> Option<String> {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(input) {
        if let Some(s) = v.get("skill").and_then(|s| s.as_str()) {
            return Some(s.to_string());
        }
    }
    // Truncated JSON fallback: find "skill":"…"
    let idx = input.find("\"skill\"")?;
    let rest = &input[idx + 7..];
    let start = rest.find('"')? + 1;
    let end = rest[start..].find('"')? + start;
    Some(rest[start..end].to_string())
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

fn rates(model: &str) -> Option<(f64, f64)> {
    let m = model.to_lowercase();
    pricing()
        .models
        .iter()
        .find(|p| m.contains(&p.pattern))
        .map(|p| (p.input_per_mtok, p.output_per_mtok))
}

fn est_cost(
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
    out.sort_by(|a, b| b.tokens_7d.cmp(&a.tokens_7d));
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
            let Some(path) = source.transcript_file(&entry) else {
                continue;
            };
            let Ok(meta) = std::fs::metadata(&path) else {
                continue;
            };
            let mtime = meta
                .modified()
                .ok()
                .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            let size = meta.len() as i64;

            let cached: Option<(i64, i64)> = {
                let conn = db.0.lock().unwrap();
                conn.query_row(
                    "SELECT mtime, size FROM session_stats WHERE session_id = ?1",
                    [&entry.session_id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .ok()
            };
            if cached == Some((mtime, size)) {
                continue;
            }

            // Claude fast path: source.get() would rescan history.jsonl per
            // session to find the project; we already have it on the entry.
            let detail = if is_claude {
                parser::get_session(&home, &entry.session_id, &entry.project, entry.timestamp)
            } else {
                source.get(&entry.session_id)
            };
            let Some(detail) = detail else {
                continue;
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
                    if name == "Skill" {
                        if let Some(skill) =
                            block.tool_input.as_deref().and_then(skill_name_from_input)
                        {
                            *skill_calls.entry(skill).or_insert(0) += 1;
                        }
                    }
                }
            }
        }
    }
    let tool_calls_json = serde_json::to_string(&tool_calls).unwrap_or_else(|_| "{}".into());
    let skill_calls_json = serde_json::to_string(&skill_calls).unwrap_or_else(|_| "{}".into());
    let t = &detail.total_tokens;

    let conn = db.0.lock().unwrap();
    let _ = conn.execute(
        "INSERT INTO session_stats
               (session_id, agent, project, project_name, display, ts, model,
                input_tokens, output_tokens, cache_read, cache_creation,
                msg_count, tool_calls, skill_calls, mtime, size)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)
             ON CONFLICT(session_id) DO UPDATE SET
               ts=excluded.ts, model=excluded.model,
               input_tokens=excluded.input_tokens, output_tokens=excluded.output_tokens,
               cache_read=excluded.cache_read, cache_creation=excluded.cache_creation,
               msg_count=excluded.msg_count, tool_calls=excluded.tool_calls,
               skill_calls=excluded.skill_calls, mtime=excluded.mtime, size=excluded.size",
        rusqlite::params![
            entry.session_id,
            entry.agent,
            entry.project,
            entry.project_name,
            entry.display,
            entry.timestamp as i64,
            detail.model.clone().unwrap_or_default(),
            t.input_tokens as i64,
            t.output_tokens as i64,
            t.cache_read_tokens as i64,
            t.cache_creation_tokens as i64,
            detail.messages.len() as i64,
            tool_calls_json,
            skill_calls_json,
            mtime,
            size,
        ],
    );
    drop(conn);

    let mut text = transcript_text(detail);
    if text.is_empty() {
        text = entry.display.clone();
    }
    crate::db::index_transcript(db, &entry.session_id, &entry.agent, &text);
}

/// Aggregate cached rows with `ts >= since_ms` into one insights payload.
/// When `projects` is set, only sessions whose cwd is one of those paths
/// count (used for per-repo insights; a repo passes all its worktree paths).
pub fn aggregate(db: &DbState, since_ms: u64, projects: Option<&[String]>) -> SessionInsights {
    struct Row {
        session_id: String,
        project: String,
        project_name: String,
        display: String,
        model: String,
        input: u64,
        output: u64,
        cache_read: u64,
        cache_creation: u64,
        tool_calls: HashMap<String, u64>,
        skill_calls: HashMap<String, u64>,
    }

    let rows: Vec<Row> = {
        let conn = db.0.lock().unwrap();
        let mut stmt = match conn.prepare(
            "SELECT session_id, project, project_name, display, model,
                    input_tokens, output_tokens, cache_read, cache_creation, tool_calls,
                    skill_calls
             FROM session_stats WHERE ts >= ?1",
        ) {
            Ok(s) => s,
            Err(_) => return SessionInsights::default(),
        };
        stmt.query_map([since_ms as i64], |r| {
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
            })
        })
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
        let p = per_project
            .entry(row.project.clone())
            .or_insert_with(|| ProjectTokens {
                project: row.project.clone(),
                project_name: row.project_name.clone(),
                tokens: 0,
            });
        p.tokens += session_tokens;

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

    let mut per_project: Vec<ProjectTokens> = per_project.into_values().collect();
    per_project.sort_by_key(|p| std::cmp::Reverse(p.tokens));
    per_project.truncate(8);
    out.per_project = per_project;

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
    let mut mcp_counts: Vec<ToolCount> = mcp_by_server
        .into_iter()
        .map(|(name, count)| ToolCount { name, count })
        .collect();
    mcp_counts.sort_by_key(|t| std::cmp::Reverse(t.count));
    mcp_counts.truncate(8);
    out.mcp_tool_counts = mcp_counts;

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

#[cfg(test)]
mod tests {
    use super::{est_cost, rates, skill_name_from_input};

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

/// All prompt timestamps (ms) from history.jsonl newer than `since_ms` —
/// powers the activity heatmap; bucketing happens frontend-side in local time.
pub fn prompt_timestamps(since_ms: u64) -> Vec<u64> {
    let Some(home) = dirs::home_dir() else {
        return vec![];
    };
    let path = index::history_jsonl_path(&home);
    let Ok(content) = std::fs::read_to_string(&path) else {
        return vec![];
    };

    #[derive(serde::Deserialize)]
    struct Line {
        timestamp: Option<u64>,
    }
    content
        .lines()
        .filter_map(|l| serde_json::from_str::<Line>(l.trim()).ok())
        .filter_map(|l| l.timestamp)
        .filter(|ts| *ts >= since_ms)
        .collect()
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
}
