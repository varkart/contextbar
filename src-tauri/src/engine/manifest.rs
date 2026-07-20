use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct Manifest {
    #[allow(dead_code)]
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    /// Agent name used by the `npx skills` CLI (e.g. "claude-code", "codex").
    /// When set, enables cross-tool skill install from GitHub for this agent.
    pub skills_agent_name: Option<String>,
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
    #[serde(default)]
    pub capabilities: Vec<CapabilitySpec>,
}

/// A user-togglable feature/context switch backed by a config-file write.
/// Adding an entry here is all it takes to surface a new toggle in the UI.
#[derive(Debug, Clone, Deserialize)]
pub struct CapabilitySpec {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub description: Option<String>,
    /// Longer helper text for hover tooltips — verbatim from the agent's own
    /// documentation where available. Falls back to `description` in the UI.
    #[serde(default)]
    pub help: Option<String>,
    /// "What to expect" markdown for the capability detail view (behavioral
    /// consequences, /context before/after). Optional; the UI auto-generates
    /// a fallback from the writer spec when absent.
    #[serde(default)]
    pub example: Option<String>,
    /// Grouping in the UI: "context" | "tools" | "features" | "limits".
    pub category: String,
    /// Rough startup-context tokens saved when disabled. Estimate — shown
    /// as "~N tok (est.)" in the UI, never as a precise number.
    #[serde(default)]
    pub tokens_hint: Option<u32>,
    /// Control shape: "toggle" (on/off, the default) or "enum" (value picker).
    #[serde(default = "default_kind")]
    pub kind: String,
    /// Allowed values for kind = "enum".
    #[serde(default)]
    pub values: Vec<String>,
    /// The value in effect when the key is absent (enum kinds). Selecting it
    /// removes the key, restoring the agent's default.
    #[serde(default)]
    pub default_value: Option<String>,
    /// Toggle state when the key is absent. Most features default on; set
    /// false for features the agent ships disabled (e.g. Codex memories).
    #[serde(default = "default_true")]
    pub default_on: bool,
    pub writer: CapabilityWriter,
}

fn default_kind() -> String {
    "toggle".to_string()
}
fn default_true() -> bool {
    true
}

/// How a capability's on/off state maps onto a config file. One arm per
/// mechanism; new config formats extend this enum.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CapabilityWriter {
    /// A JSON key whose presence with `off_value` turns the feature OFF.
    /// Turning ON removes the key (restores the agent's default).
    JsonFlag {
        file: String,
        key: String,
        off_value: serde_json::Value,
    },
    /// Membership in a JSON string array at a dotted `path` (e.g.
    /// "permissions.deny"): member present = feature OFF. Use `members` when
    /// one switch must toggle several entries atomically (e.g. plan mode =
    /// EnterPlanMode + ExitPlanMode).
    JsonListMember {
        file: String,
        path: String,
        #[serde(default)]
        member: Option<String>,
        #[serde(default)]
        members: Vec<String>,
    },
    /// A (dotted) key in a TOML config file — e.g. Codex `features.multi_agent`
    /// or `approval_policy`. Toggle: OFF writes `off_value`, ON removes the
    /// key. Enum: writes the selected string, default removes the key.
    TomlKey {
        file: String,
        key: String,
        #[serde(default)]
        off_value: Option<serde_json::Value>,
    },
}

impl CapabilityWriter {
    /// Effective member list for JsonListMember (singular + plural merged).
    pub fn list_members(&self) -> Vec<&str> {
        match self {
            CapabilityWriter::JsonListMember { member, members, .. } => member
                .iter()
                .map(|s| s.as_str())
                .chain(members.iter().map(|s| s.as_str()))
                .collect(),
            _ => vec![],
        }
    }
}

/// Declares where this tool's allow/deny permission lists live.
#[derive(Debug, Deserialize)]
pub struct PermissionsSpec {
    pub file: String,
    /// Key inside the JSON object that holds the allow/deny sub-object.
    /// Defaults to "permissions".
    #[serde(default = "default_permissions_key")]
    pub key: String,
    /// Name of the allow-list field inside the sub-object. Defaults to "allow".
    /// Override for tools that use different names (e.g. Gemini uses "allowed").
    #[serde(default = "default_allow_key")]
    pub allow_key: String,
    /// Name of the deny-list field inside the sub-object. Defaults to "deny".
    /// Override for tools that use different names (e.g. Gemini uses "exclude").
    #[serde(default = "default_deny_key")]
    pub deny_key: String,
    /// Name of the ask-list field, for agents that support prompt-on-match
    /// rules (Claude Code's "ask"). Absent = agent has no ask concept and the
    /// key is never written.
    #[serde(default)]
    pub ask_key: Option<String>,
}

fn default_permissions_key() -> String {
    "permissions".to_string()
}
fn default_allow_key() -> String {
    "allow".to_string()
}
fn default_deny_key() -> String {
    "deny".to_string()
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
    /// Scan `{marketplaces_dir}/*/plugins/*/` for `.mcp.json` files.
    /// Used to discover individual marketplace plugin MCPs separate from the
    /// installed plugin bundle (e.g. bdc-forge figma, playwright, skylab plugins).
    MarketplacePlugins {
        marketplaces_dir: String,
        mcp_filename: String,
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
    /// Walk a plugins directory: for each subdirectory containing `manifest_file`,
    /// read skills from `plugin_dir/skills/<name>/SKILL.md`.
    /// Used by agy: plugins at `~/.gemini/antigravity-cli/plugins/<plugin>/skills/`.
    ExtensionDirSkills { dir: String, manifest_file: String },
    /// Skills live in a directory but active/inactive state is controlled by a
    /// TOML config file that contains an array of `{path_field, enabled_field}` entries.
    /// Used by Codex: `[[skills.config]]` in `~/.codex/config.toml`.
    TomlConfigDirectory {
        path: String,
        config_file: String,
        /// Key path to the array within the TOML file (e.g. ["skills", "config"]).
        #[serde(default)]
        config_key_path: Vec<String>,
        /// Field on each array entry that holds the skill's SKILL.md path.
        #[serde(default = "default_path_field")]
        path_field: String,
        /// Boolean field that controls enabled state (default true when absent).
        #[serde(default = "default_enabled_field")]
        enabled_field: String,
    },
}

fn default_path_field() -> String {
    "path".to_string()
}
fn default_enabled_field() -> String {
    "enabled".to_string()
}
