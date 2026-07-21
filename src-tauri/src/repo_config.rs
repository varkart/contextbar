//! Repo-scoped agent configuration.
//!
//! Claude Code: `<repo>/.claude/settings.json` (project scope, shared) and
//! `<repo>/.claude/settings.local.json` (personal, gitignored) carry the same
//! permissions shape as the user file and take precedence over it.
//! Codex: per-repo state lives in the GLOBAL `~/.codex/config.toml` under
//! `[projects."<abs-path>"] trust_level = "trusted"` (verified locally).

use std::path::Path;

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepoAgentConfig {
    pub claude: RepoClaudeConfig,
    pub codex: RepoCodexConfig,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepoClaudeConfig {
    pub project: ScopedPermissions,
    pub local: ScopedPermissions,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScopedPermissions {
    /// Repo-relative file (".claude/settings.json" / ".claude/settings.local.json").
    pub file: String,
    pub exists: bool,
    pub allow: Vec<String>,
    pub deny: Vec<String>,
    pub ask: Vec<String>,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepoCodexConfig {
    /// trust_level from ~/.codex/config.toml [projects."<repo>"]; None = no entry.
    pub trust_level: Option<String>,
}

#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RepoScope {
    Project,
    Local,
}

pub const PROJECT_FILE: &str = ".claude/settings.json";
pub const LOCAL_FILE: &str = ".claude/settings.local.json";

/// Only operate on real repo roots — refuse arbitrary paths. `.git` is a dir
/// for primary checkouts and a file for linked worktrees.
pub fn validate_repo_path(repo_path: &str) -> Result<(), String> {
    let p = Path::new(repo_path);
    if p.is_absolute() && p.join(".git").exists() {
        Ok(())
    } else {
        Err(format!("'{repo_path}' is not a git repository root"))
    }
}

fn string_list(perms: &serde_json::Value, key: &str) -> Vec<String> {
    perms
        .get(key)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

fn scoped(repo: &Path, rel: &str) -> ScopedPermissions {
    let path = repo.join(rel);
    let exists = path.exists();
    let perms = crate::app_state::read_json_config(&path.to_string_lossy())
        .and_then(|json| json.get("permissions").cloned())
        .unwrap_or_default();
    ScopedPermissions {
        file: rel.to_string(),
        exists,
        allow: string_list(&perms, "allow"),
        deny: string_list(&perms, "deny"),
        ask: string_list(&perms, "ask"),
    }
}

pub fn read(repo_path: &str, home: &Path) -> Result<RepoAgentConfig, String> {
    validate_repo_path(repo_path)?;
    let repo = Path::new(repo_path);

    let trust_level =
        crate::app_state::read_toml_config(&home.join(".codex/config.toml").to_string_lossy())
            .and_then(|doc| {
                doc.get("projects")
                    .and_then(|t| t.get(repo_path))
                    .and_then(|p| p.get("trust_level"))
                    .and_then(|v| v.as_str().map(String::from))
            });

    Ok(RepoAgentConfig {
        claude: RepoClaudeConfig {
            project: scoped(repo, PROJECT_FILE),
            local: scoped(repo, LOCAL_FILE),
        },
        codex: RepoCodexConfig { trust_level },
    })
}

/// Add or remove a permission rule in a repo-scoped Claude settings file.
pub fn set_rule(
    repo_path: &str,
    scope: RepoScope,
    rule: &str,
    section: crate::permissions::PermissionSection,
    add: bool,
) -> Result<(), String> {
    validate_repo_path(repo_path)?;
    let rel = match scope {
        RepoScope::Project => PROJECT_FILE,
        RepoScope::Local => LOCAL_FILE,
    };
    let path = Path::new(repo_path).join(rel);
    crate::app_state::update_permissions_file(
        &path.to_string_lossy(),
        |perms| {
            let list = match section {
                crate::permissions::PermissionSection::Allow => &mut perms.allow,
                crate::permissions::PermissionSection::Deny => &mut perms.deny,
                crate::permissions::PermissionSection::Ask => &mut perms.ask,
            };
            if add {
                if !list.contains(&rule.to_string()) {
                    list.push(rule.to_string());
                }
            } else {
                list.retain(|r| r != rule);
            }
        },
        "permissions",
        "allow",
        "deny",
        Some("ask"),
    )
}

/// Set or clear the Codex trust entry for a repo in ~/.codex/config.toml.
pub fn set_codex_trust(repo_path: &str, home: &Path, trusted: bool) -> Result<(), String> {
    validate_repo_path(repo_path)?;
    let cfg = home.join(".codex/config.toml");
    let repo = repo_path.to_string();
    crate::app_state::update_toml_config(&cfg.to_string_lossy(), move |doc| {
        let table = doc.as_table_mut().ok_or("config is not a TOML table")?;
        let projects = table
            .entry("projects".to_string())
            .or_insert_with(|| toml::Value::Table(toml::map::Map::new()))
            .as_table_mut()
            .ok_or("'projects' is not a table")?;
        if trusted {
            let mut entry = toml::map::Map::new();
            entry.insert(
                "trust_level".to_string(),
                toml::Value::String("trusted".to_string()),
            );
            projects.insert(repo, toml::Value::Table(entry));
        } else {
            projects.remove(&repo);
        }
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake_repo(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("cb-repo-{}-{tag}", std::process::id()));
        std::fs::create_dir_all(dir.join(".git")).unwrap();
        dir
    }

    #[test]
    fn rejects_non_repo_paths() {
        assert!(validate_repo_path("/definitely/not/a/repo").is_err());
        assert!(validate_repo_path("relative/path").is_err());
    }

    #[test]
    fn rule_roundtrip_in_project_scope() {
        let repo = fake_repo("rules");
        let rp = repo.to_string_lossy();
        set_rule(
            &rp,
            RepoScope::Project,
            "WebSearch",
            crate::permissions::PermissionSection::Deny,
            true,
        )
        .unwrap();
        let home = std::path::Path::new("/nonexistent-home");
        let cfg = read(&rp, home).unwrap();
        assert!(cfg.claude.project.exists);
        assert_eq!(cfg.claude.project.deny, vec!["WebSearch"]);
        assert!(!cfg.claude.local.exists);

        set_rule(
            &rp,
            RepoScope::Project,
            "WebSearch",
            crate::permissions::PermissionSection::Deny,
            false,
        )
        .unwrap();
        let cfg = read(&rp, home).unwrap();
        assert!(cfg.claude.project.deny.is_empty());
        let _ = std::fs::remove_dir_all(&repo);
    }

    #[test]
    fn codex_trust_roundtrip() {
        let repo = fake_repo("trust");
        let rp = repo.to_string_lossy().into_owned();
        let home = std::env::temp_dir().join(format!("cb-home-{}", std::process::id()));
        std::fs::create_dir_all(home.join(".codex")).unwrap();
        std::fs::write(home.join(".codex/config.toml"), "model = \"gpt\"\n").unwrap();

        set_codex_trust(&rp, &home, true).unwrap();
        let cfg = read(&rp, &home).unwrap();
        assert_eq!(cfg.codex.trust_level.as_deref(), Some("trusted"));

        set_codex_trust(&rp, &home, false).unwrap();
        let cfg = read(&rp, &home).unwrap();
        assert!(cfg.codex.trust_level.is_none());
        // unrelated key survives
        let doc =
            crate::app_state::read_toml_config(&home.join(".codex/config.toml").to_string_lossy())
                .unwrap();
        assert_eq!(doc.get("model").and_then(|v| v.as_str()), Some("gpt"));
        let _ = std::fs::remove_dir_all(&repo);
        let _ = std::fs::remove_dir_all(&home);
    }
}
