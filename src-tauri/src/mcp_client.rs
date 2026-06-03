use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command as AsyncCommand;
use tokio::time::{timeout, Duration};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct McpTool {
    pub name: String,
    pub description: Option<String>,
    pub input_schema: Option<serde_json::Value>,
}

/// Spawn an MCP server via stdio, run initialize + tools/list, return tool list.
/// Times out after 8 seconds total.
pub async fn query_tools(command: &str, args: &[String]) -> Result<Vec<McpTool>, String> {
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
            "clientInfo": { "name": "aicontextbar", "version": env!("CARGO_PKG_VERSION") }
        }
    });
    stdin
        .write_all(format!("{}\n", init).as_bytes())
        .await
        .map_err(|e| e.to_string())?;

    // 2. Read initialize response
    timeout(Duration::from_secs(5), lines.next_line())
        .await
        .map_err(|_| "timeout on initialize")?
        .map_err(|e| e.to_string())?
        .ok_or("server closed stdout before initialize response")?;

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

    // 5. Read tools/list response
    let line = timeout(Duration::from_secs(5), lines.next_line())
        .await
        .map_err(|_| "timeout on tools/list")?
        .map_err(|e| e.to_string())?
        .ok_or("server closed stdout before tools/list response")?;

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
                    if name.is_empty() { return None; }
                    Some(McpTool {
                        name,
                        description: t.get("description").and_then(|d| d.as_str()).map(|s| s.to_string()),
                        input_schema: t.get("inputSchema").cloned(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(tools)
}
