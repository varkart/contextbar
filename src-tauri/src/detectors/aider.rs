use crate::models::AiTool;

fn not_installed() -> AiTool {
    AiTool {
        id: "aider".to_string(),
        name: "Aider".to_string(),
        version: None,
        installed: false,
        install_path: None,
        skills: vec![],
        mcps: vec![],
        error: None,
    }
}

pub fn detect() -> AiTool {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return not_installed(),
    };

    // Check candidate paths in order
    let candidates = [
        home.join(".local").join("bin").join("aider"),
        home.join(".local")
            .join("share")
            .join("pipx")
            .join("venvs")
            .join("aider-chat")
            .join("bin")
            .join("aider"),
    ];

    let in_path = super::find_in_path("aider");

    let install_path = if let Some(p) = in_path.as_ref() {
        Some(p.clone())
    } else {
        candidates
            .iter()
            .find(|p| p.exists())
            .map(|p| p.to_string_lossy().to_string())
    };

    // Also check the aider config dir
    let config_dir_exists = home.join(".aider").is_dir();
    let config_file_exists = home.join(".aider.conf.yml").exists();

    let installed = install_path.is_some() || config_dir_exists || config_file_exists;

    if !installed {
        return not_installed();
    }

    // Determine the resolved install path for display
    let resolved_path = install_path.as_ref().cloned().or_else(|| {
        if config_dir_exists {
            Some(home.join(".aider").to_string_lossy().to_string())
        } else {
            None
        }
    });

    let version_bin = in_path.clone().or_else(|| install_path.clone());
    let version = version_bin.and_then(|bin| {
        super::run_with_timeout(
            move || run_aider_version(&bin),
            std::time::Duration::from_millis(800),
        )
    });

    AiTool {
        id: "aider".to_string(),
        name: "Aider".to_string(),
        version,
        installed: true,
        install_path: resolved_path,
        skills: vec![],
        mcps: vec![],
        error: None,
    }
}

/// Run `aider --version`; only called when binary is already confirmed present.
fn run_aider_version(binary: &str) -> Option<String> {
    let output = std::process::Command::new(binary)
        .arg("--version")
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout.split_whitespace().next().map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_not_installed_returns_correct_fields() {
        let tool = not_installed();
        assert_eq!(tool.id, "aider");
        assert_eq!(tool.name, "Aider");
        assert!(!tool.installed);
        assert!(tool.version.is_none());
        assert!(tool.install_path.is_none());
        assert!(tool.skills.is_empty());
        assert!(tool.mcps.is_empty());
        assert!(tool.error.is_none());
    }
}
