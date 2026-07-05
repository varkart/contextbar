use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
    pub installed: bool,
    pub install_path: Option<String>,
    pub skills: Vec<Skill>,
    pub mcps: Vec<McpServer>,
    pub error: Option<String>,
    /// True when the tool's manifest defines at least one [[skill_sources]] entry.
    pub supports_skills: bool,
    /// True when the tool's manifest defines at least one [[mcp_sources]] entry.
    pub supports_mcps: bool,
    /// Expanded absolute paths of the config files this agent reads/writes.
    /// Used by the restore UI to list backup snapshots.
    pub config_files: Vec<String>,
    /// Parse errors encountered while reading config files (e.g. malformed JSON/YAML/TOML).
    /// When non-empty the UI shows a read-only banner and disables toggles.
    pub config_errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    /// True when a SKILL.md (or sibling .md) exists — content is fetched on demand via get_skill_full_description.
    pub has_full_description: bool,
    pub active: bool,
    /// Which [[skill_sources]] entry produced this skill. Matches McpSource.id or "source_{n}".
    pub source_id: String,
    /// Optional URL from the `source:` frontmatter field (e.g. a GitHub link).
    pub source_url: Option<String>,
    /// FNV-1a hash of the SKILL.md content — used to detect variants across tools.
    pub content_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServer {
    pub name: String,
    pub command: String, // empty string for HTTP-only MCPs
    pub args: Vec<String>,
    pub url: Option<String>, // set for HTTP MCPs (e.g. Gemini github extension)
    pub description: Option<String>,
    pub active: bool,
    pub has_secrets: bool,
    pub secret_key_names: Vec<String>,
    pub extension_name: Option<String>, // set for extension-dir MCPs (e.g. Gemini extensions)
    /// Which [[mcp_sources]] entry produced this server. Matches McpSource.id or "source_{n}".
    pub source_id: String,
    /// Tools disabled per-server via "disabledTools" key (agy/Gemini mcp_config.json).
    #[serde(default)]
    pub disabled_tools: Vec<String>,
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
