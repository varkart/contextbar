use std::path::PathBuf;

// ---------------------------------------------------------------------------
// npm binary discovery
// ---------------------------------------------------------------------------

fn find_npm() -> Option<PathBuf> {
    // Check common static locations first (faster, works even if PATH is minimal
    // in a macOS menu-bar app context).
    let static_paths = [
        "/opt/homebrew/bin/npm",
        "/usr/local/bin/npm",
        "/usr/bin/npm",
    ];
    for p in &static_paths {
        let path = std::path::Path::new(p);
        if path.exists() {
            return Some(path.to_path_buf());
        }
    }

    // nvm: resolve the default alias version
    if let Some(home) = dirs::home_dir() {
        let alias_file = home.join(".nvm").join("alias").join("default");
        if let Ok(version_raw) = std::fs::read_to_string(alias_file) {
            let version = version_raw.trim();
            if !version.is_empty() {
                let npm = home
                    .join(".nvm")
                    .join("versions")
                    .join("node")
                    .join(version)
                    .join("bin")
                    .join("npm");
                if npm.exists() {
                    return Some(npm);
                }
            }
        }
    }

    // Fall back to PATH
    std::env::var("PATH").ok().and_then(|path_var| {
        path_var.split(':').find_map(|dir| {
            let p = std::path::Path::new(dir).join("npm");
            if p.exists() {
                Some(p)
            } else {
                None
            }
        })
    })
}

// ---------------------------------------------------------------------------
// Package name extraction
// ---------------------------------------------------------------------------

/// Extract the npm package name from an npx-style MCP command.
/// Returns None for non-npx commands or commands with no identifiable package.
pub fn npm_package_from_mcp(command: &str, args: &[String]) -> Option<String> {
    if command != "npx" {
        return None;
    }
    let mut skip_next = false;
    for arg in args {
        if skip_next {
            skip_next = false;
            continue;
        }
        // Flags whose next arg is a value, not a package
        if arg == "-p" || arg == "--package" || arg == "--node-arg" {
            skip_next = true;
            continue;
        }
        if arg.starts_with('-') {
            continue;
        }
        // First non-flag arg is the package name.
        // Strip optional version specifier (e.g. @scope/pkg@1.2.3 → @scope/pkg).
        // rfind('@') with filter(i > 0) skips the leading @ of scoped packages.
        let name = if let Some(at) = arg.rfind('@').filter(|&i| i > 0) {
            &arg[..at]
        } else {
            arg.as_str()
        };
        return Some(name.to_string());
    }
    None
}

// ---------------------------------------------------------------------------
// Installed version query (sync — fast, single package)
// ---------------------------------------------------------------------------

pub fn get_npm_installed_version(package_name: &str) -> Option<String> {
    let npm = find_npm()?;
    let output = std::process::Command::new(&npm)
        .args(["ls", "-g", "--json", "--depth=0", package_name])
        .output()
        .ok()?;

    // npm ls exits non-zero when the package is missing; treat either way
    let json: serde_json::Value = serde_json::from_slice(&output.stdout).ok()?;
    json.get("dependencies")?
        .get(package_name)?
        .get("version")?
        .as_str()
        .map(|s| s.to_string())
}

// ---------------------------------------------------------------------------
// Install (async — can take tens of seconds)
// ---------------------------------------------------------------------------

pub async fn install_npm_global(package_name: &str) -> Result<String, String> {
    let npm = find_npm().ok_or_else(|| "npm not found on this system".to_string())?;

    let output = tokio::process::Command::new(&npm)
        .args(["install", "-g", package_name])
        .output()
        .await
        .map_err(|e| format!("failed to spawn npm: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("npm install failed: {stderr}"));
    }

    // Re-query installed version to confirm
    let version =
        get_npm_installed_version(package_name).unwrap_or_else(|| "installed".to_string());
    Ok(version)
}

// ---------------------------------------------------------------------------
// Rollback (uninstall) — used if post-install validation fails
// ---------------------------------------------------------------------------

#[allow(dead_code)]
pub async fn uninstall_npm_global(package_name: &str) -> Result<(), String> {
    let npm = find_npm().ok_or_else(|| "npm not found".to_string())?;
    let output = tokio::process::Command::new(&npm)
        .args(["uninstall", "-g", package_name])
        .output()
        .await
        .map_err(|e| format!("failed to spawn npm: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("npm uninstall failed: {stderr}"));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Latest version from registry (async — network call)
// ---------------------------------------------------------------------------

pub async fn get_npm_latest_version(package_name: &str) -> Option<String> {
    let npm = find_npm()?;
    let output = tokio::process::Command::new(&npm)
        .args(["view", package_name, "version"])
        .output()
        .await
        .ok()?;

    if !output.status.success() {
        return None;
    }
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if version.is_empty() {
        None
    } else {
        Some(version)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn args(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    // ── npm_package_from_mcp ─────────────────────────────────────────────────

    #[test]
    fn non_npx_command_returns_none() {
        assert!(npm_package_from_mcp("node", &args(&["server.js"])).is_none());
        assert!(npm_package_from_mcp("python3", &args(&["-m", "mcp"])).is_none());
        assert!(npm_package_from_mcp("", &[]).is_none());
    }

    #[test]
    fn npx_with_y_flag_extracts_package() {
        let pkg =
            npm_package_from_mcp("npx", &args(&["-y", "@modelcontextprotocol/server-github"]));
        assert_eq!(pkg, Some("@modelcontextprotocol/server-github".into()));
    }

    #[test]
    fn npx_without_flags_extracts_package() {
        let pkg = npm_package_from_mcp("npx", &args(&["my-mcp-server"]));
        assert_eq!(pkg, Some("my-mcp-server".into()));
    }

    #[test]
    fn npx_strips_version_specifier() {
        let pkg = npm_package_from_mcp("npx", &args(&["-y", "@scope/pkg@1.2.3"]));
        assert_eq!(pkg, Some("@scope/pkg".into()));
    }

    #[test]
    fn npx_scoped_package_no_version_keeps_at() {
        let pkg = npm_package_from_mcp("npx", &args(&["-y", "@anthropic/mcp-server"]));
        assert_eq!(pkg, Some("@anthropic/mcp-server".into()));
    }

    #[test]
    fn npx_p_flag_skips_next_arg() {
        // -p <package> is different from the positional package
        let pkg = npm_package_from_mcp("npx", &args(&["-p", "typescript", "tsc", "--version"]));
        // First non-flag after -p's value is "tsc"
        assert_eq!(pkg, Some("tsc".into()));
    }

    #[test]
    fn npx_extra_args_after_package_ignored() {
        let pkg = npm_package_from_mcp(
            "npx",
            &args(&[
                "-y",
                "@modelcontextprotocol/server-filesystem",
                "/home/user",
            ]),
        );
        assert_eq!(pkg, Some("@modelcontextprotocol/server-filesystem".into()));
    }

    #[test]
    fn npx_no_args_returns_none() {
        assert!(npm_package_from_mcp("npx", &[]).is_none());
    }

    #[test]
    fn npx_only_flags_returns_none() {
        assert!(npm_package_from_mcp("npx", &args(&["-y", "--yes"])).is_none());
    }
}
