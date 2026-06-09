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
