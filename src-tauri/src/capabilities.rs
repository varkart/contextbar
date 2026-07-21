//! Feature/context capability toggles, driven by `[[capabilities]]` manifest
//! entries. A capability maps a user-facing switch ("Auto memory", "WebFetch
//! tool") onto a config-file write; see `CapabilityWriter` for the mechanisms.
//!
//! Semantics: toggles only ever write the declared off-state or remove it —
//! they never overwrite unrelated values, so hand-edited configs survive.

use crate::engine::manifest::{CapabilitySpec, CapabilityWriter, ValuesFrom};
use crate::engine::resolve::expand_home;

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityState {
    pub id: String,
    pub label: String,
    pub description: Option<String>,
    pub help: Option<String>,
    pub example: Option<String>,
    pub category: String,
    pub tokens_hint: Option<u32>,
    /// "toggle" | "enum".
    pub kind: String,
    /// Options for enum kinds.
    pub values: Vec<String>,
    pub default_value: Option<String>,
    /// Enum kinds: whether a "(not set)" choice (empty string) is offered.
    pub allow_unset: bool,
    /// Current value for enum kinds (None for toggles).
    pub value: Option<String>,
    pub enabled: bool,
    // Flattened writer summary so the UI can render an accurate,
    // auto-generated before/after config snippet. Manifest data only.
    pub writer_file: String,
    pub writer_kind: String,
    pub writer_key: Option<String>,
    pub writer_off_value: Option<serde_json::Value>,
    pub writer_path: Option<String>,
    pub writer_members: Vec<String>,
}

fn lookup<'a>(root: &'a serde_json::Value, dotted: &str) -> Option<&'a serde_json::Value> {
    let mut cur = root;
    for seg in dotted.split('.') {
        cur = cur.get(seg)?;
    }
    Some(cur)
}

fn toml_lookup<'a>(root: &'a toml::Value, dotted: &str) -> Option<&'a toml::Value> {
    let mut cur = root;
    for seg in dotted.split('.') {
        cur = cur.get(seg)?;
    }
    Some(cur)
}

/// Loose equality between a TOML value and the JSON off_value from the spec.
fn toml_matches_json(t: &toml::Value, j: &serde_json::Value) -> bool {
    match (t, j) {
        (toml::Value::Boolean(a), serde_json::Value::Bool(b)) => a == b,
        (toml::Value::String(a), serde_json::Value::String(b)) => a == b,
        (toml::Value::Integer(a), serde_json::Value::Number(b)) => b.as_i64() == Some(*a),
        (toml::Value::Float(a), serde_json::Value::Number(b)) => b.as_f64() == Some(*a),
        _ => false,
    }
}

fn json_to_toml(j: &serde_json::Value) -> Option<toml::Value> {
    match j {
        serde_json::Value::Bool(b) => Some(toml::Value::Boolean(*b)),
        serde_json::Value::String(s) => Some(toml::Value::String(s.clone())),
        serde_json::Value::Number(n) => n
            .as_i64()
            .map(toml::Value::Integer)
            .or_else(|| n.as_f64().map(toml::Value::Float)),
        _ => None,
    }
}

/// Current on/off state per the config file. Absent key = `spec.default_on`.
fn read_enabled(spec: &CapabilitySpec, home: &std::path::Path) -> bool {
    let absent = spec.default_on;
    match &spec.writer {
        CapabilityWriter::JsonFlag {
            file,
            key,
            off_value,
        } => {
            let path = expand_home(file, home);
            let Some(json) = crate::app_state::read_json_config(&path.to_string_lossy()) else {
                return absent;
            };
            lookup(&json, key).map(|v| v != off_value).unwrap_or(absent)
        }
        CapabilityWriter::JsonListMember { file, path, .. } => {
            let fpath = expand_home(file, home);
            let Some(json) = crate::app_state::read_json_config(&fpath.to_string_lossy()) else {
                return absent;
            };
            let wanted = spec.writer.list_members();
            let present = lookup(&json, path)
                .and_then(|v| v.as_array())
                .map(|arr| {
                    wanted
                        .iter()
                        .any(|m| arr.iter().any(|v| v.as_str() == Some(*m)))
                })
                .unwrap_or(false);
            !present
        }
        CapabilityWriter::TomlKey {
            file,
            key,
            off_value,
        } => {
            let fpath = expand_home(file, home);
            let Some(doc) = crate::app_state::read_toml_config(&fpath.to_string_lossy()) else {
                return absent;
            };
            match (toml_lookup(&doc, key), off_value) {
                (Some(v), Some(off)) => !toml_matches_json(v, off),
                (Some(_), None) => true,
                (None, _) => absent,
            }
        }
    }
}

/// Static values plus any dynamically discovered ones (deduped, order kept).
fn resolve_values(spec: &CapabilitySpec, home: &std::path::Path) -> Vec<String> {
    let mut out = spec.values.clone();
    if let Some(ValuesFrom::TomlTableNames { file, path }) = &spec.values_from {
        let fpath = expand_home(file, home);
        if let Some(doc) = crate::app_state::read_toml_config(&fpath.to_string_lossy()) {
            if let Some(table) = toml_lookup(&doc, path).and_then(|v| v.as_table()) {
                for name in table.keys() {
                    if !out.iter().any(|v| v == name) {
                        out.push(name.clone());
                    }
                }
            }
        }
    }
    out
}

/// Current string value for enum-kind capabilities; falls back to
/// `spec.default_value` when the key is absent.
fn read_value(spec: &CapabilitySpec, home: &std::path::Path) -> Option<String> {
    let current = match &spec.writer {
        CapabilityWriter::JsonFlag { file, key, .. } => {
            let path = expand_home(file, home);
            crate::app_state::read_json_config(&path.to_string_lossy())
                .and_then(|json| lookup(&json, key).and_then(|v| v.as_str().map(String::from)))
        }
        CapabilityWriter::TomlKey { file, key, .. } => {
            let path = expand_home(file, home);
            crate::app_state::read_toml_config(&path.to_string_lossy())
                .and_then(|doc| toml_lookup(&doc, key).and_then(|v| v.as_str().map(String::from)))
        }
        CapabilityWriter::JsonListMember { .. } => None,
    };
    current.or_else(|| spec.default_value.clone())
}

pub fn list(specs: &[CapabilitySpec], home: &std::path::Path) -> Vec<CapabilityState> {
    specs
        .iter()
        .map(|s| {
            let (writer_file, writer_kind, writer_key, writer_off_value, writer_path) =
                match &s.writer {
                    CapabilityWriter::JsonFlag {
                        file,
                        key,
                        off_value,
                    } => (
                        file.clone(),
                        "json_flag".to_string(),
                        Some(key.clone()),
                        Some(off_value.clone()),
                        None,
                    ),
                    CapabilityWriter::JsonListMember { file, path, .. } => (
                        file.clone(),
                        "json_list_member".to_string(),
                        None,
                        None,
                        Some(path.clone()),
                    ),
                    CapabilityWriter::TomlKey {
                        file,
                        key,
                        off_value,
                    } => (
                        file.clone(),
                        "toml_key".to_string(),
                        Some(key.clone()),
                        off_value.clone(),
                        None,
                    ),
                };
            let is_enum = s.kind == "enum";
            CapabilityState {
                id: s.id.clone(),
                label: s.label.clone(),
                description: s.description.clone(),
                help: s.help.clone(),
                example: s.example.clone(),
                category: s.category.clone(),
                tokens_hint: s.tokens_hint,
                kind: s.kind.clone(),
                values: if is_enum {
                    resolve_values(s, home)
                } else {
                    s.values.clone()
                },
                default_value: s.default_value.clone(),
                allow_unset: s.allow_unset,
                value: if is_enum { read_value(s, home) } else { None },
                enabled: if is_enum { true } else { read_enabled(s, home) },
                writer_file,
                writer_kind,
                writer_key,
                writer_off_value,
                writer_path,
                writer_members: s
                    .writer
                    .list_members()
                    .into_iter()
                    .map(String::from)
                    .collect(),
            }
        })
        .collect()
}

/// Insert (Some) or remove (None) a value at a dotted JSON key, creating
/// intermediate objects as needed.
fn json_modify_key(
    json: &mut serde_json::Value,
    dotted: &str,
    value: Option<serde_json::Value>,
) -> Result<(), String> {
    let segs: Vec<&str> = dotted.split('.').collect();
    let (last, parents) = segs.split_last().ok_or("empty writer key")?;
    let mut cur = json;
    for seg in parents {
        let obj = cur.as_object_mut().ok_or("config is not a JSON object")?;
        cur = obj
            .entry(seg.to_string())
            .or_insert_with(|| serde_json::Value::Object(Default::default()));
    }
    let obj = cur
        .as_object_mut()
        .ok_or_else(|| format!("'{}' is not an object", parents.join(".")))?;
    match value {
        Some(v) => {
            obj.insert(last.to_string(), v);
        }
        None => {
            obj.remove(*last);
        }
    }
    Ok(())
}

/// TOML sibling of `json_modify_key`.
fn toml_modify_key(
    doc: &mut toml::Value,
    dotted: &str,
    value: Option<toml::Value>,
) -> Result<(), String> {
    let segs: Vec<&str> = dotted.split('.').collect();
    let (last, parents) = segs.split_last().ok_or("empty writer key")?;
    let mut cur = doc;
    for seg in parents {
        let table = cur.as_table_mut().ok_or("config is not a TOML table")?;
        cur = table
            .entry(seg.to_string())
            .or_insert_with(|| toml::Value::Table(toml::map::Map::new()));
    }
    let table = cur
        .as_table_mut()
        .ok_or_else(|| format!("'{}' is not a table", parents.join(".")))?;
    match value {
        Some(v) => {
            table.insert(last.to_string(), v);
        }
        None => {
            table.remove(*last);
        }
    }
    Ok(())
}

pub fn set(spec: &CapabilitySpec, home: &std::path::Path, enabled: bool) -> Result<(), String> {
    if spec.kind == "enum" {
        return Err(format!(
            "capability '{}' is an enum — use set_capability_value",
            spec.id
        ));
    }
    match &spec.writer {
        CapabilityWriter::JsonFlag {
            file,
            key,
            off_value,
        } => {
            let path = expand_home(file, home);
            let key = key.clone();
            let off_value = off_value.clone();
            crate::app_state::update_json_config(&path.to_string_lossy(), move |json| {
                // ON restores the agent's default by removing our override.
                json_modify_key(json, &key, (!enabled).then_some(off_value))
            })
        }
        CapabilityWriter::TomlKey {
            file,
            key,
            off_value,
        } => {
            let path = expand_home(file, home);
            let key = key.clone();
            let off = off_value.as_ref().and_then(json_to_toml).ok_or_else(|| {
                format!("'{}': toml_key toggle needs a scalar off_value", spec.id)
            })?;
            crate::app_state::update_toml_config(&path.to_string_lossy(), move |doc| {
                toml_modify_key(doc, &key, (!enabled).then_some(off))
            })
        }
        CapabilityWriter::JsonListMember { file, path, .. } => {
            let fpath = expand_home(file, home);
            let dotted = path.clone();
            let wanted: Vec<String> = spec
                .writer
                .list_members()
                .into_iter()
                .map(String::from)
                .collect();
            crate::app_state::update_json_config(&fpath.to_string_lossy(), move |json| {
                // Walk/create the object chain down to the array's parent.
                let segs: Vec<&str> = dotted.split('.').collect();
                let (last, parents) = segs.split_last().ok_or("empty writer path")?;
                let mut cur = json;
                for seg in parents {
                    let obj = cur.as_object_mut().ok_or("config is not a JSON object")?;
                    cur = obj
                        .entry(seg.to_string())
                        .or_insert_with(|| serde_json::Value::Object(Default::default()));
                }
                let obj = cur
                    .as_object_mut()
                    .ok_or_else(|| format!("'{}' is not an object", parents.join(".")))?;
                let arr = obj
                    .entry(last.to_string())
                    .or_insert_with(|| serde_json::Value::Array(vec![]))
                    .as_array_mut()
                    .ok_or_else(|| format!("'{dotted}' is not an array"))?;
                if enabled {
                    arr.retain(|v| {
                        v.as_str()
                            .map(|s| !wanted.iter().any(|m| m == s))
                            .unwrap_or(true)
                    });
                } else {
                    for m in &wanted {
                        if !arr.iter().any(|v| v.as_str() == Some(m.as_str())) {
                            arr.push(serde_json::Value::String(m.clone()));
                        }
                    }
                }
                Ok(())
            })
        }
    }
}

/// Set an enum-kind capability's value. Selecting the default value removes
/// the key (restores the agent default); anything else writes the string.
pub fn set_value(spec: &CapabilitySpec, home: &std::path::Path, value: &str) -> Result<(), String> {
    if spec.kind != "enum" {
        return Err(format!("capability '{}' is not an enum", spec.id));
    }
    let unset = value.is_empty() && spec.allow_unset;
    if !unset {
        let valid = resolve_values(spec, home);
        if !valid.iter().any(|v| v == value) {
            return Err(format!(
                "'{value}' is not a valid value for '{}' (expected one of {valid:?})",
                spec.id
            ));
        }
    }
    let is_default = unset || spec.default_value.as_deref() == Some(value);
    match &spec.writer {
        CapabilityWriter::JsonFlag { file, key, .. } => {
            let path = expand_home(file, home);
            let key = key.clone();
            let val = (!is_default).then(|| serde_json::Value::String(value.to_string()));
            crate::app_state::update_json_config(&path.to_string_lossy(), move |json| {
                json_modify_key(json, &key, val)
            })
        }
        CapabilityWriter::TomlKey { file, key, .. } => {
            let path = expand_home(file, home);
            let key = key.clone();
            let val = (!is_default).then(|| toml::Value::String(value.to_string()));
            crate::app_state::update_toml_config(&path.to_string_lossy(), move |doc| {
                toml_modify_key(doc, &key, val)
            })
        }
        CapabilityWriter::JsonListMember { .. } => {
            Err("enum capabilities cannot use json_list_member writers".to_string())
        }
    }
}

// ── Repo-scope capability overrides ────────────────────────────────────────
// A capability whose writer targets the agent's USER settings file can be
// overridden per repo in `<repo>/.claude/settings.json`. Semantics differ
// from the user scope: an absent key means "inherit", so the control is
// tri-state (inherit / on / off) rather than a toggle. Deny-list members
// can only be added at repo scope (a repo deny wins; there is no
// force-allow), so those are two-state (inherit / deny).

const CLAUDE_USER_SETTINGS: &str = "~/.claude/settings.json";

/// The repo-scope settings file for a capability, when repo override applies.
fn repo_override_file(spec: &CapabilitySpec, repo: &std::path::Path) -> Option<std::path::PathBuf> {
    let file = match &spec.writer {
        CapabilityWriter::JsonFlag { file, .. } => file,
        CapabilityWriter::JsonListMember { file, .. } => file,
        CapabilityWriter::TomlKey { .. } => return None, // global-only configs
    };
    (file == CLAUDE_USER_SETTINGS).then(|| repo.join(".claude/settings.json"))
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepoCapabilityState {
    pub id: String,
    pub label: String,
    pub description: Option<String>,
    /// Full helper text (docs-derived) for the "?" expander in the repo UI.
    pub help: Option<String>,
    pub category: String,
    /// "tristate" (inherit/on/off), "enum" (inherit + values), "deny" (inherit/deny).
    pub control: String,
    pub values: Vec<String>,
    /// "inherit" | "on" | "off" | "deny" | enum value.
    pub state: String,
}

pub fn repo_list(specs: &[CapabilitySpec], repo: &std::path::Path) -> Vec<RepoCapabilityState> {
    specs
        .iter()
        .filter_map(|s| {
            let file = repo_override_file(s, repo)?;
            let json = crate::app_state::read_json_config(&file.to_string_lossy());
            let (control, state, values) = match (&s.writer, s.kind.as_str()) {
                (CapabilityWriter::JsonFlag { key, off_value, .. }, "toggle") => {
                    let state = match json.as_ref().and_then(|j| lookup(j, key)) {
                        None => "inherit",
                        Some(v) if v == off_value => "off",
                        Some(_) => "on",
                    };
                    ("tristate", state.to_string(), vec![])
                }
                (CapabilityWriter::JsonFlag { key, .. }, "enum") => {
                    let state = json
                        .as_ref()
                        .and_then(|j| lookup(j, key))
                        .and_then(|v| v.as_str().map(String::from))
                        .unwrap_or_else(|| "inherit".to_string());
                    ("enum", state, s.values.clone())
                }
                (CapabilityWriter::JsonListMember { path, .. }, _) => {
                    let members = s.writer.list_members();
                    let present = json
                        .as_ref()
                        .and_then(|j| lookup(j, path))
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            members
                                .iter()
                                .any(|m| arr.iter().any(|v| v.as_str() == Some(*m)))
                        })
                        .unwrap_or(false);
                    (
                        "deny",
                        if present { "deny" } else { "inherit" }.to_string(),
                        vec![],
                    )
                }
                _ => return None,
            };
            Some(RepoCapabilityState {
                id: s.id.clone(),
                label: s.label.clone(),
                description: s.description.clone(),
                help: s.help.clone().or_else(|| s.description.clone()),
                category: s.category.clone(),
                control: control.to_string(),
                values,
                state,
            })
        })
        .collect()
}

pub fn repo_set(spec: &CapabilitySpec, repo: &std::path::Path, state: &str) -> Result<(), String> {
    let file = repo_override_file(spec, repo)
        .ok_or_else(|| format!("'{}' has no repo-scope override", spec.id))?;
    let fpath = file.to_string_lossy().into_owned();
    match &spec.writer {
        CapabilityWriter::JsonFlag { key, off_value, .. } if spec.kind == "toggle" => {
            let on_value = match off_value {
                serde_json::Value::Bool(b) => serde_json::Value::Bool(!b),
                _ => return Err(format!("'{}' cannot be forced on at repo scope", spec.id)),
            };
            let key = key.clone();
            let val = match state {
                "inherit" => None,
                "off" => Some(off_value.clone()),
                "on" => Some(on_value),
                other => return Err(format!("invalid state '{other}'")),
            };
            crate::app_state::update_json_config(&fpath, move |json| {
                json_modify_key(json, &key, val)
            })
        }
        CapabilityWriter::JsonFlag { key, .. } => {
            // enum kind
            if state != "inherit" && !spec.values.iter().any(|v| v == state) {
                return Err(format!(
                    "'{state}' is not a valid value for '{}' (expected inherit or one of {:?})",
                    spec.id, spec.values
                ));
            }
            let key = key.clone();
            let val = (state != "inherit").then(|| serde_json::Value::String(state.to_string()));
            crate::app_state::update_json_config(&fpath, move |json| {
                json_modify_key(json, &key, val)
            })
        }
        CapabilityWriter::JsonListMember { path, .. } => {
            let dotted = path.clone();
            let wanted: Vec<String> = spec
                .writer
                .list_members()
                .into_iter()
                .map(String::from)
                .collect();
            let add = match state {
                "deny" => true,
                "inherit" => false,
                other => return Err(format!("invalid state '{other}' for deny-list override")),
            };
            crate::app_state::update_json_config(&fpath, move |json| {
                let segs: Vec<&str> = dotted.split('.').collect();
                let (last, parents) = segs.split_last().ok_or("empty writer path")?;
                let mut cur = json;
                for seg in parents {
                    let obj = cur.as_object_mut().ok_or("config is not a JSON object")?;
                    cur = obj
                        .entry(seg.to_string())
                        .or_insert_with(|| serde_json::Value::Object(Default::default()));
                }
                let obj = cur
                    .as_object_mut()
                    .ok_or_else(|| format!("'{}' is not an object", parents.join(".")))?;
                let arr = obj
                    .entry(last.to_string())
                    .or_insert_with(|| serde_json::Value::Array(vec![]))
                    .as_array_mut()
                    .ok_or_else(|| format!("'{dotted}' is not an array"))?;
                if add {
                    for m in &wanted {
                        if !arr.iter().any(|v| v.as_str() == Some(m.as_str())) {
                            arr.push(serde_json::Value::String(m.clone()));
                        }
                    }
                } else {
                    arr.retain(|v| {
                        v.as_str()
                            .map(|s| !wanted.iter().any(|m| m == s))
                            .unwrap_or(true)
                    });
                }
                Ok(())
            })
        }
        CapabilityWriter::TomlKey { .. } => {
            Err(format!("'{}' has no repo-scope override", spec.id))
        }
    }
}

// ── Codex permission profiles (read-only viewer) ───────────────────────────
// Shape verified against learn.chatgpt.com/docs/permissions, 2026-07-19.

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CodexProfiles {
    /// True when legacy sandbox keys AND profiles are both configured —
    /// a combination Codex forbids.
    pub mixed_config: bool,
    pub default_profile: Option<String>,
    pub profiles: Vec<CodexProfile>,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CodexProfile {
    pub name: String,
    pub description: Option<String>,
    pub extends: Option<String>,
    pub workspace_roots: Vec<String>,
    /// Flattened path → access ("read" | "write" | "deny"); nested scoped
    /// tables render as "<base>/<sub>".
    pub filesystem: Vec<CodexFsRule>,
    pub network_enabled: bool,
    pub domains: Vec<CodexDomainRule>,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CodexFsRule {
    pub path: String,
    pub access: String,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CodexDomainRule {
    pub pattern: String,
    pub action: String,
}

fn flatten_fs_rules(
    prefix: &str,
    table: &toml::map::Map<String, toml::Value>,
    out: &mut Vec<CodexFsRule>,
) {
    for (k, v) in table {
        let path = if prefix.is_empty() {
            k.clone()
        } else {
            format!("{prefix} › {k}")
        };
        match v {
            toml::Value::String(access) => out.push(CodexFsRule {
                path,
                access: access.clone(),
            }),
            toml::Value::Table(sub) => flatten_fs_rules(&path, sub, out),
            _ => {}
        }
    }
}

pub fn codex_profiles(home: &std::path::Path) -> CodexProfiles {
    let cfg = home.join(".codex/config.toml");
    let Some(doc) = crate::app_state::read_toml_config(&cfg.to_string_lossy()) else {
        return CodexProfiles {
            mixed_config: false,
            default_profile: None,
            profiles: vec![],
        };
    };

    let legacy = doc.get("sandbox_mode").is_some() || doc.get("sandbox_workspace_write").is_some();
    let has_profiles = doc.get("default_permissions").is_some() || doc.get("permissions").is_some();

    let default_profile = doc
        .get("default_permissions")
        .and_then(|v| v.as_str().map(String::from));

    let mut profiles = vec![];
    if let Some(table) = doc.get("permissions").and_then(|v| v.as_table()) {
        for (name, val) in table {
            let Some(p) = val.as_table() else { continue };
            let workspace_roots = p
                .get("workspace_roots")
                .and_then(|v| v.as_table())
                .map(|t| {
                    t.iter()
                        .filter(|(_, on)| on.as_bool().unwrap_or(false))
                        .map(|(k, _)| k.clone())
                        .collect()
                })
                .unwrap_or_default();
            let mut filesystem = vec![];
            if let Some(fs) = p.get("filesystem").and_then(|v| v.as_table()) {
                flatten_fs_rules("", fs, &mut filesystem);
            }
            let network = p.get("network").and_then(|v| v.as_table());
            let network_enabled = network
                .and_then(|n| n.get("enabled"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let domains = network
                .and_then(|n| n.get("domains"))
                .and_then(|v| v.as_table())
                .map(|t| {
                    t.iter()
                        .filter_map(|(k, v)| {
                            v.as_str().map(|action| CodexDomainRule {
                                pattern: k.clone(),
                                action: action.to_string(),
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();
            profiles.push(CodexProfile {
                name: name.clone(),
                description: p
                    .get("description")
                    .and_then(|v| v.as_str().map(String::from)),
                extends: p.get("extends").and_then(|v| v.as_str().map(String::from)),
                workspace_roots,
                filesystem,
                network_enabled,
                domains,
            });
        }
    }

    CodexProfiles {
        mixed_config: legacy && has_profiles,
        default_profile,
        profiles,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_file(name: &str, content: &str) -> std::path::PathBuf {
        let p = std::env::temp_dir().join(format!("cb-cap-{}-{name}.json", std::process::id()));
        std::fs::write(&p, content).unwrap();
        p
    }

    fn flag_spec(file: &std::path::Path, key: &str, off: serde_json::Value) -> CapabilitySpec {
        CapabilitySpec {
            id: "t".into(),
            label: "T".into(),
            description: None,
            help: None,
            example: None,
            kind: "toggle".into(),
            values: vec![],
            default_value: None,
            default_on: true,
            allow_unset: false,
            values_from: None,
            category: "context".into(),
            tokens_hint: None,
            writer: CapabilityWriter::JsonFlag {
                file: file.to_string_lossy().into_owned(),
                key: key.into(),
                off_value: off,
            },
        }
    }

    fn list_spec(file: &std::path::Path, path: &str, member: &str) -> CapabilitySpec {
        CapabilitySpec {
            id: "t".into(),
            label: "T".into(),
            description: None,
            help: None,
            example: None,
            kind: "toggle".into(),
            values: vec![],
            default_value: None,
            default_on: true,
            allow_unset: false,
            values_from: None,
            category: "tools".into(),
            tokens_hint: None,
            writer: CapabilityWriter::JsonListMember {
                file: file.to_string_lossy().into_owned(),
                path: path.into(),
                member: Some(member.into()),
                members: vec![],
            },
        }
    }

    fn baseline_tools() -> std::collections::HashSet<String> {
        include_str!("engine/manifests/claude-tools-baseline.txt")
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty() && !l.starts_with('#'))
            .map(String::from)
            .collect()
    }

    /// Every capability in claude.toml parses, has a sane shape, and every
    /// non-glob deny member is a canonical tool name from the docs baseline.
    #[test]
    fn claude_manifest_capabilities_are_valid() {
        let manifest = crate::engine::load_manifest("claude").expect("claude manifest loads");
        assert!(
            manifest.capabilities.len() >= 15,
            "expected the full capability set, got {}",
            manifest.capabilities.len()
        );

        let mut ids = std::collections::HashSet::new();
        for cap in &manifest.capabilities {
            assert!(
                ids.insert(cap.id.clone()),
                "duplicate capability id {}",
                cap.id
            );
            assert!(
                ["context", "tools", "features", "limits"].contains(&cap.category.as_str()),
                "unknown category '{}' on {}",
                cap.category,
                cap.id
            );
            match &cap.writer {
                CapabilityWriter::JsonFlag { file, key, .. } => {
                    assert!(
                        file.starts_with("~/"),
                        "{}: writer file must be home-relative",
                        cap.id
                    );
                    assert!(!key.is_empty(), "{}: empty flag key", cap.id);
                }
                CapabilityWriter::JsonListMember { file, path, .. } => {
                    assert!(
                        file.starts_with("~/"),
                        "{}: writer file must be home-relative",
                        cap.id
                    );
                    assert!(!path.is_empty(), "{}: empty list path", cap.id);
                    assert!(
                        !cap.writer.list_members().is_empty(),
                        "{}: JsonListMember with no members",
                        cap.id
                    );
                }
                CapabilityWriter::TomlKey {
                    file,
                    key,
                    off_value,
                } => {
                    assert!(
                        file.starts_with("~/"),
                        "{}: writer file must be home-relative",
                        cap.id
                    );
                    assert!(!key.is_empty(), "{}: empty toml key", cap.id);
                    if cap.kind == "toggle" {
                        assert!(
                            off_value.is_some(),
                            "{}: toml toggle needs off_value",
                            cap.id
                        );
                    }
                }
            }
            if cap.kind == "enum" {
                assert!(!cap.values.is_empty(), "{}: enum with no values", cap.id);
                if let Some(dv) = &cap.default_value {
                    assert!(
                        cap.values.contains(dv),
                        "{}: default_value not in values",
                        cap.id
                    );
                }
            }
        }
    }

    #[test]
    fn capability_members_match_tools_baseline() {
        let baseline = baseline_tools();
        let manifest = crate::engine::load_manifest("claude").expect("claude manifest loads");
        for cap in &manifest.capabilities {
            for m in cap.writer.list_members() {
                if m.contains('*') {
                    // Glob: its literal prefix must match at least one canonical tool.
                    let prefix = m.trim_end_matches('*');
                    assert!(
                        baseline.iter().any(|t| t.starts_with(prefix)),
                        "{}: glob '{m}' matches no canonical tool",
                        cap.id
                    );
                } else {
                    assert!(
                        baseline.contains(m),
                        "{}: '{m}' is not a canonical tool name (see claude-tools-baseline.txt)",
                        cap.id
                    );
                }
            }
        }
    }

    #[test]
    fn json_flag_roundtrip() {
        let f = tmp_file("flag", r#"{"model":"opus"}"#);
        let home = std::path::Path::new("/");
        let spec = flag_spec(&f, "autoMemoryEnabled", serde_json::json!(false));

        assert!(read_enabled(&spec, home)); // absent = on
        set(&spec, home, false).unwrap();
        assert!(!read_enabled(&spec, home));
        set(&spec, home, true).unwrap();
        assert!(read_enabled(&spec, home));
        // unrelated keys survive
        let json = crate::app_state::read_json_config(&f.to_string_lossy()).unwrap();
        assert_eq!(json.get("model").and_then(|v| v.as_str()), Some("opus"));
        assert!(json.get("autoMemoryEnabled").is_none()); // on = key removed
        let _ = std::fs::remove_file(&f);
    }

    #[test]
    fn json_flag_true_off_value() {
        // disable* family: key present with `true` means OFF.
        let f = tmp_file("flag2", "{}");
        let home = std::path::Path::new("/");
        let spec = flag_spec(&f, "disableAllHooks", serde_json::json!(true));
        set(&spec, home, false).unwrap();
        let json = crate::app_state::read_json_config(&f.to_string_lossy()).unwrap();
        assert_eq!(json.get("disableAllHooks"), Some(&serde_json::json!(true)));
        assert!(!read_enabled(&spec, home));
        let _ = std::fs::remove_file(&f);
    }

    #[test]
    fn json_list_member_roundtrip() {
        let f = tmp_file(
            "list",
            r#"{"permissions":{"allow":["Bash(npm:*)"],"deny":["Read(.env*)"]}}"#,
        );
        let home = std::path::Path::new("/");
        let spec = list_spec(&f, "permissions.deny", "WebFetch");

        assert!(read_enabled(&spec, home));
        set(&spec, home, false).unwrap();
        assert!(!read_enabled(&spec, home));
        // existing rules untouched, no duplicates on repeat
        set(&spec, home, false).unwrap();
        let json = crate::app_state::read_json_config(&f.to_string_lossy()).unwrap();
        let deny = json["permissions"]["deny"].as_array().unwrap();
        assert_eq!(deny.len(), 2);
        assert!(deny.iter().any(|v| v == "Read(.env*)"));
        set(&spec, home, true).unwrap();
        assert!(read_enabled(&spec, home));
        let json = crate::app_state::read_json_config(&f.to_string_lossy()).unwrap();
        assert!(json["permissions"]["allow"].as_array().unwrap().len() == 1);
        let _ = std::fs::remove_file(&f);
    }

    #[test]
    fn json_list_multi_member_atomic() {
        let f = tmp_file("multi", "{}");
        let home = std::path::Path::new("/");
        let mut spec = list_spec(&f, "permissions.deny", "EnterPlanMode");
        if let CapabilityWriter::JsonListMember { members, .. } = &mut spec.writer {
            members.push("ExitPlanMode".into());
        }
        set(&spec, home, false).unwrap();
        let json = crate::app_state::read_json_config(&f.to_string_lossy()).unwrap();
        let deny = json["permissions"]["deny"].as_array().unwrap();
        assert_eq!(deny.len(), 2);
        assert!(!read_enabled(&spec, home));
        set(&spec, home, true).unwrap();
        let json = crate::app_state::read_json_config(&f.to_string_lossy()).unwrap();
        assert!(json["permissions"]["deny"].as_array().unwrap().is_empty());
        assert!(read_enabled(&spec, home));
        let _ = std::fs::remove_file(&f);
    }

    #[test]
    fn toml_key_toggle_roundtrip() {
        let f = std::env::temp_dir().join(format!("cb-cap-{}-toml.toml", std::process::id()));
        std::fs::write(
            &f,
            "model = \"gpt-5.4-mini\"\n\n[features]\njs_repl = false\n",
        )
        .unwrap();
        let home = std::path::Path::new("/");
        let mut spec = flag_spec(&f, "unused", serde_json::json!(false));
        spec.writer = CapabilityWriter::TomlKey {
            file: f.to_string_lossy().into_owned(),
            key: "features.multi_agent".into(),
            off_value: Some(serde_json::json!(false)),
        };

        assert!(read_enabled(&spec, home)); // absent = on
        set(&spec, home, false).unwrap();
        assert!(!read_enabled(&spec, home));
        // unrelated keys survive
        let doc = crate::app_state::read_toml_config(&f.to_string_lossy()).unwrap();
        assert_eq!(
            doc.get("model").and_then(|v| v.as_str()),
            Some("gpt-5.4-mini")
        );
        assert_eq!(
            toml_lookup(&doc, "features.js_repl").and_then(|v| v.as_bool()),
            Some(false)
        );
        set(&spec, home, true).unwrap();
        let doc = crate::app_state::read_toml_config(&f.to_string_lossy()).unwrap();
        assert!(toml_lookup(&doc, "features.multi_agent").is_none());
        let _ = std::fs::remove_file(&f);
    }

    #[test]
    fn enum_set_value_roundtrip() {
        let f = std::env::temp_dir().join(format!("cb-cap-{}-enum.toml", std::process::id()));
        std::fs::write(&f, "model = \"x\"\n").unwrap();
        let home = std::path::Path::new("/");
        let mut spec = flag_spec(&f, "unused", serde_json::json!(false));
        spec.kind = "enum".into();
        spec.values = vec!["untrusted".into(), "on-request".into(), "never".into()];
        spec.default_value = Some("on-request".into());
        spec.writer = CapabilityWriter::TomlKey {
            file: f.to_string_lossy().into_owned(),
            key: "approval_policy".into(),
            off_value: None,
        };

        assert_eq!(read_value(&spec, home).as_deref(), Some("on-request")); // default
        set_value(&spec, home, "never").unwrap();
        assert_eq!(read_value(&spec, home).as_deref(), Some("never"));
        // selecting the default removes the key
        set_value(&spec, home, "on-request").unwrap();
        let doc = crate::app_state::read_toml_config(&f.to_string_lossy()).unwrap();
        assert!(doc.get("approval_policy").is_none());
        // invalid value rejected
        assert!(set_value(&spec, home, "yolo").is_err());
        // toggle API rejected on enums
        assert!(set(&spec, home, false).is_err());
        let _ = std::fs::remove_file(&f);
    }

    #[test]
    fn default_off_capability_reads_disabled_when_absent() {
        let f = tmp_file("defoff", "{}");
        let home = std::path::Path::new("/");
        let mut spec = flag_spec(&f, "memories", serde_json::json!(false));
        spec.default_on = false;
        assert!(!read_enabled(&spec, home));
        let _ = std::fs::remove_file(&f);
    }

    // Verbatim example from learn.chatgpt.com/docs/permissions.
    const CODEX_PROFILE_EXAMPLE: &str = r#"
default_permissions = "project-edit"

[permissions.project-edit]
description = "Project editing with OpenAI API access."
extends = ":workspace"

[permissions.project-edit.workspace_roots]
"~/code/app" = true
"~/code/shared-lib" = true

[permissions.project-edit.filesystem]
":minimal" = "read"

[permissions.project-edit.filesystem.":workspace_roots"]
"." = "write"
".devcontainer" = "read"
"**/*.env" = "deny"

[permissions.project-edit.network]
enabled = true

[permissions.project-edit.network.domains]
"api.openai.com" = "allow"
"tracking.example.com" = "deny"
"#;

    #[test]
    fn codex_profiles_parse_docs_example() {
        let home = std::env::temp_dir().join(format!("cb-codex-{}", std::process::id()));
        std::fs::create_dir_all(home.join(".codex")).unwrap();
        std::fs::write(home.join(".codex/config.toml"), CODEX_PROFILE_EXAMPLE).unwrap();

        let out = codex_profiles(&home);
        assert!(!out.mixed_config);
        assert_eq!(out.default_profile.as_deref(), Some("project-edit"));
        assert_eq!(out.profiles.len(), 1);
        let p = &out.profiles[0];
        assert_eq!(p.extends.as_deref(), Some(":workspace"));
        assert_eq!(p.workspace_roots.len(), 2);
        assert!(p.network_enabled);
        assert_eq!(p.domains.len(), 2);
        // flattened rules include the scoped ones
        assert!(p
            .filesystem
            .iter()
            .any(|r| r.path == ":minimal" && r.access == "read"));
        assert!(p
            .filesystem
            .iter()
            .any(|r| r.path.contains(":workspace_roots")
                && r.path.contains("**/*.env")
                && r.access == "deny"));

        // mixed config detected when legacy key added
        std::fs::write(
            home.join(".codex/config.toml"),
            format!("sandbox_mode = \"workspace-write\"\n{CODEX_PROFILE_EXAMPLE}"),
        )
        .unwrap();
        assert!(codex_profiles(&home).mixed_config);
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn dynamic_enum_values_and_unset() {
        let f = std::env::temp_dir().join(format!("cb-cap-{}-dyn.toml", std::process::id()));
        std::fs::write(&f, CODEX_PROFILE_EXAMPLE).unwrap();
        let home = std::path::Path::new("/");
        let mut spec = flag_spec(&f, "unused", serde_json::json!(false));
        spec.kind = "enum".into();
        spec.values = vec![":read-only".into(), ":workspace".into()];
        spec.allow_unset = true;
        spec.values_from = Some(ValuesFrom::TomlTableNames {
            file: f.to_string_lossy().into_owned(),
            path: "permissions".into(),
        });
        spec.writer = CapabilityWriter::TomlKey {
            file: f.to_string_lossy().into_owned(),
            key: "default_permissions".into(),
            off_value: None,
        };

        // dynamic values include the user profile
        let vals = resolve_values(&spec, home);
        assert!(vals.contains(&"project-edit".to_string()));
        // current value read from file
        assert_eq!(read_value(&spec, home).as_deref(), Some("project-edit"));
        // set to built-in, then unset removes the key
        set_value(&spec, home, ":workspace").unwrap();
        assert_eq!(read_value(&spec, home).as_deref(), Some(":workspace"));
        set_value(&spec, home, "").unwrap();
        let doc = crate::app_state::read_toml_config(&f.to_string_lossy()).unwrap();
        assert!(doc.get("default_permissions").is_none());
        // unset rejected when allow_unset = false
        spec.allow_unset = false;
        assert!(set_value(&spec, home, "").is_err());
        let _ = std::fs::remove_file(&f);
    }

    #[test]
    fn repo_scope_tristate_roundtrip() {
        let repo = std::env::temp_dir().join(format!("cb-repocap-{}", std::process::id()));
        std::fs::create_dir_all(repo.join(".git")).unwrap();

        let mut spec = flag_spec(
            std::path::Path::new("/unused"),
            "autoMemoryEnabled",
            serde_json::json!(false),
        );
        spec.writer = CapabilityWriter::JsonFlag {
            file: "~/.claude/settings.json".into(),
            key: "autoMemoryEnabled".into(),
            off_value: serde_json::json!(false),
        };

        // absent file → inherit
        assert_eq!(repo_list(&[spec.clone()], &repo)[0].state, "inherit");
        // force off, then force ON writes the inverse bool
        repo_set(&spec, &repo, "off").unwrap();
        assert_eq!(repo_list(&[spec.clone()], &repo)[0].state, "off");
        repo_set(&spec, &repo, "on").unwrap();
        assert_eq!(repo_list(&[spec.clone()], &repo)[0].state, "on");
        let json = crate::app_state::read_json_config(
            &repo.join(".claude/settings.json").to_string_lossy(),
        )
        .unwrap();
        assert_eq!(json["autoMemoryEnabled"], serde_json::json!(true));
        // back to inherit removes the key
        repo_set(&spec, &repo, "inherit").unwrap();
        assert_eq!(repo_list(&[spec.clone()], &repo)[0].state, "inherit");

        // deny-list override: only inherit/deny
        let mut deny_spec = list_spec(
            std::path::Path::new("/unused"),
            "permissions.deny",
            "WebFetch",
        );
        if let CapabilityWriter::JsonListMember { file, .. } = &mut deny_spec.writer {
            *file = "~/.claude/settings.json".into();
        }
        repo_set(&deny_spec, &repo, "deny").unwrap();
        assert_eq!(repo_list(&[deny_spec.clone()], &repo)[0].state, "deny");
        assert!(repo_set(&deny_spec, &repo, "on").is_err());
        repo_set(&deny_spec, &repo, "inherit").unwrap();
        assert_eq!(repo_list(&[deny_spec.clone()], &repo)[0].state, "inherit");

        // toml-backed capabilities have no repo scope
        let mut toml_spec = flag_spec(
            std::path::Path::new("/unused"),
            "x",
            serde_json::json!(false),
        );
        toml_spec.writer = CapabilityWriter::TomlKey {
            file: "~/.codex/config.toml".into(),
            key: "features.apps".into(),
            off_value: Some(serde_json::json!(false)),
        };
        assert!(repo_list(&[toml_spec.clone()], &repo).is_empty());
        assert!(repo_set(&toml_spec, &repo, "off").is_err());

        let _ = std::fs::remove_dir_all(&repo);
    }

    #[test]
    fn json_list_member_creates_missing_path() {
        let f = tmp_file("list2", "{}");
        let home = std::path::Path::new("/");
        let spec = list_spec(&f, "permissions.deny", "WebSearch");
        set(&spec, home, false).unwrap();
        let json = crate::app_state::read_json_config(&f.to_string_lossy()).unwrap();
        assert_eq!(json["permissions"]["deny"][0], "WebSearch");
        let _ = std::fs::remove_file(&f);
    }
}
