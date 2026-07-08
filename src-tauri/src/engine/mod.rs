pub mod jsonc;
pub mod manifest;
pub mod mcp;
pub mod resolve;
pub mod skill;

use crate::models::Agent;
use manifest::{DetectionSpec, Manifest, McpSourceSpec, SkillSourceSpec, VersionSpec};
use resolve::expand_home;

// ── Embed all manifests at compile time ──────────────────────────────────────

macro_rules! manifest_toml {
    ($name:literal) => {
        include_str!(concat!("manifests/", $name, ".toml"))
    };
}

fn all_manifest_strs() -> &'static [(&'static str, &'static str)] {
    &[
        ("claude", manifest_toml!("claude")),
        ("cursor", manifest_toml!("cursor")),
        ("gemini", manifest_toml!("gemini")),
        ("copilot", manifest_toml!("copilot")),
        ("windsurf", manifest_toml!("windsurf")),
        ("kiro", manifest_toml!("kiro")),
        ("codex", manifest_toml!("codex")),
        ("agy", manifest_toml!("agy")),
    ]
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Parse and return the manifest for a given tool id.
pub fn load_manifest(tool_id: &str) -> Option<manifest::Manifest> {
    all_manifest_strs()
        .iter()
        .find(|(id, _)| *id == tool_id)
        .and_then(|(_, toml_str)| toml::from_str(toml_str).ok())
}

pub fn detect_all() -> Vec<Agent> {
    const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

    all_manifest_strs()
        .iter()
        .filter_map(|(id, toml_str)| {
            let manifest = match toml::from_str::<Manifest>(toml_str) {
                Ok(m) => m,
                Err(e) => {
                    eprintln!("[engine] failed to parse manifest for {id}: {e}");
                    return None;
                }
            };
            let manifest_id = id.to_string();
            crate::detectors::run_with_timeout(
                move || Some(detect_from_manifest(&manifest)),
                TIMEOUT,
            )
            .or_else(|| {
                Some(Agent {
                    id: manifest_id.clone(),
                    name: manifest_id,
                    version: None,
                    installed: false,
                    install_path: None,
                    skills: vec![],
                    mcps: vec![],
                    error: Some("detector timed out".to_string()),
                    supports_skills: false,
                    supports_mcps: false,
                    config_files: vec![],
                    config_errors: vec![],
                })
            })
        })
        .collect()
}

// ── Core detection ─────────────────────────────────────────────────────────

struct DetectionResult {
    install_path: Option<String>,
    detected_version: Option<String>,
    detected_binary: Option<String>,
}

fn detect_from_manifest(m: &Manifest) -> Agent {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return not_installed(m),
    };

    let dr = run_detection(&m.detection, &home);
    if dr.install_path.is_none() {
        return not_installed(m);
    }

    let version = m
        .version
        .as_ref()
        .and_then(|v| run_version(v, &home, &dr))
        .or(dr.detected_version.clone());

    let (mcps, error) = mcp::collect(&m.mcp_sources, version.as_deref(), &home);
    let skills = skill::collect(&m.skill_sources, version.as_deref(), &home);
    let config_errors: Vec<String> = error.iter().cloned().collect();

    Agent {
        id: m.id.clone(),
        name: m.name.clone(),
        version,
        installed: true,
        install_path: dr.install_path,
        skills,
        mcps,
        error,
        supports_skills: !m.skill_sources.is_empty(),
        supports_mcps: !m.mcp_sources.is_empty(),
        config_files: extract_config_files(m, &home),
        config_errors,
    }
}

fn not_installed(m: &Manifest) -> Agent {
    let home = dirs::home_dir().unwrap_or_default();
    Agent {
        id: m.id.clone(),
        name: m.name.clone(),
        version: None,
        installed: false,
        install_path: None,
        skills: vec![],
        mcps: vec![],
        error: None,
        supports_skills: !m.skill_sources.is_empty(),
        supports_mcps: !m.mcp_sources.is_empty(),
        config_files: extract_config_files(m, &home),
        config_errors: vec![],
    }
}

/// Collect all unique config file paths this manifest reads/writes.
fn extract_config_files(m: &Manifest, home: &std::path::Path) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut files = vec![];

    let mut push = |raw: &str| {
        let expanded = expand_home(raw, home);
        let s = expanded.to_string_lossy().into_owned();
        if seen.insert(s.clone()) {
            files.push(s);
        }
    };

    for src in &m.mcp_sources {
        match &src.spec {
            McpSourceSpec::JsonKeyPair { file, .. }
            | McpSourceSpec::JsonNested { file, .. }
            | McpSourceSpec::ZedContextServers { file, .. }
            | McpSourceSpec::YamlKeyPair { file, .. }
            | McpSourceSpec::TomlKeyPair { file, .. }
            | McpSourceSpec::ClaudeDotfile { file } => push(file),
            McpSourceSpec::ExtensionDir { .. }
            | McpSourceSpec::ClaudePlugins { .. }
            | McpSourceSpec::ClaudeMcpList { .. }
            | McpSourceSpec::MarketplacePlugins { .. } => {}
        }
    }

    for src in &m.skill_sources {
        if let SkillSourceSpec::TomlConfigDirectory { config_file, .. } = &src.spec {
            push(config_file);
        }
    }

    if let Some(perms) = &m.permissions {
        push(&perms.file);
    }

    files
}

// ── Detection ────────────────────────────────────────────────────────────────

fn run_detection(specs: &[DetectionSpec], home: &std::path::Path) -> DetectionResult {
    for spec in specs {
        if let Some(dr) = try_spec(spec, home) {
            return dr;
        }
    }
    DetectionResult {
        install_path: None,
        detected_version: None,
        detected_binary: None,
    }
}

fn try_spec(spec: &DetectionSpec, home: &std::path::Path) -> Option<DetectionResult> {
    match spec {
        DetectionSpec::Dir { path } => {
            let p = expand_home(path, home);
            if p.is_dir() {
                Some(DetectionResult {
                    install_path: Some(p.to_string_lossy().into_owned()),
                    detected_version: None,
                    detected_binary: None,
                })
            } else {
                None
            }
        }
        DetectionSpec::File { path } => {
            let p = expand_home(path, home);
            if p.exists() {
                Some(DetectionResult {
                    install_path: Some(p.to_string_lossy().into_owned()),
                    detected_version: None,
                    detected_binary: None,
                })
            } else {
                None
            }
        }
        DetectionSpec::Binary { name } => {
            crate::detectors::find_in_path(name).map(|bin_path| DetectionResult {
                install_path: Some(bin_path.clone()),
                detected_version: None,
                detected_binary: Some(bin_path),
            })
        }
        DetectionSpec::VscodeExtension {
            extensions_dir,
            prefix,
        } => {
            let dir = expand_home(extensions_dir, home);
            find_latest_vscode_extension(&dir, prefix).map(|(path, ver)| DetectionResult {
                install_path: Some(path),
                detected_version: Some(ver),
                detected_binary: None,
            })
        }
    }
}

fn find_latest_vscode_extension(
    extensions_dir: &std::path::Path,
    prefix: &str,
) -> Option<(String, String)> {
    let entries = std::fs::read_dir(extensions_dir).ok()?;
    let mut candidates: Vec<(String, String)> = entries
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let ver = name.strip_prefix(prefix)?.to_string();
            if e.path().is_dir() {
                Some((name, ver))
            } else {
                None
            }
        })
        .collect();

    if candidates.is_empty() {
        return None;
    }

    candidates.sort_by(|a, b| semver_cmp(&b.1, &a.1));
    let (dir_name, ver) = &candidates[0];
    let path = extensions_dir.join(dir_name).to_string_lossy().into_owned();
    Some((path, ver.clone()))
}

fn semver_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    resolve::semver_cmp(a, b)
}

// ── Version ───────────────────────────────────────────────────────────────────

fn run_version(spec: &VersionSpec, home: &std::path::Path, dr: &DetectionResult) -> Option<String> {
    match spec {
        VersionSpec::Command {
            binary,
            args,
            timeout_ms,
            parse,
        } => {
            let bin = binary
                .clone()
                .or_else(|| dr.detected_binary.clone())
                .or_else(|| dr.install_path.clone())?;
            let args = args.clone();
            let parse = parse.clone();
            let timeout = std::time::Duration::from_millis(*timeout_ms);
            crate::detectors::run_with_timeout(
                move || run_command_version(&bin, &args, &parse),
                timeout,
            )
        }
        VersionSpec::JsonKey { file, key_path } => {
            let path = expand_home(file, home);
            read_json_version(&path, key_path)
        }
    }
}

fn run_command_version(binary: &str, args: &[String], parse: &str) -> Option<String> {
    let output = std::process::Command::new(binary)
        .args(args)
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    run_command_version_from_str(&stdout, parse)
}

fn run_command_version_from_str(stdout: &str, parse: &str) -> Option<String> {
    match parse {
        "first_token" => stdout.split_whitespace().next().map(|s| s.to_string()),
        "last_token" => stdout.split_whitespace().last().map(|s| s.to_string()),
        _ => stdout
            .lines()
            .next()
            .map(|l| l.trim().to_string())
            .filter(|s| !s.is_empty()),
    }
}

fn read_json_version(path: &std::path::Path, key_path: &[String]) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
    let mut json: serde_json::Value = serde_json::from_str(&content).ok()?;
    for key in key_path {
        json = json.get(key)?.clone();
    }
    json.as_str().map(|s| s.to_string())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_manifests_parse_without_error() {
        for (id, toml_str) in all_manifest_strs() {
            let result = toml::from_str::<Manifest>(toml_str);
            assert!(
                result.is_ok(),
                "manifest '{id}' failed to parse: {:?}",
                result.err()
            );
        }
    }

    #[test]
    fn all_manifests_have_correct_id() {
        for (id, toml_str) in all_manifest_strs() {
            let m: Manifest = toml::from_str(toml_str).unwrap();
            assert_eq!(&m.id, id, "manifest id mismatch for '{id}'");
            assert!(!m.name.is_empty(), "manifest '{id}' has empty name");
        }
    }

    #[test]
    fn all_manifests_have_schema_version() {
        for (id, toml_str) in all_manifest_strs() {
            let m: Manifest = toml::from_str(toml_str).unwrap();
            assert!(
                m.schema_version >= 1,
                "manifest '{id}' missing schema_version"
            );
        }
    }

    #[test]
    fn semver_cmp_orders_correctly() {
        assert_eq!(semver_cmp("0.24.0", "0.23.1"), std::cmp::Ordering::Greater);
        assert_eq!(semver_cmp("1.0.0", "0.99.99"), std::cmp::Ordering::Greater);
        assert_eq!(semver_cmp("1.0.0", "1.0.0"), std::cmp::Ordering::Equal);
    }

    #[test]
    fn find_latest_vscode_extension_picks_highest_version() {
        let tmp = tempfile::TempDir::new().unwrap();
        for ver in &["0.10.0", "0.9.5", "1.2.3", "1.0.0"] {
            std::fs::create_dir(tmp.path().join(format!("github.copilot-chat-{ver}"))).unwrap();
        }
        // Non-matching prefix should be ignored
        std::fs::create_dir(tmp.path().join("other.ext-99.0.0")).unwrap();

        let result = find_latest_vscode_extension(tmp.path(), "github.copilot-chat-");
        assert!(result.is_some());
        let (_path, ver) = result.unwrap();
        assert_eq!(ver, "1.2.3");
    }

    #[test]
    fn find_latest_vscode_extension_returns_none_when_empty() {
        let tmp = tempfile::TempDir::new().unwrap();
        assert!(find_latest_vscode_extension(tmp.path(), "github.copilot-chat-").is_none());
    }

    #[test]
    fn detect_from_manifest_not_installed_when_no_dir() {
        let toml = r#"
schema_version = 1
id = "test-tool"
name = "Test Tool"
[[detection]]
type = "dir"
path = "/tmp/this_dir_does_not_exist_xyzzy_12345"
"#;
        let m: Manifest = toml::from_str(toml).unwrap();
        let agent = detect_from_manifest(&m);
        assert!(!agent.installed);
        assert_eq!(agent.id, "test-tool");
    }

    #[test]
    fn run_command_version_last_token_extracts_version() {
        // Simulate output like "kiro-cli 2.6.1"
        assert_eq!(
            run_command_version_from_str("kiro-cli 2.6.1\n", "last_token"),
            Some("2.6.1".to_string())
        );
    }

    #[test]
    fn run_command_version_first_token_extracts_name() {
        assert_eq!(
            run_command_version_from_str("kiro-cli 2.6.1\n", "first_token"),
            Some("kiro-cli".to_string())
        );
    }

    #[test]
    fn run_command_version_first_line_returns_whole_line() {
        assert_eq!(
            run_command_version_from_str("kiro-cli 2.6.1\nextra\n", "first_line"),
            Some("kiro-cli 2.6.1".to_string())
        );
    }
}
