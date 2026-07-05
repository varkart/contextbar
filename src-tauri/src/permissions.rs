use crate::engine::manifest::PermissionsSpec;
use crate::engine::resolve::expand_home;

#[derive(Default, Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPermissions {
    pub allow: Vec<String>,
    pub deny: Vec<String>,
}

/// Read the allow/deny lists from the tool's permissions file.
pub fn read(spec: &PermissionsSpec, home: &std::path::Path) -> Result<AgentPermissions, String> {
    let path = expand_home(&spec.file, home);
    if !path.exists() {
        return Ok(AgentPermissions::default());
    }

    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("cannot read {}: {e}", path.display()))?;
    let json: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("cannot parse {}: {e}", path.display()))?;

    let perms = json.get(&spec.key).cloned().unwrap_or_default();

    Ok(AgentPermissions {
        allow: extract_string_list(&perms, &spec.allow_key),
        deny: extract_string_list(&perms, &spec.deny_key),
    })
}

fn extract_string_list(perms: &serde_json::Value, key: &str) -> Vec<String> {
    perms
        .get(key)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

/// Add a rule to the allow or deny list. No-op if already present. Takes a
/// backup before writing. Uses per-file mutex via app_state internals.
pub fn add_rule(
    spec: &PermissionsSpec,
    home: &std::path::Path,
    rule: &str,
    section: PermissionSection,
) -> Result<(), String> {
    let path = expand_home(&spec.file, home);
    let path_str = path.to_string_lossy();

    crate::app_state::update_permissions_file(
        &path_str,
        |perms| {
            let list = match section {
                PermissionSection::Allow => &mut perms.allow,
                PermissionSection::Deny => &mut perms.deny,
            };
            if !list.contains(&rule.to_string()) {
                list.push(rule.to_string());
            }
        },
        &spec.key,
        &spec.allow_key,
        &spec.deny_key,
    )
}

/// Remove a rule from the allow or deny list. No-op if not present.
pub fn remove_rule(
    spec: &PermissionsSpec,
    home: &std::path::Path,
    rule: &str,
    section: PermissionSection,
) -> Result<(), String> {
    let path = expand_home(&spec.file, home);
    let path_str = path.to_string_lossy();

    crate::app_state::update_permissions_file(
        &path_str,
        |perms| {
            let list = match section {
                PermissionSection::Allow => &mut perms.allow,
                PermissionSection::Deny => &mut perms.deny,
            };
            list.retain(|r| r != rule);
        },
        &spec.key,
        &spec.allow_key,
        &spec.deny_key,
    )
}

#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionSection {
    Allow,
    Deny,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn make_spec(file: &str) -> PermissionsSpec {
        PermissionsSpec {
            file: file.to_string(),
            key: "permissions".to_string(),
            allow_key: "allow".to_string(),
            deny_key: "deny".to_string(),
        }
    }

    fn make_gemini_spec(file: &str) -> PermissionsSpec {
        PermissionsSpec {
            file: file.to_string(),
            key: "tools".to_string(),
            allow_key: "allowed".to_string(),
            deny_key: "exclude".to_string(),
        }
    }

    fn write_settings(
        dir: &std::path::Path,
        name: &str,
        val: serde_json::Value,
    ) -> std::path::PathBuf {
        let p = dir.join(name);
        fs::write(&p, serde_json::to_string_pretty(&val).unwrap()).unwrap();
        p
    }

    #[test]
    fn read_allow_and_deny_lists() {
        let tmp = TempDir::new().unwrap();
        write_settings(
            tmp.path(),
            "settings.json",
            serde_json::json!({
                "permissions": {
                    "allow": ["Bash(git:*)", "WebSearch"],
                    "deny": ["Bash(rm -rf:*)"]
                }
            }),
        );

        let spec = make_spec(&tmp.path().join("settings.json").to_string_lossy());
        let perms = read(&spec, tmp.path()).unwrap();

        assert_eq!(perms.allow, vec!["Bash(git:*)", "WebSearch"]);
        assert_eq!(perms.deny, vec!["Bash(rm -rf:*)"]);
    }

    #[test]
    fn read_missing_file_returns_empty() {
        let tmp = TempDir::new().unwrap();
        let spec = make_spec(&tmp.path().join("missing.json").to_string_lossy());
        let perms = read(&spec, tmp.path()).unwrap();
        assert!(perms.allow.is_empty());
        assert!(perms.deny.is_empty());
    }

    #[test]
    fn read_no_permissions_key_returns_empty() {
        let tmp = TempDir::new().unwrap();
        write_settings(
            tmp.path(),
            "settings.json",
            serde_json::json!({
                "mcpServers": {}
            }),
        );
        let spec = make_spec(&tmp.path().join("settings.json").to_string_lossy());
        let perms = read(&spec, tmp.path()).unwrap();
        assert!(perms.allow.is_empty());
    }

    #[test]
    fn add_rule_to_allow_list() {
        let tmp = TempDir::new().unwrap();
        write_settings(
            tmp.path(),
            "settings.json",
            serde_json::json!({
                "permissions": { "allow": ["Bash(git:*)"] }
            }),
        );

        let spec = make_spec(&tmp.path().join("settings.json").to_string_lossy());
        add_rule(&spec, tmp.path(), "WebSearch", PermissionSection::Allow).unwrap();

        let perms = read(&spec, tmp.path()).unwrap();
        assert!(perms.allow.contains(&"WebSearch".to_string()));
        assert!(perms.allow.contains(&"Bash(git:*)".to_string()));
    }

    #[test]
    fn add_rule_is_idempotent() {
        let tmp = TempDir::new().unwrap();
        write_settings(
            tmp.path(),
            "settings.json",
            serde_json::json!({
                "permissions": { "allow": ["Bash(git:*)"] }
            }),
        );

        let spec = make_spec(&tmp.path().join("settings.json").to_string_lossy());
        add_rule(&spec, tmp.path(), "Bash(git:*)", PermissionSection::Allow).unwrap();

        let perms = read(&spec, tmp.path()).unwrap();
        let count = perms
            .allow
            .iter()
            .filter(|r| r.as_str() == "Bash(git:*)")
            .count();
        assert_eq!(count, 1, "duplicate should not be added");
    }

    #[test]
    fn remove_rule_from_deny_list() {
        let tmp = TempDir::new().unwrap();
        write_settings(
            tmp.path(),
            "settings.json",
            serde_json::json!({
                "permissions": {
                    "allow": [],
                    "deny": ["Bash(rm -rf:*)", "Bash(sudo:*)"]
                }
            }),
        );

        let spec = make_spec(&tmp.path().join("settings.json").to_string_lossy());
        remove_rule(&spec, tmp.path(), "Bash(rm -rf:*)", PermissionSection::Deny).unwrap();

        let perms = read(&spec, tmp.path()).unwrap();
        assert!(!perms.deny.contains(&"Bash(rm -rf:*)".to_string()));
        assert!(perms.deny.contains(&"Bash(sudo:*)".to_string()));
    }

    #[test]
    fn gemini_custom_key_names_read() {
        let tmp = TempDir::new().unwrap();
        write_settings(
            tmp.path(),
            "settings.json",
            serde_json::json!({
                "tools": {
                    "allowed": ["run_shell_command"],
                    "exclude": ["some_tool"]
                }
            }),
        );
        let spec = make_gemini_spec(&tmp.path().join("settings.json").to_string_lossy());
        let perms = read(&spec, tmp.path()).unwrap();
        assert_eq!(perms.allow, vec!["run_shell_command"]);
        assert_eq!(perms.deny, vec!["some_tool"]);
    }

    #[test]
    fn gemini_custom_key_names_write() {
        let tmp = TempDir::new().unwrap();
        write_settings(
            tmp.path(),
            "settings.json",
            serde_json::json!({ "tools": { "allowed": [] } }),
        );
        let spec = make_gemini_spec(&tmp.path().join("settings.json").to_string_lossy());
        add_rule(
            &spec,
            tmp.path(),
            "run_shell_command",
            PermissionSection::Allow,
        )
        .unwrap();
        let perms = read(&spec, tmp.path()).unwrap();
        assert_eq!(perms.allow, vec!["run_shell_command"]);
        // Confirm the file uses "allowed" not "allow"
        let raw: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(tmp.path().join("settings.json")).unwrap())
                .unwrap();
        assert!(
            raw["tools"]["allowed"].is_array(),
            "key should be 'allowed'"
        );
        assert!(
            raw["tools"].get("allow").is_none(),
            "'allow' key must not appear"
        );
    }

    #[test]
    fn add_rule_creates_permissions_key_if_missing() {
        let tmp = TempDir::new().unwrap();
        write_settings(
            tmp.path(),
            "settings.json",
            serde_json::json!({
                "mcpServers": {}
            }),
        );

        let spec = make_spec(&tmp.path().join("settings.json").to_string_lossy());
        add_rule(&spec, tmp.path(), "WebSearch", PermissionSection::Allow).unwrap();

        let perms = read(&spec, tmp.path()).unwrap();
        assert_eq!(perms.allow, vec!["WebSearch"]);
        // Original keys preserved
        let raw: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(tmp.path().join("settings.json")).unwrap())
                .unwrap();
        assert!(raw.get("mcpServers").is_some());
    }
}
