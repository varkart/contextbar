use std::path::Path;

const MAX_SNAPSHOTS: usize = 20;

/// Directory where snapshots for a given config file are stored.
fn backup_dir(config_path: &str) -> std::path::PathBuf {
    let base = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("contextbar")
        .join("backups");

    // Sanitize the full path into a single dir name — replace path separators
    // and colons so the result is a valid single directory component.
    let sanitized = config_path
        .trim_start_matches('/')
        .replace(['/', '\\', ':'], "_");

    base.join(sanitized)
}

/// Copy `config_path` into its backup directory before a write.
///
/// Non-fatal: if the file does not exist yet or the backup dir cannot be
/// created, returns Ok without modifying anything. Errors are surfaced so
/// callers can log them, but should not abort the write because of a backup
/// failure.
pub fn snapshot(config_path: &str) -> Result<(), String> {
    let src = Path::new(config_path);
    if !src.exists() {
        return Ok(());
    }

    let dir = backup_dir(config_path);
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("cannot create backup dir {}: {e}", dir.display()))?;

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);

    let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("bak");
    let dest = dir.join(format!("{ts}.{ext}"));

    std::fs::copy(src, &dest).map_err(|e| format!("backup copy failed: {e}"))?;

    prune_old(&dir, MAX_SNAPSHOTS);
    Ok(())
}

/// List snapshots for a config file, newest first. Returns (timestamp_ms, path).
pub fn list_snapshots(config_path: &str) -> Vec<(u128, std::path::PathBuf)> {
    let dir = backup_dir(config_path);
    let mut entries: Vec<(u128, std::path::PathBuf)> = std::fs::read_dir(&dir)
        .map(|rd| {
            rd.flatten()
                .filter_map(|e| {
                    let name = e.file_name().to_string_lossy().to_string();
                    let ts: u128 = name.split('.').next()?.parse().ok()?;
                    Some((ts, e.path()))
                })
                .collect()
        })
        .unwrap_or_default();

    entries.sort_by_key(|b| std::cmp::Reverse(b.0)); // newest first
    entries
}

/// Restore a snapshot (identified by timestamp_ms) over config_path.
/// Atomically replaces the live file using temp-file + rename.
pub fn restore_snapshot(config_path: &str, timestamp_ms: u128) -> Result<(), String> {
    let _dir = backup_dir(config_path);
    let src = list_snapshots(config_path)
        .into_iter()
        .find(|(ts, _)| *ts == timestamp_ms)
        .map(|(_, p)| p)
        .ok_or_else(|| format!("snapshot {timestamp_ms} not found for {config_path}"))?;

    let tmp = format!("{config_path}.restore_tmp");
    std::fs::copy(&src, &tmp).map_err(|e| format!("cannot stage restore: {e}"))?;
    std::fs::rename(&tmp, config_path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("cannot atomically restore {config_path}: {e}")
    })
}

fn prune_old(dir: &Path, keep: usize) {
    let mut entries: Vec<_> = std::fs::read_dir(dir)
        .map(|rd| rd.flatten().collect())
        .unwrap_or_default();

    if entries.len() <= keep {
        return;
    }

    // Timestamp prefix → lexicographic sort = chronological.
    // Remove the oldest entries (smallest timestamps = lowest names).
    entries.sort_by_key(|e| e.file_name());
    for entry in &entries[..entries.len() - keep] {
        let _ = std::fs::remove_file(entry.path());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn write_config(dir: &Path, name: &str, content: &str) -> String {
        let p = dir.join(name);
        fs::write(&p, content).unwrap();
        p.to_string_lossy().to_string()
    }

    #[test]
    fn snapshot_creates_backup_file() {
        let tmp = TempDir::new().unwrap();
        let path = write_config(tmp.path(), "settings.json", r#"{"mcpServers":{}}"#);

        snapshot(&path).unwrap();

        let snaps = list_snapshots(&path);
        assert_eq!(snaps.len(), 1);
        let content = fs::read_to_string(&snaps[0].1).unwrap();
        assert_eq!(content, r#"{"mcpServers":{}}"#);
    }

    #[test]
    fn snapshot_missing_file_returns_ok() {
        let tmp = TempDir::new().unwrap();
        let path = tmp
            .path()
            .join("nonexistent.json")
            .to_string_lossy()
            .to_string();
        assert!(snapshot(&path).is_ok());
        assert!(list_snapshots(&path).is_empty());
    }

    #[test]
    fn list_snapshots_returns_newest_first() {
        let tmp = TempDir::new().unwrap();
        let path = write_config(tmp.path(), "s.json", "v1");

        snapshot(&path).unwrap();
        // Small sleep to guarantee different millisecond timestamp
        std::thread::sleep(std::time::Duration::from_millis(5));
        fs::write(&path, "v2").unwrap();
        snapshot(&path).unwrap();

        let snaps = list_snapshots(&path);
        assert_eq!(snaps.len(), 2);
        assert!(snaps[0].0 > snaps[1].0, "newest should be first");
    }

    #[test]
    fn prune_keeps_only_max_snapshots() {
        let tmp = TempDir::new().unwrap();
        let path = write_config(tmp.path(), "s.json", "content");

        for i in 0..25u32 {
            let dir = backup_dir(&path);
            fs::create_dir_all(&dir).unwrap();
            fs::write(dir.join(format!("{i:020}.json")), format!("snap{i}")).unwrap();
        }

        prune_old(&backup_dir(&path), MAX_SNAPSHOTS);

        let remaining = fs::read_dir(backup_dir(&path)).unwrap().count();
        assert_eq!(remaining, MAX_SNAPSHOTS);
    }

    #[test]
    fn restore_snapshot_replaces_live_file() {
        let tmp = TempDir::new().unwrap();
        let path = write_config(tmp.path(), "s.json", "original");

        snapshot(&path).unwrap();
        let (ts, _) = list_snapshots(&path).into_iter().next().unwrap();

        fs::write(&path, "modified").unwrap();
        restore_snapshot(&path, ts).unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "original");
    }

    #[test]
    fn restore_unknown_timestamp_returns_err() {
        let tmp = TempDir::new().unwrap();
        let path = write_config(tmp.path(), "s.json", "x");
        snapshot(&path).unwrap();
        let result = restore_snapshot(&path, 0);
        assert!(result.is_err());
    }
}
