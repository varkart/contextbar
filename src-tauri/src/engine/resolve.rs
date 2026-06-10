/// Expand `~/` prefix to the actual home directory.
pub fn expand_home(path: &str, home: &std::path::Path) -> std::path::PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        home.join(rest)
    } else if path == "~" {
        home.to_path_buf()
    } else {
        std::path::PathBuf::from(path)
    }
}

/// Replace a template variable (e.g. `${extensionPath}`) with a concrete value.
pub fn replace_var(s: &str, var: &str, value: &str) -> String {
    s.replace(var, value)
}

/// Compare two dotted version strings (e.g. "1.2.3" vs "0.9"). Returns Ordering.
pub fn semver_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let parse = |s: &str| -> Vec<u64> {
        s.split('.').map(|p| p.parse::<u64>().unwrap_or(0)).collect()
    };
    let va = parse(a);
    let vb = parse(b);
    let len = va.len().max(vb.len());
    for i in 0..len {
        let x = va.get(i).copied().unwrap_or(0);
        let y = vb.get(i).copied().unwrap_or(0);
        match x.cmp(&y) {
            std::cmp::Ordering::Equal => continue,
            o => return o,
        }
    }
    std::cmp::Ordering::Equal
}

/// Returns true if `version` satisfies [min_version, max_version].
/// Either bound being None means unbounded. Version being None means no constraint check — returns true.
pub fn version_in_range(version: Option<&str>, min: Option<&str>, max: Option<&str>) -> bool {
    let Some(v) = version else { return true };
    if min.is_none() && max.is_none() {
        return true;
    }
    if let Some(lo) = min {
        if semver_cmp(v, lo) == std::cmp::Ordering::Less {
            return false;
        }
    }
    if let Some(hi) = max {
        if semver_cmp(v, hi) == std::cmp::Ordering::Greater {
            return false;
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expands_tilde() {
        let home = std::path::Path::new("/Users/test");
        assert_eq!(expand_home("~/.claude", home), std::path::PathBuf::from("/Users/test/.claude"));
    }

    #[test]
    fn leaves_absolute_path_unchanged() {
        let home = std::path::Path::new("/Users/test");
        assert_eq!(expand_home("/Applications/Zed.app", home), std::path::PathBuf::from("/Applications/Zed.app"));
    }

    #[test]
    fn replaces_var() {
        let result = replace_var("${extensionPath}/dist/index.js", "${extensionPath}", "/home/.gemini/extensions/foo");
        assert_eq!(result, "/home/.gemini/extensions/foo/dist/index.js");
    }
}
