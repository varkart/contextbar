use crate::models::AiTool;

fn not_installed() -> AiTool {
    AiTool {
        id: "amazonq".to_string(),
        name: "Amazon Q".to_string(),
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

    // Check ~/.aws/amazonq/ or ~/.q/
    let amazonq_dir = home.join(".aws").join("amazonq");
    let q_dir = home.join(".q");

    let (installed, install_path) = if amazonq_dir.is_dir() {
        (true, Some(amazonq_dir.to_string_lossy().to_string()))
    } else if q_dir.is_dir() {
        (true, Some(q_dir.to_string_lossy().to_string()))
    } else {
        (false, None)
    };

    if !installed {
        return not_installed();
    }

    AiTool {
        id: "amazonq".to_string(),
        name: "Amazon Q".to_string(),
        version: None,
        installed: true,
        install_path,
        skills: vec![],
        mcps: vec![],
        error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn run_detect_in(tmp_home: &std::path::Path) -> AiTool {
        let amazonq_dir = tmp_home.join(".aws").join("amazonq");
        let q_dir = tmp_home.join(".q");

        let (installed, install_path) = if amazonq_dir.is_dir() {
            (true, Some(amazonq_dir.to_string_lossy().to_string()))
        } else if q_dir.is_dir() {
            (true, Some(q_dir.to_string_lossy().to_string()))
        } else {
            (false, None)
        };

        if !installed {
            return not_installed();
        }

        AiTool {
            id: "amazonq".to_string(),
            name: "Amazon Q".to_string(),
            version: None,
            installed: true,
            install_path,
            skills: vec![],
            mcps: vec![],
            error: None,
        }
    }

    #[test]
    fn test_not_installed() {
        let tmp = TempDir::new().unwrap();
        let tool = run_detect_in(tmp.path());
        assert!(!tool.installed);
        assert!(tool.install_path.is_none());
    }

    #[test]
    fn test_detected_via_aws_amazonq() {
        let tmp = TempDir::new().unwrap();
        fs::create_dir_all(tmp.path().join(".aws").join("amazonq")).unwrap();
        let tool = run_detect_in(tmp.path());
        assert!(tool.installed);
        assert!(tool.install_path.unwrap().contains("amazonq"));
    }

    #[test]
    fn test_detected_via_q_dir() {
        let tmp = TempDir::new().unwrap();
        fs::create_dir_all(tmp.path().join(".q")).unwrap();
        let tool = run_detect_in(tmp.path());
        assert!(tool.installed);
        assert!(tool.install_path.unwrap().ends_with(".q"));
    }

    #[test]
    fn test_aws_dir_takes_precedence_over_q() {
        let tmp = TempDir::new().unwrap();
        fs::create_dir_all(tmp.path().join(".aws").join("amazonq")).unwrap();
        fs::create_dir_all(tmp.path().join(".q")).unwrap();
        let tool = run_detect_in(tmp.path());
        assert!(tool.installed);
        assert!(tool.install_path.unwrap().contains("amazonq"));
    }
}
