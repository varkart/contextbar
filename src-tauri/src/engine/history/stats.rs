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
    pub heaviest: Option<HeaviestSession>,
}

/// Approximate public API list prices in USD per MTok (input, output).
/// Cache reads billed at 0.1× input, cache writes at 1.25× input.
/// Estimates only — update when pricing changes.
fn rates(model: &str) -> Option<(f64, f64)> {
    let m = model.to_lowercase();
    if m.contains("opus") {
        Some((15.0, 75.0))
    } else if m.contains("sonnet") {
        Some((3.0, 15.0))
    } else if m.contains("haiku") {
        Some((1.0, 5.0))
    } else {
        None
    }
}

fn est_cost(
    input: u64,
    output: u64,
    cache_read: u64,
    cache_creation: u64,
    model: &str,
) -> Option<f64> {
    let (rin, rout) = rates(model)?;
    let mtok = 1_000_000.0;
    Some(
        input as f64 / mtok * rin
            + output as f64 / mtok * rout
            + cache_read as f64 / mtok * rin * 0.1
            + cache_creation as f64 / mtok * rin * 1.25,
    )
}

/// Parse any session files that are new or changed since the last warm pass
/// and upsert one stats row per session. Returns the number of (re)parsed
/// sessions. Safe to call repeatedly.
pub fn warm(db: &DbState) -> usize {
    let Some(home) = dirs::home_dir() else {
        return 0;
    };
    // Large limit — the index read is cheap; parsing is what the cache guards.
    let entries = index::list_sessions(&home, 2000, 0, None, None);
    let mut parsed = 0usize;

    for entry in entries {
        let path = index::session_file_path(&home, &entry.project, &entry.session_id);
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

        let Some(detail) =
            parser::get_session(&home, &entry.session_id, &entry.project, entry.timestamp)
        else {
            continue;
        };

        let mut tool_calls: HashMap<String, u64> = HashMap::new();
        for msg in &detail.messages {
            for block in &msg.content {
                if block.block_type == "tool_use" {
                    if let Some(name) = &block.tool_name {
                        *tool_calls.entry(name.clone()).or_insert(0) += 1;
                    }
                }
            }
        }
        let tool_calls_json = serde_json::to_string(&tool_calls).unwrap_or_else(|_| "{}".into());
        let t = &detail.total_tokens;

        let conn = db.0.lock().unwrap();
        let _ = conn.execute(
            "INSERT INTO session_stats
               (session_id, project, project_name, display, ts, model,
                input_tokens, output_tokens, cache_read, cache_creation,
                msg_count, tool_calls, mtime, size)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
             ON CONFLICT(session_id) DO UPDATE SET
               ts=excluded.ts, model=excluded.model,
               input_tokens=excluded.input_tokens, output_tokens=excluded.output_tokens,
               cache_read=excluded.cache_read, cache_creation=excluded.cache_creation,
               msg_count=excluded.msg_count, tool_calls=excluded.tool_calls,
               mtime=excluded.mtime, size=excluded.size",
            rusqlite::params![
                entry.session_id,
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
                mtime,
                size,
            ],
        );
        parsed += 1;
    }
    parsed
}

/// Aggregate cached rows with `ts >= since_ms` into one insights payload.
pub fn aggregate(db: &DbState, since_ms: u64) -> SessionInsights {
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
    }

    let rows: Vec<Row> = {
        let conn = db.0.lock().unwrap();
        let mut stmt = match conn.prepare(
            "SELECT session_id, project, project_name, display, model,
                    input_tokens, output_tokens, cache_read, cache_creation, tool_calls
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
            })
        })
        .map(|it| it.flatten().collect())
        .unwrap_or_default()
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

    out.heaviest = heaviest;
    out
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
