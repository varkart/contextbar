use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTool {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
    pub installed: bool,
    pub install_path: Option<String>,
    pub skills: Vec<Skill>,
    pub mcps: Vec<McpServer>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServer {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub description: Option<String>,
    pub active: bool,
    pub has_secrets: bool,
    pub secret_key_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Vec<FileEntry>,
    pub extension: Option<String>, // e.g. "md", "mjs", "ts" — None for dirs
}
