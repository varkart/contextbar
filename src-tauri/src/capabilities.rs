//! Feature/context capability toggles, driven by `[[capabilities]]` manifest
//! entries. A capability maps a user-facing switch ("Auto memory", "WebFetch
//! tool") onto a config-file write; see `CapabilityWriter` for the mechanisms.
//!
//! Semantics: toggles only ever write the declared off-state or remove it —
//! they never overwrite unrelated values, so hand-edited configs survive.

use crate::engine::manifest::{CapabilitySpec, CapabilityWriter};
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
                values: s.values.clone(),
                default_value: s.default_value.clone(),
                value: if is_enum { read_value(s, home) } else { None },
                enabled: if is_enum { true } else { read_enabled(s, home) },
                writer_file,
                writer_kind,
                writer_key,
                writer_off_value,
                writer_path,
                writer_members: s.writer.list_members().into_iter().map(String::from).collect(),
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
            let off = off_value
                .as_ref()
                .and_then(json_to_toml)
                .ok_or_else(|| format!("'{}': toml_key toggle needs a scalar off_value", spec.id))?;
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
    if !spec.values.iter().any(|v| v == value) {
        return Err(format!(
            "'{value}' is not a valid value for '{}' (expected one of {:?})",
            spec.id, spec.values
        ));
    }
    let is_default = spec.default_value.as_deref() == Some(value);
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
            assert!(ids.insert(cap.id.clone()), "duplicate capability id {}", cap.id);
            assert!(
                ["context", "tools", "features", "limits"].contains(&cap.category.as_str()),
                "unknown category '{}' on {}",
                cap.category,
                cap.id
            );
            match &cap.writer {
                CapabilityWriter::JsonFlag { file, key, .. } => {
                    assert!(file.starts_with("~/"), "{}: writer file must be home-relative", cap.id);
                    assert!(!key.is_empty(), "{}: empty flag key", cap.id);
                }
                CapabilityWriter::JsonListMember { file, path, .. } => {
                    assert!(file.starts_with("~/"), "{}: writer file must be home-relative", cap.id);
                    assert!(!path.is_empty(), "{}: empty list path", cap.id);
                    assert!(
                        !cap.writer.list_members().is_empty(),
                        "{}: JsonListMember with no members",
                        cap.id
                    );
                }
                CapabilityWriter::TomlKey { file, key, off_value } => {
                    assert!(file.starts_with("~/"), "{}: writer file must be home-relative", cap.id);
                    assert!(!key.is_empty(), "{}: empty toml key", cap.id);
                    if cap.kind == "toggle" {
                        assert!(off_value.is_some(), "{}: toml toggle needs off_value", cap.id);
                    }
                }
            }
            if cap.kind == "enum" {
                assert!(!cap.values.is_empty(), "{}: enum with no values", cap.id);
                if let Some(dv) = &cap.default_value {
                    assert!(cap.values.contains(dv), "{}: default_value not in values", cap.id);
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
        std::fs::write(&f, "model = \"gpt-5.4-mini\"\n\n[features]\njs_repl = false\n").unwrap();
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
        assert_eq!(doc.get("model").and_then(|v| v.as_str()), Some("gpt-5.4-mini"));
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
