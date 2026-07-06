use super::manifest::{SkillSource, SkillSourceSpec};
use super::resolve::{expand_home, version_in_range};
use crate::detectors::{
    parse_skill_content_hash, parse_skill_description, parse_skill_source_url, skill_md_exists,
};
use crate::models::Skill;
use std::collections::HashMap;

pub fn collect(
    sources: &[SkillSource],
    version: Option<&str>,
    home: &std::path::Path,
) -> Vec<Skill> {
    let mut all = Vec::new();
    for (idx, entry) in sources.iter().enumerate() {
        if !version_in_range(
            version,
            entry.min_version.as_deref(),
            entry.max_version.as_deref(),
        ) {
            continue;
        }
        let source_id = entry
            .id
            .clone()
            .unwrap_or_else(|| format!("source_{}", idx));
        let mut skills = read_source(&entry.spec, home);
        for skill in &mut skills {
            skill.source_id = source_id.clone();
        }
        all.extend(skills);
    }
    all.sort_by(|a, b| a.name.cmp(&b.name));
    all
}

fn read_source(source: &SkillSourceSpec, home: &std::path::Path) -> Vec<Skill> {
    match source {
        SkillSourceSpec::Directory {
            path,
            disabled_subdir,
            ..
        } => read_directory(&expand_home(path, home), disabled_subdir.as_deref()),
        SkillSourceSpec::ExtensionDirSkills { dir, manifest_file } => {
            read_extension_dir_skills(&expand_home(dir, home), manifest_file)
        }
        SkillSourceSpec::TomlConfigDirectory {
            path,
            config_file,
            config_key_path,
            path_field,
            enabled_field,
        } => read_toml_config_directory(
            &expand_home(path, home),
            &expand_home(config_file, home),
            config_key_path,
            path_field,
            enabled_field,
        ),
    }
}

fn read_toml_config_directory(
    dir: &std::path::Path,
    config_file: &std::path::Path,
    config_key_path: &[String],
    path_field: &str,
    enabled_field: &str,
) -> Vec<Skill> {
    // Build a map of SKILL.md absolute path → enabled bool from config file
    let enabled_map: HashMap<String, bool> =
        load_toml_enabled_map(config_file, config_key_path, path_field, enabled_field);

    let mut skills = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return skills;
    };

    for entry in entries.flatten() {
        let raw_name = entry.file_name().to_string_lossy().to_string();
        if raw_name.starts_with('.') {
            continue;
        }
        let path = entry.path();
        if path.is_symlink() && !path.exists() {
            continue;
        }
        if path.is_file() && path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let name = if path.is_file() {
            path.file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or(raw_name)
        } else {
            raw_name
        };

        // Determine active state: check config entry for {path}/SKILL.md
        let skill_md = if path.is_dir() {
            path.join("SKILL.md").to_string_lossy().into_owned()
        } else {
            path.to_string_lossy().into_owned()
        };
        // Absent from config → defaults to active (enabled)
        let active = enabled_map.get(&skill_md).copied().unwrap_or(true);

        let description = parse_skill_description(&path);
        let has_full_description = skill_md_exists(&path);
        let source_url = parse_skill_source_url(&path);
        let content_hash = parse_skill_content_hash(&path);
        skills.push(Skill {
            name,
            path: path.to_string_lossy().to_string(),
            description,
            has_full_description,
            active,
            source_id: String::new(),
            source_url,
            content_hash,
        });
    }
    skills
}

fn load_toml_enabled_map(
    config_file: &std::path::Path,
    key_path: &[String],
    path_field: &str,
    enabled_field: &str,
) -> HashMap<String, bool> {
    let raw = match std::fs::read_to_string(config_file) {
        Ok(s) => s,
        Err(_) => return HashMap::new(),
    };
    let doc: toml::Value = match toml::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return HashMap::new(),
    };

    // Navigate to the array at key_path
    let mut current = &doc;
    for key in key_path {
        match current.get(key) {
            Some(v) => current = v,
            None => return HashMap::new(),
        }
    }

    let array = match current.as_array() {
        Some(a) => a,
        None => return HashMap::new(),
    };

    let mut map = HashMap::new();
    for entry in array {
        if let (Some(path_val), enabled_val) = (
            entry.get(path_field).and_then(|v| v.as_str()),
            entry.get(enabled_field).and_then(|v| v.as_bool()),
        ) {
            map.insert(path_val.to_string(), enabled_val.unwrap_or(true));
        }
    }
    map
}

fn read_directory(dir: &std::path::Path, disabled_subdir: Option<&str>) -> Vec<Skill> {
    let mut skills = Vec::new();

    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let raw_name = entry.file_name().to_string_lossy().to_string();
            if raw_name.starts_with('.') {
                continue;
            }
            let path = entry.path();
            // skip broken symlinks — target doesn't exist, not usable
            if path.is_symlink() && !path.exists() {
                continue;
            }
            // plain files must be .md; skip everything else (e.g. .json, .sh)
            if path.is_file() && path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }
            // strip .md extension for flat skill files so name = "ios-testing" not "ios-testing.md"
            let name = if path.is_file() {
                path.file_stem()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or(raw_name)
            } else {
                raw_name
            };
            let description = parse_skill_description(&path);
            let has_full_description = skill_md_exists(&path);
            let source_url = parse_skill_source_url(&path);
            let content_hash = parse_skill_content_hash(&path);
            skills.push(Skill {
                name,
                path: path.to_string_lossy().to_string(),
                description,
                has_full_description,
                active: true,
                source_id: String::new(),
                source_url,
                content_hash,
            });
        }
    }

    if let Some(sub) = disabled_subdir {
        let disabled_dir = dir.join(sub);
        if let Ok(entries) = std::fs::read_dir(&disabled_dir) {
            for entry in entries.flatten() {
                let raw_name = entry.file_name().to_string_lossy().to_string();
                if raw_name.starts_with('.') {
                    continue;
                }
                let path = entry.path();
                // skip broken symlinks
                if path.is_symlink() && !path.exists() {
                    continue;
                }
                if path.is_file() && path.extension().and_then(|e| e.to_str()) != Some("md") {
                    continue;
                }
                let name = if path.is_file() {
                    path.file_stem()
                        .map(|s| s.to_string_lossy().into_owned())
                        .unwrap_or(raw_name)
                } else {
                    raw_name
                };
                let description = parse_skill_description(&path);
                let has_full_description = skill_md_exists(&path);
                let source_url = parse_skill_source_url(&path);
                let content_hash = parse_skill_content_hash(&path);
                skills.push(Skill {
                    name,
                    path: path.to_string_lossy().to_string(),
                    description,
                    has_full_description,
                    active: false,
                    source_id: String::new(),
                    source_url,
                    content_hash,
                });
            }
        }
    }

    skills
}

/// For each plugin subdirectory that contains `manifest_file`, read skills
/// from `plugin_dir/skills/<skill_name>/SKILL.md`. Plugin skills are always active.
fn read_extension_dir_skills(dir: &std::path::Path, manifest_file: &str) -> Vec<Skill> {
    let mut skills = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return skills;
    };
    for entry in entries.flatten() {
        let plugin_dir = entry.path();
        if !plugin_dir.is_dir() {
            continue;
        }
        if !plugin_dir.join(manifest_file).exists() {
            continue;
        }
        let skills_dir = plugin_dir.join("skills");
        let Ok(skill_entries) = std::fs::read_dir(&skills_dir) else {
            continue;
        };
        for skill_entry in skill_entries.flatten() {
            let skill_path = skill_entry.path();
            if !skill_path.is_dir() {
                continue;
            }
            let raw_name = skill_entry.file_name().to_string_lossy().to_string();
            if raw_name.starts_with('.') {
                continue;
            }
            let skill_md = skill_path.join("SKILL.md");
            if !skill_md.exists() {
                continue;
            }
            let description = parse_skill_description(&skill_path);
            let has_full_description = skill_md_exists(&skill_path);
            let source_url = parse_skill_source_url(&skill_path);
            let content_hash = parse_skill_content_hash(&skill_path);
            skills.push(Skill {
                name: raw_name,
                path: skill_path.to_string_lossy().to_string(),
                description,
                has_full_description,
                active: true,
                source_id: String::new(),
                source_url,
                content_hash,
            });
        }
    }
    skills
}

#[cfg(test)]
mod tests {
    use super::super::manifest::SkillSource;
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn wrap(spec: SkillSourceSpec) -> SkillSource {
        SkillSource {
            id: None,
            min_version: None,
            max_version: None,
            spec,
        }
    }

    fn make_skill_dir(parent: &std::path::Path, name: &str) {
        fs::create_dir_all(parent.join(name)).unwrap();
    }

    #[test]
    fn reads_active_skills_from_dir() {
        let tmp = TempDir::new().unwrap();
        make_skill_dir(tmp.path(), "alpha");
        make_skill_dir(tmp.path(), "beta");

        let source = SkillSourceSpec::Directory {
            path: tmp.path().to_string_lossy().to_string(),
            disabled_subdir: None,
            flat_files: false,
        };
        let skills = collect(&[wrap(source)], None, tmp.path());
        assert_eq!(skills.len(), 2);
        assert!(skills.iter().all(|s| s.active));
    }

    #[test]
    fn reads_disabled_skills_from_subdir() {
        let tmp = TempDir::new().unwrap();
        make_skill_dir(tmp.path(), "active-skill");
        make_skill_dir(&tmp.path().join(".disabled"), "inactive-skill");

        let source = SkillSourceSpec::Directory {
            path: tmp.path().to_string_lossy().to_string(),
            disabled_subdir: Some(".disabled".to_string()),
            flat_files: false,
        };
        let skills = collect(&[wrap(source)], None, tmp.path());
        assert_eq!(skills.len(), 2);
        let active = skills.iter().find(|s| s.name == "active-skill").unwrap();
        let inactive = skills.iter().find(|s| s.name == "inactive-skill").unwrap();
        assert!(active.active);
        assert!(!inactive.active);
    }

    #[test]
    fn missing_dir_returns_empty() {
        let tmp = TempDir::new().unwrap();
        let source = SkillSourceSpec::Directory {
            path: tmp.path().join("nonexistent").to_string_lossy().to_string(),
            disabled_subdir: None,
            flat_files: false,
        };
        let skills = collect(&[wrap(source)], None, tmp.path());
        assert!(skills.is_empty());
    }

    #[test]
    fn skips_hidden_entries() {
        let tmp = TempDir::new().unwrap();
        make_skill_dir(tmp.path(), "visible");
        make_skill_dir(tmp.path(), ".hidden");

        let source = SkillSourceSpec::Directory {
            path: tmp.path().to_string_lossy().to_string(),
            disabled_subdir: None,
            flat_files: false,
        };
        let skills = collect(&[wrap(source)], None, tmp.path());
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "visible");
    }

    #[test]
    fn results_are_sorted_alphabetically() {
        let tmp = TempDir::new().unwrap();
        make_skill_dir(tmp.path(), "zulu");
        make_skill_dir(tmp.path(), "alpha");
        make_skill_dir(tmp.path(), "mike");

        let source = SkillSourceSpec::Directory {
            path: tmp.path().to_string_lossy().to_string(),
            disabled_subdir: None,
            flat_files: false,
        };
        let skills = collect(&[wrap(source)], None, tmp.path());
        let names: Vec<&str> = skills.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, vec!["alpha", "mike", "zulu"]);
    }

    #[test]
    fn version_gate_skips_skill_source_outside_range() {
        let tmp = TempDir::new().unwrap();
        make_skill_dir(tmp.path(), "skill-a");

        let source = SkillSource {
            id: None,
            min_version: Some("3.0".to_string()),
            max_version: None,
            spec: SkillSourceSpec::Directory {
                path: tmp.path().to_string_lossy().to_string(),
                disabled_subdir: None,
                flat_files: false,
            },
        };
        let skills = collect(&[source], Some("2.9"), tmp.path());
        assert!(
            skills.is_empty(),
            "version 2.9 below min 3.0 should skip source"
        );
    }
}
