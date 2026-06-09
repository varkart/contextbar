use crate::models::Skill;
use crate::detectors::parse_skill_description;
use super::manifest::SkillSourceSpec;
use super::resolve::expand_home;

pub fn collect(sources: &[SkillSourceSpec], home: &std::path::Path) -> Vec<Skill> {
    let mut all = Vec::new();
    for source in sources {
        all.extend(read_source(source, home));
    }
    all.sort_by(|a, b| a.name.cmp(&b.name));
    all
}

fn read_source(source: &SkillSourceSpec, home: &std::path::Path) -> Vec<Skill> {
    match source {
        SkillSourceSpec::Directory { path, disabled_subdir } => {
            read_directory(&expand_home(path, home), disabled_subdir.as_deref())
        }
    }
}

fn read_directory(dir: &std::path::Path, disabled_subdir: Option<&str>) -> Vec<Skill> {
    let mut skills = Vec::new();

    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') { continue; }
            let path = entry.path();
            let description = parse_skill_description(&path);
            skills.push(Skill { name, path: path.to_string_lossy().to_string(), description, active: true });
        }
    }

    if let Some(sub) = disabled_subdir {
        let disabled_dir = dir.join(sub);
        if let Ok(entries) = std::fs::read_dir(&disabled_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') { continue; }
                let path = entry.path();
                let description = parse_skill_description(&path);
                skills.push(Skill { name, path: path.to_string_lossy().to_string(), description, active: false });
            }
        }
    }

    skills
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

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
        };
        let skills = collect(&[source], tmp.path());
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
        };
        let skills = collect(&[source], tmp.path());
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
        };
        let skills = collect(&[source], tmp.path());
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
        };
        let skills = collect(&[source], tmp.path());
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
        };
        let skills = collect(&[source], tmp.path());
        let names: Vec<&str> = skills.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, vec!["alpha", "mike", "zulu"]);
    }
}
