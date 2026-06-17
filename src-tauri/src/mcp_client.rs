use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines};
use tokio::process::{ChildStdout, Command as AsyncCommand};
use tokio::time::{timeout, Duration};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct McpTool {
    pub name: String,
    pub description: Option<String>,
    pub input_schema: Option<serde_json::Value>,
}

/// Spawn an MCP server via stdio, run initialize + tools/list, return tool list.
/// Times out after 8 seconds total. Returns empty list for HTTP MCPs (no command).
pub async fn query_tools(command: &str, args: &[String]) -> Result<Vec<McpTool>, String> {
    if command.is_empty() {
        return Ok(vec![]);
    }
    let mut child = AsyncCommand::new(command)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("failed to start MCP server: {e}"))?;

    let mut stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let mut lines = BufReader::new(stdout).lines();

    // 1. Send initialize
    let init = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": { "name": "LLM Manager", "version": env!("CARGO_PKG_VERSION") }
        }
    });
    stdin
        .write_all(format!("{}\n", init).as_bytes())
        .await
        .map_err(|e| e.to_string())?;

    // 2. Read initialize response — skip notifications/log lines until id=1 response arrives
    wait_for_response(&mut lines, 1, Duration::from_secs(5))
        .await
        .map_err(|e| format!("initialize: {e}"))?;

    // 3. Send initialized notification
    let notif = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "notifications/initialized",
        "params": {}
    });
    stdin
        .write_all(format!("{}\n", notif).as_bytes())
        .await
        .map_err(|e| e.to_string())?;

    // 4. Send tools/list
    let tools_req = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/list",
        "params": {}
    });
    stdin
        .write_all(format!("{}\n", tools_req).as_bytes())
        .await
        .map_err(|e| e.to_string())?;

    // 5. Read tools/list response — skip notifications until id=2 response arrives
    let line = wait_for_response(&mut lines, 2, Duration::from_secs(5))
        .await
        .map_err(|e| format!("tools/list: {e}"))?;

    let _ = child.kill().await;

    let resp: serde_json::Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;

    let tools = resp
        .get("result")
        .and_then(|r| r.get("tools"))
        .and_then(|t| t.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|t| {
                    let name = t.get("name")?.as_str()?.to_string();
                    if name.is_empty() {
                        return None;
                    }
                    Some(McpTool {
                        name,
                        description: t
                            .get("description")
                            .and_then(|d| d.as_str())
                            .map(|s| s.to_string()),
                        input_schema: t.get("inputSchema").cloned(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(tools)
}

/// Read lines until one is a JSON-RPC response with the given `id`.
/// Skips notifications (no `id`) and log lines (non-JSON).
/// Returns the matching line or an error if timeout or stream closes.
async fn wait_for_response(
    lines: &mut Lines<BufReader<ChildStdout>>,
    id: u64,
    dur: Duration,
) -> Result<String, String> {
    let deadline = tokio::time::Instant::now() + dur;
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return Err(format!("timeout waiting for id={id}"));
        }
        let line = timeout(remaining, lines.next_line())
            .await
            .map_err(|_| format!("timeout waiting for id={id}"))?
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("server closed stdout waiting for id={id}"))?;

        // Skip empty lines and non-JSON (log output, etc.)
        let trimmed = line.trim();
        if trimmed.is_empty() || !trimmed.starts_with('{') {
            continue;
        }
        // Skip notifications (they have "method" but no numeric "id")
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
            match v.get("id") {
                Some(serde_json::Value::Number(n)) if n.as_u64() == Some(id) => {
                    return Ok(line);
                }
                Some(serde_json::Value::Number(_)) => continue, // different id
                _ => continue, // notification or non-matching
            }
        }
    }
}
