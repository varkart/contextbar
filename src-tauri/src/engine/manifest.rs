use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct Manifest {
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
}

/// Wrapper that pairs an MCP source spec with optional version bounds.
/// Both bounds are inclusive. Absent bound = unbounded.
/// If the detected tool version is unknown, the source always runs.
#[derive(Debug, Deserialize)]
pub struct McpSource {
    pub min_version: Option<String>,
    pub max_version: Option<String>,
    #[serde(flatten)]
    pub spec: McpSourceSpec,
}

/// Wrapper that pairs a skill source spec with optional version bounds.
#[derive(Debug, Deserialize)]
pub struct SkillSource {
    pub min_version: Option<String>,
    pub max_version: Option<String>,
    #[serde(flatten)]
    pub spec: SkillSourceSpec,
}

/// Each spec is one candidate. Tool is installed if ANY spec matches.
/// First matching spec provides the install_path.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DetectionSpec {
    Dir { path: String },
    File { path: String },
    Binary { name: String },
    /// VSCode-style extension dir: `{extensions_dir}/{prefix}{version}` must exist.
    /// Detected version = the suffix after prefix in the dir name.
    VscodeExtension { extensions_dir: String, prefix: String },
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
    JsonKey {
        file: String,
        key_path: Vec<String>,
    },
}

fn default_timeout_ms() -> u64 { 800 }
fn default_parse_mode() -> String { "first_line".to_string() }

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum McpSourceSpec {
    /// JSON file with active_key (active) and optional disabled_key (disabled).
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
    ZedContextServers {
        file: String,
        key_path: Vec<String>,
    },
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
    },
    /// Claude Code's ~/.claude.json: collects mcpServers from all projects entries,
    /// deduplicated by name (first occurrence wins).
    ClaudeDotfile {
        file: String,
    },
}

fn default_mcp_key() -> String { "mcpServers".to_string() }

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SkillSourceSpec {
    Directory {
        path: String,
        disabled_subdir: Option<String>,
    },
}
