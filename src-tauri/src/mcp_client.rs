use std::process::Stdio;
use std::sync::OnceLock;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines};
use tokio::process::{ChildStdout, Command as AsyncCommand};
use tokio::time::{timeout, Duration};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct McpTool {
    pub name: String,
    pub description: Option<String>,
    pub input_schema: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Login-shell env capture (macOS GUI apps don't inherit shell env)
// ---------------------------------------------------------------------------

static LOGIN_ENV: OnceLock<Vec<(String, String)>> = OnceLock::new();

fn login_env() -> &'static [(String, String)] {
    LOGIN_ENV.get_or_init(|| {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let Ok(out) = std::process::Command::new(&shell)
            .args(["-l", "-c", "env"])
            .output()
        else {
            return vec![];
        };
        String::from_utf8_lossy(&out.stdout)
            .lines()
            .filter_map(|line| {
                let (k, v) = line.split_once('=')?;
                Some((k.to_string(), v.to_string()))
            })
            .collect()
    })
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/// Query tools from an MCP server. Supports stdio (command) and HTTP (url).
pub async fn query_tools(
    command: &str,
    args: &[String],
    url: Option<&str>,
) -> Result<Vec<McpTool>, String> {
    if let Some(u) = url.filter(|u| !u.is_empty()) {
        if command.is_empty() {
            return query_http_tools(u).await;
        }
    }
    if command.is_empty() {
        return Ok(vec![]);
    }
    query_stdio_tools(command, args).await
}

// ---------------------------------------------------------------------------
// Stdio transport
// ---------------------------------------------------------------------------

async fn query_stdio_tools(command: &str, args: &[String]) -> Result<Vec<McpTool>, String> {
    let mut child = AsyncCommand::new(command)
        .args(args)
        .envs(login_env().iter().cloned())
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

    // 2. Wait for initialize response — skip notifications/log lines.
    // Use a generous timeout: on first run, uvx/pipx/cargo-based servers may
    // need to download or compile before responding.
    wait_for_response(&mut lines, 1, Duration::from_secs(20))
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

    // 5. Wait for tools/list response
    let line = wait_for_response(&mut lines, 2, Duration::from_secs(5))
        .await
        .map_err(|e| format!("tools/list: {e}"))?;

    let _ = child.kill().await;

    parse_tools_response(&line)
}

// ---------------------------------------------------------------------------
// HTTP transport (Streamable HTTP / SSE MCPs)
// ---------------------------------------------------------------------------

async fn query_http_tools(url: &str) -> Result<Vec<McpTool>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    // initialize
    client
        .post(url)
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "LLM Manager", "version": env!("CARGO_PKG_VERSION") }
            }
        }))
        .send()
        .await
        .map_err(|e| format!("HTTP initialize: {e}"))?;

    // tools/list
    let resp: serde_json::Value = client
        .post(url)
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }))
        .send()
        .await
        .map_err(|e| format!("HTTP tools/list: {e}"))?
        .json()
        .await
        .map_err(|e| format!("HTTP parse: {e}"))?;

    parse_tools_value(&resp)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn parse_tools_response(line: &str) -> Result<Vec<McpTool>, String> {
    let resp: serde_json::Value = serde_json::from_str(line).map_err(|e| e.to_string())?;
    parse_tools_value(&resp)
}

fn parse_tools_value(resp: &serde_json::Value) -> Result<Vec<McpTool>, String> {
    Ok(resp
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
        .unwrap_or_default())
}

/// Read lines until one is a JSON-RPC response with the given `id`.
/// Skips notifications (no numeric `id`) and non-JSON log lines.
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

        let trimmed = line.trim();
        if trimmed.is_empty() || !trimmed.starts_with('{') {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
            match v.get("id") {
                Some(serde_json::Value::Number(n)) if n.as_u64() == Some(id) => {
                    return Ok(line);
                }
                Some(serde_json::Value::Number(_)) => continue,
                _ => continue,
            }
        }
    }
}
