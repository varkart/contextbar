use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionEntry {
    pub session_id: String,
    pub display: String,
    pub timestamp: u64,
    pub project: String,
    pub project_name: String,
    pub total_tokens: u64,
    pub model: Option<String>,
    pub duration_minutes: Option<u64>,
    pub is_live: bool,
    pub error_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDetail {
    pub session_id: String,
    pub messages: Vec<Message>,
    pub total_tokens: TokenUsage,
    pub model: Option<String>,
    pub duration_ms: Option<u64>,
    pub project: String,
    pub project_name: String,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub role: String,
    pub content: Vec<ContentBlock>,
    pub timestamp: Option<u64>,
    pub model: Option<String>,
    pub usage: Option<TokenUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentBlock {
    pub block_type: String,
    pub text: Option<String>,
    pub tool_name: Option<String>,
    pub tool_input: Option<String>,
    pub tool_result: Option<String>,
    pub is_error: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_creation_tokens: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryStats {
    pub total_sessions: usize,
    pub total_tokens: u64,
    pub live_session_id: Option<String>,
}
