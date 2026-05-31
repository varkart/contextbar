use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();

        let mut debouncer = match new_debouncer(Duration::from_millis(500), tx) {
            Ok(d) => d,
            Err(_) => return,
        };

        // Watch all known AI tool config paths
        let paths: Vec<std::path::PathBuf> = {
            let home = match dirs::home_dir() {
                Some(h) => h,
                None => return,
            };
            vec![
                home.join(".claude").join("settings.json"),
                home.join(".claude").join("skills"),
                home.join(".cursor").join("mcp.json"),
                home.join(".cursor").join("skills-cursor"),
                home.join(".config").join("gemini"),
                home.join("Library").join("Application Support").join("Code").join("User").join("settings.json"),
                home.join("Library").join("Application Support").join("Windsurf").join("User").join("settings.json"),
            ]
        };

        use notify::RecursiveMode;
        for path in &paths {
            if path.exists() {
                let _ = debouncer.watcher().watch(path, RecursiveMode::Recursive);
            }
        }

        // Block on events
        loop {
            match rx.recv() {
                Ok(Ok(events)) => {
                    let has_relevant = events.iter().any(|e| {
                        matches!(e.kind, DebouncedEventKind::Any)
                    });
                    if has_relevant {
                        let _ = app.emit("tools-changed", ());
                    }
                }
                Ok(Err(_)) | Err(_) => break,
            }
        }
    });
}
