use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct Manifest {
    #[allow(dead_code)]
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub detection: Vec<DetectionSpec>,
    pub version: Option<VersionSpec>,
    #[serde(default)]
    pub mcp_sources: Vec<McpSource>,
    #[serde(default)]
    pub skill_sources: Vec<SkillSource>,
    #[allow(dead_code)]
    pub mcp_toggle: Option<McpToggleSpec>,
    #[allow(dead_code)]
    pub skill_toggle: Option<SkillToggleSpec>,
    pub permissions: Option<PermissionsSpec>,
}

/// Declares where this tool's allow/deny permission lists live.
#[derive(Debug, Deserialize)]
pub struct PermissionsSpec {
    pub file: String,
    /// Key inside the JSON object that holds `{allow: [...], deny: [...]}`.
    /// Defaults to "permissions".
    #[serde(default = "default_permissions_key")]
    pub key: String,
}

fn default_permissions_key() -> String {
    "permissions".to_string()
}

/// Wrapper that pairs an MCP source spec with optional version bounds.
/// Both bounds are inclusive. Absent bound = unbounded.
/// If the detected tool version is unknown, the source always runs.
#[derive(Debug, Deserialize)]
pub struct McpSource {
    /// Stable identifier for this source entry, used as McpServer.source_id.
    /// Defaults to "source_{index}" if omitted.
    pub id: Option<String>,
    pub min_version: Option<String>,
    pub max_version: Option<String>,
    #[serde(flatten)]
    pub spec: McpSourceSpec,
}

/// Wrapper that pairs a skill source spec with optional version bounds.
#[derive(Debug, Deserialize)]
pub struct SkillSource {
    /// Stable identifier for this source entry, used as Skill.source_id.
    pub id: Option<String>,
    pub min_version: Option<String>,
    pub max_version: Option<String>,
    #[serde(flatten)]
    pub spec: SkillSourceSpec,
}

/// Explicit toggle strategy for MCP servers. When absent, the strategy is
/// derived automatically from the source spec (e.g. JsonKeyPair with
/// disabled_key → file-based key move).
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum McpToggleSpec {
    /// Invoke a CLI binary to enable/disable. Args may contain `{name}` which
    /// is replaced with the MCP server name at toggle time.
    #[allow(dead_code)]
    Cli {
        binary: String,
        disable_args: Vec<String>,
        enable_args: Vec<String>,
        #[serde(default = "default_timeout_ms")]
        timeout_ms: u64,
    },
    /// Move the server entry between two keys in a JSON config file.
    #[allow(dead_code)]
    JsonKeyPair {
        file: String,
        active_key: String,
        disabled_key: String,
    },
}

/// Explicit toggle strategy for skills. When absent, derived from source spec.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SkillToggleSpec {
    /// Move the skill directory into/out of a disabled subdirectory.
    #[allow(dead_code)]
    DirMove { disabled_subdir: String },
}

/// Each spec is one candidate. Tool is installed if ANY spec matches.
/// First matching spec provides the install_path.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DetectionSpec {
    Dir {
        path: String,
    },
    File {
        path: String,
    },
    Binary {
        name: String,
    },
    /// VSCode-style extension dir: `{extensions_dir}/{prefix}{version}` must exist.
    /// Detected version = the suffix after prefix in the dir name.
    VscodeExtension {
        extensions_dir: String,
        prefix: String,
    },
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum VersionSpec {
    /// Run a binary and capture version from stdout.
    /// If `binary` is omitted, uses the binary path found during detection.
    Command {
        binary: Option<String>,
        #[serde(default)]
        args: Vec<String>,
        #[serde(default = "default_timeout_ms")]
        timeout_ms: u64,
        /// "first_line" | "first_token"
        #[serde(default = "default_parse_mode")]
        parse: String,
    },
    /// Read a string value from a JSON file at a nested key path.
    JsonKey { file: String, key_path: Vec<String> },
}

fn default_timeout_ms() -> u64 {
    800
}
fn default_parse_mode() -> String {
    "first_line".to_string()
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum McpSourceSpec {
    /// JSON file with active_key (active) and optional disabled_key (disabled).
    #[allow(dead_code)]
    JsonKeyPair {
        file: String,
        #[serde(default = "default_mcp_key")]
        active_key: String,
        disabled_key: Option<String>,
        #[serde(default)]
        jsonc: bool,
    },
    /// JSON file where all servers live at a nested key path, all treated as active.
    JsonNested {
        file: String,
        key_path: Vec<String>,
        #[serde(default)]
        jsonc: bool,
    },
    /// Zed's context_servers schema: command nested as {command: {path, args}}.
    ZedContextServers { file: String, key_path: Vec<String> },
    /// Directory of extension subdirs each containing a manifest JSON file.
    ExtensionDir {
        dir: String,
        manifest_file: String,
        enablement_file: Option<String>,
        /// Template var in args replaced with the extension's absolute dir path.
        extension_path_var: Option<String>,
    },
    /// Claude Code plugin system: read installed_plugins.json, then each plugin's .mcp.json.
    ClaudePlugins {
        installed_plugins_file: String,
        mcp_filename: String,
    },
    /// YAML file with active_key containing an mcpServers-style map.
    YamlKeyPair {
        file: String,
        #[serde(default = "default_mcp_key")]
        active_key: String,
    },
    /// TOML file where servers live at a dotted key path, all treated as active.
    TomlKeyPair {
        file: String,
        #[serde(default = "default_mcp_key")]
        active_key: String,
        /// Move entries between sections to disable (e.g. "disabled_mcp_servers").
        disabled_key: Option<String>,
        /// Set a boolean field on the entry to disable (e.g. "enabled" → false).
        inline_toggle_field: Option<String>,
    },
    /// Claude Code's ~/.claude.json: collects mcpServers from all projects entries,
    /// deduplicated by name (first occurrence wins).
    ClaudeDotfile { file: String },
    /// Run `claude mcp list` and parse its output to capture cloud-synced MCPs
    /// (e.g. claude.ai Context7, Google Drive) that have no local config file.
    ClaudeMcpList {
        #[serde(default = "default_claude_binary")]
        binary: String,
        #[serde(default = "default_mcp_list_timeout_ms")]
        timeout_ms: u64,
    },
}

fn default_claude_binary() -> String {
    "claude".to_string()
}
fn default_mcp_list_timeout_ms() -> u64 {
    6000
}

fn default_mcp_key() -> String {
    "mcpServers".to_string()
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SkillSourceSpec {
    Directory {
        path: String,
        disabled_subdir: Option<String>,
        /// When true, skills are stored as flat `{name}.md` files rather than
        /// `{name}/SKILL.md` subdirectories (e.g. Windsurf workflows).
        #[serde(default)]
        flat_files: bool,
    },
}
