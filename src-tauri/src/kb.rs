//! Notes & Todos knowledge base.
//!
//! Plain markdown files under `~/.context-bar/kb`, so agents can read them
//! through the `context-bar` skill and users can edit them with any editor:
//!
//! ```text
//! kb/todos/<id>.md     one todo per file (frontmatter + optional details)
//! kb/notes/<id>.md     one note per file
//! kb/.trash/<kind>/    deleted items, kept so delete can be undone
//! kb/history.jsonl     append-only activity log (created, done, ...)
//! kb/index.md          generated list of items shared with agents
//! ```

use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Todo,
    Note,
}

impl Kind {
    fn dir(self) -> &'static str {
        match self {
            Kind::Todo => "todos",
            Kind::Note => "notes",
        }
    }
    fn as_str(self) -> &'static str {
        match self {
            Kind::Todo => "todo",
            Kind::Note => "note",
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KbItem {
    pub id: String,
    pub kind: Kind,
    pub title: String,
    pub body: String,
    pub tags: Vec<String>,
    pub shared: bool,
    /// Unix ms.
    pub created: i64,
    pub updated: i64,
    pub done: Option<i64>,
    /// Who wrote it when not the user, e.g. `agent:claude`.
    pub source: Option<String>,
    pub path: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Front {
    #[serde(default)]
    title: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    tags: Vec<String>,
    #[serde(default)]
    shared: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    created: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    updated: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    done: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEvent {
    pub ts: i64,
    pub kind: Kind,
    pub action: String,
    pub id: String,
    pub title: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Patch {
    pub title: Option<String>,
    pub body: Option<String>,
    pub tags: Option<Vec<String>>,
    pub shared: Option<bool>,
}

pub fn root() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".context-bar").join("kb"))
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Timestamps: ISO-8601 UTC in files, Unix ms over IPC
// ---------------------------------------------------------------------------

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (
        if m <= 2 {
            yoe + era * 400 + 1
        } else {
            yoe + era * 400
        },
        m,
        d,
    )
}

pub fn format_iso(ms: i64) -> String {
    let secs = ms.div_euclid(1000);
    let (y, m, d) = civil_from_days(secs.div_euclid(86400));
    let s = secs.rem_euclid(86400);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        s / 3600,
        (s % 3600) / 60,
        s % 60
    )
}

/// Accepts `YYYY-MM-DD`, `YYYY-MM-DDTHH:MM[:SS][.fff]Z` (UTC only).
pub fn parse_iso(s: &str) -> Option<i64> {
    let s = s.trim().trim_end_matches('Z');
    let (date, time) = s.split_once(['T', ' ']).unwrap_or((s, "00:00:00"));
    let mut dp = date.split('-').map(|p| p.parse::<i64>().ok());
    let (y, mo, d) = (dp.next()??, dp.next()??, dp.next()??);
    if !(1..=12).contains(&mo) || !(1..=31).contains(&d) {
        return None;
    }
    let time = time.split('.').next().unwrap_or("");
    let mut tp = time.split(':').map(|p| p.parse::<i64>().ok());
    let h = tp.next().flatten().unwrap_or(0);
    let mi = tp.next().flatten().unwrap_or(0);
    let se = tp.next().flatten().unwrap_or(0);
    Some((days_from_civil(y, mo, d) * 86400 + h * 3600 + mi * 60 + se) * 1000)
}

// ---------------------------------------------------------------------------
// Parsing / serializing items
// ---------------------------------------------------------------------------

fn split_front(text: &str) -> (Option<&str>, &str) {
    let t = text.strip_prefix('\u{feff}').unwrap_or(text);
    if let Some(rest) = t
        .strip_prefix("---\n")
        .or_else(|| t.strip_prefix("---\r\n"))
    {
        for marker in ["\n---\n", "\n---\r\n"] {
            if let Some(end) = rest.find(marker) {
                return (Some(&rest[..end]), &rest[end + marker.len()..]);
            }
        }
        if let Some(fm) = rest.strip_suffix("\n---") {
            return (Some(fm), "");
        }
    }
    (None, t)
}

fn file_mtime_ms(path: &Path) -> i64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or_else(now_ms)
}

fn parse_item(path: &Path, kind: Kind, text: &str) -> Option<KbItem> {
    let id = path.file_stem()?.to_str()?.to_string();
    let (fm, body) = split_front(text);
    // Files written by hand or by an agent may have no (or broken)
    // frontmatter — keep them, using the first line as the title.
    let front: Front = fm
        .and_then(|f| serde_yaml::from_str(f).ok())
        .unwrap_or_default();
    let body = body.trim_start_matches(['\n', '\r']).trim_end().to_string();
    let (title, body) = if front.title.trim().is_empty() {
        let mut lines = body.lines();
        let first = lines
            .next()
            .unwrap_or("")
            .trim_start_matches(['#', '-', '*', ' '])
            .trim()
            .to_string();
        if kind == Kind::Todo {
            (
                first,
                lines.collect::<Vec<_>>().join("\n").trim().to_string(),
            )
        } else {
            (String::new(), body)
        }
    } else {
        (front.title.trim().to_string(), body)
    };
    let mtime = file_mtime_ms(path);
    let created = front
        .created
        .as_deref()
        .and_then(parse_iso)
        .unwrap_or(mtime);
    Some(KbItem {
        id,
        kind,
        title,
        body,
        tags: front.tags,
        shared: front.shared,
        created,
        updated: front
            .updated
            .as_deref()
            .and_then(parse_iso)
            .unwrap_or(created),
        done: if kind == Kind::Todo {
            front.done.as_deref().and_then(parse_iso)
        } else {
            None
        },
        source: front.source,
        path: path.to_string_lossy().into_owned(),
    })
}

fn render_item(item: &KbItem) -> String {
    let front = Front {
        title: item.title.clone(),
        tags: item.tags.clone(),
        shared: item.shared,
        created: Some(format_iso(item.created)),
        updated: Some(format_iso(item.updated)),
        done: item.done.map(format_iso),
        source: item.source.clone(),
    };
    let yaml = serde_yaml::to_string(&front).unwrap_or_default();
    let mut out = format!("---\n{}---\n", yaml.trim_start_matches("---\n"));
    if !item.body.trim().is_empty() {
        out.push('\n');
        out.push_str(item.body.trim_end());
        out.push('\n');
    }
    out
}

fn write_atomic(path: &Path, content: &str) -> Result<(), String> {
    let dir = path.parent().ok_or("bad path")?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = dir.join(format!(
        ".{}.tmp",
        path.file_name().and_then(|n| n.to_str()).unwrap_or("item")
    ));
    std::fs::write(&tmp, content).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// Ids become file names, so only a safe slug alphabet is accepted.
fn valid_id(id: &str) -> Result<(), String> {
    let ok = !id.is_empty()
        && id.len() <= 120
        && !id.starts_with(['.', '-'])
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if ok {
        Ok(())
    } else {
        Err(format!("invalid item id: {id}"))
    }
}

fn item_path(root: &Path, kind: Kind, id: &str) -> Result<PathBuf, String> {
    valid_id(id)?;
    Ok(root.join(kind.dir()).join(format!("{id}.md")))
}

fn slug(text: &str) -> String {
    let mut out = String::new();
    for c in text.to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
        if out.len() >= 40 {
            break;
        }
    }
    out.trim_end_matches('-').to_string()
}

fn new_id(root: &Path, kind: Kind, title: &str, ms: i64) -> String {
    let (y, m, d) = civil_from_days(ms.div_euclid(86_400_000));
    let s = slug(title);
    let base = if s.is_empty() {
        format!("{y:04}{m:02}{d:02}-{}", kind.as_str())
    } else {
        format!("{y:04}{m:02}{d:02}-{s}")
    };
    let mut id = base.clone();
    let mut n = 2;
    while root.join(kind.dir()).join(format!("{id}.md")).exists() {
        id = format!("{base}-{n}");
        n += 1;
    }
    id
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

fn log_event(root: &Path, item: &KbItem, action: &str) {
    let ev = HistoryEvent {
        ts: now_ms(),
        kind: item.kind,
        action: action.into(),
        id: item.id.clone(),
        title: display_title(item),
    };
    let _ = std::fs::create_dir_all(root);
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(root.join("history.jsonl"))
    {
        if let Ok(line) = serde_json::to_string(&ev) {
            let _ = writeln!(f, "{line}");
        }
    }
}

fn display_title(item: &KbItem) -> String {
    if !item.title.trim().is_empty() {
        return item.title.trim().to_string();
    }
    item.body
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("Untitled note")
        .chars()
        .take(80)
        .collect()
}

/// Newest first.
pub fn history(root: &Path, limit: usize) -> Vec<HistoryEvent> {
    let text = std::fs::read_to_string(root.join("history.jsonl")).unwrap_or_default();
    text.lines()
        .rev()
        .filter_map(|l| serde_json::from_str(l).ok())
        .take(limit)
        .collect()
}

/// Notes autosave while typing; log one "edited" per note per 10 minutes.
const EDIT_LOG_WINDOW_MS: i64 = 10 * 60_000;

fn recently_logged_edit(root: &Path, id: &str, now: i64) -> bool {
    history(root, 200)
        .iter()
        .take_while(|e| now - e.ts < EDIT_LOG_WINDOW_MS)
        .any(|e| e.id == id && e.action == "edited")
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

pub fn list(root: &Path) -> Vec<KbItem> {
    let mut items = Vec::new();
    for kind in [Kind::Todo, Kind::Note] {
        let Ok(entries) = std::fs::read_dir(root.join(kind.dir())) else {
            continue;
        };
        for e in entries.flatten() {
            let path = e.path();
            let name = e.file_name();
            let name = name.to_string_lossy();
            if name.starts_with('.') || path.extension().and_then(|x| x.to_str()) != Some("md") {
                continue;
            }
            if path.file_stem().and_then(|s| s.to_str()).map(valid_id) != Some(Ok(())) {
                continue;
            }
            if let Ok(text) = std::fs::read_to_string(&path) {
                if let Some(item) = parse_item(&path, kind, &text) {
                    items.push(item);
                }
            }
        }
    }
    items.sort_by(|a, b| b.created.cmp(&a.created).then(a.id.cmp(&b.id)));
    items
}

pub fn get(root: &Path, kind: Kind, id: &str) -> Result<KbItem, String> {
    let path = item_path(root, kind, id)?;
    let text = std::fs::read_to_string(&path).map_err(|_| format!("{id} not found"))?;
    parse_item(&path, kind, &text).ok_or_else(|| format!("{id} could not be read"))
}

fn save(root: &Path, item: &KbItem) -> Result<(), String> {
    write_atomic(&item_path(root, item.kind, &item.id)?, &render_item(item))
}

pub fn create(
    root: &Path,
    kind: Kind,
    title: &str,
    body: &str,
    tags: Vec<String>,
) -> Result<KbItem, String> {
    let title = title.trim();
    if title.is_empty() && body.trim().is_empty() && kind == Kind::Todo {
        return Err("todo text is empty".into());
    }
    let now = now_ms();
    let id = new_id(root, kind, if title.is_empty() { body } else { title }, now);
    let mut item = KbItem {
        id,
        kind,
        title: title.to_string(),
        body: body.to_string(),
        tags: clean_tags(tags),
        shared: false,
        created: now,
        updated: now,
        done: None,
        source: None,
        path: String::new(),
    };
    save(root, &item)?;
    item.path = item_path(root, kind, &item.id)?
        .to_string_lossy()
        .into_owned();
    log_event(root, &item, "created");
    write_index(root);
    Ok(item)
}

fn clean_tags(tags: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for t in tags {
        let t = t.trim().to_lowercase();
        if !t.is_empty() && !out.contains(&t) {
            out.push(t);
        }
    }
    out
}

pub fn update(root: &Path, kind: Kind, id: &str, patch: Patch) -> Result<KbItem, String> {
    let mut item = get(root, kind, id)?;
    let content_changed = patch.title.as_ref().is_some_and(|t| *t != item.title)
        || patch
            .body
            .as_ref()
            .is_some_and(|b| b.trim_end() != item.body);
    let share_changed = patch.shared.is_some_and(|s| s != item.shared);
    if let Some(t) = patch.title {
        item.title = t;
    }
    if let Some(b) = patch.body {
        item.body = b;
    }
    if let Some(tags) = patch.tags {
        item.tags = clean_tags(tags);
    }
    if let Some(s) = patch.shared {
        item.shared = s;
    }
    let now = now_ms();
    item.updated = now;
    save(root, &item)?;
    if content_changed && !recently_logged_edit(root, id, now) {
        log_event(root, &item, "edited");
    }
    if share_changed {
        log_event(root, &item, if item.shared { "shared" } else { "unshared" });
    }
    write_index(root);
    Ok(item)
}

pub fn set_done(root: &Path, id: &str, done: bool) -> Result<KbItem, String> {
    let mut item = get(root, Kind::Todo, id)?;
    if item.done.is_some() == done {
        return Ok(item);
    }
    let now = now_ms();
    item.done = done.then_some(now);
    item.updated = now;
    save(root, &item)?;
    log_event(root, &item, if done { "done" } else { "reopened" });
    write_index(root);
    Ok(item)
}

pub fn delete(root: &Path, kind: Kind, id: &str) -> Result<(), String> {
    let item = get(root, kind, id)?;
    let from = item_path(root, kind, id)?;
    let trash = root.join(".trash").join(kind.dir());
    std::fs::create_dir_all(&trash).map_err(|e| e.to_string())?;
    std::fs::rename(&from, trash.join(format!("{id}.md"))).map_err(|e| e.to_string())?;
    log_event(root, &item, "deleted");
    write_index(root);
    Ok(())
}

pub fn undelete(root: &Path, kind: Kind, id: &str) -> Result<KbItem, String> {
    valid_id(id)?;
    let from = root
        .join(".trash")
        .join(kind.dir())
        .join(format!("{id}.md"));
    let to = item_path(root, kind, id)?;
    if to.exists() {
        return Err(format!("{id} already exists"));
    }
    std::fs::create_dir_all(to.parent().ok_or("bad path")?).map_err(|e| e.to_string())?;
    std::fs::rename(&from, &to).map_err(|_| format!("{id} is not in the trash"))?;
    let item = get(root, kind, id)?;
    log_event(root, &item, "restored");
    write_index(root);
    Ok(item)
}

pub fn open_todo_count(root: &Path) -> usize {
    list(root)
        .iter()
        .filter(|i| i.kind == Kind::Todo && i.done.is_none())
        .count()
}

// ---------------------------------------------------------------------------
// Agent-facing index
// ---------------------------------------------------------------------------

/// Regenerates `index.md`: the shared items only, which is all the
/// `context-bar` skill tells agents to read.
pub fn write_index(root: &Path) {
    let items = list(root);
    let shared: Vec<&KbItem> = items.iter().filter(|i| i.shared).collect();
    let _ = write_atomic(&root.join("index.md"), &render_index(&shared));
}

fn render_index(shared: &[&KbItem]) -> String {
    let mut out = String::from(
        "# Context Bar knowledge base\n\n\
         Generated by Context Bar. Do not edit; it is rewritten on every change.\n\
         Lists only the notes and todos the user chose to share with agents.\n\
         Tags: `global` applies everywhere, `repo:<name>` to one repository,\n\
         `agent:<id>` to one agent. Untagged items count as global.\n",
    );
    let section = |out: &mut String, heading: &str, items: Vec<&&KbItem>| {
        out.push_str(&format!("\n## {heading}\n\n"));
        if items.is_empty() {
            out.push_str("_None shared._\n");
        }
        for i in items {
            let tags = if i.tags.is_empty() {
                "global".to_string()
            } else {
                i.tags.join(", ")
            };
            out.push_str(&format!(
                "- [{}]({}/{}.md) ({tags}; updated {})\n",
                display_title(i).replace(['[', ']'], ""),
                i.kind.dir(),
                i.id,
                &format_iso(i.updated)[..10],
            ));
        }
    };
    section(
        &mut out,
        "Open todos",
        shared
            .iter()
            .filter(|i| i.kind == Kind::Todo && i.done.is_none())
            .collect(),
    );
    section(
        &mut out,
        "Notes",
        shared.iter().filter(|i| i.kind == Kind::Note).collect(),
    );
    out
}

pub const SKILL_NAME: &str = "context-bar";

/// SKILL.md installed into agents' skill folders.
pub fn skill_content(root: &Path) -> String {
    let root = root.to_string_lossy();
    format!(
        r#"---
name: {SKILL_NAME}
description: The user's own notes and todos from Context Bar, shared with coding agents. Use when starting work in a repository, when the user mentions their notes, todos, preferences or conventions, or asks what is left to do.
---

# Context Bar notes and todos

The user keeps notes and todos in Context Bar and chooses which ones to share
with agents. Shared items are listed in `{root}/index.md`.

## Reading

1. Read `{root}/index.md`. It lists only shared items.
2. Open the linked files (paths are relative to `{root}`) whose tags apply:
   - `global`, or no tags: always applies.
   - `repo:<name>`: only when working in the repository with that folder name.
   - `agent:<id>`: only when you are that agent (claude, codex, gemini, ...).
3. Treat notes as the user's standing preferences and context. Treat open
   todos as the user's own task list; mention relevant ones, but do not start
   on them unless asked.

Do not read other files in `{root}`. Items not in the index are private.

## Writing

Never edit, rename or delete existing files. To suggest a new todo for the
user, create a new file `{root}/todos/<yyyymmdd>-<short-slug>.md`:

```markdown
---
title: <one line>
source: agent:<your id>
---

<optional details>
```

Context Bar shows it to the user, who decides whether to keep or share it.
"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn iso_round_trip() {
        let ms = 1_794_316_980_000; // 2026-11-10T13:23:00Z
        assert_eq!(format_iso(ms), "2026-11-10T13:23:00Z");
        assert_eq!(parse_iso("2026-11-10T13:23:00Z"), Some(ms));
        assert_eq!(parse_iso("2026-11-10T13:23:00.123Z"), Some(ms));
        assert_eq!(parse_iso("2026-11-10"), Some(1_794_268_800_000));
        assert_eq!(parse_iso("2026-13-10"), None);
        assert_eq!(parse_iso("nonsense"), None);
    }

    #[test]
    fn create_list_round_trip() {
        let d = tmp();
        let t = create(
            d.path(),
            Kind::Todo,
            "Fix login bug",
            "",
            vec!["Repo:app".into()],
        )
        .unwrap();
        let n = create(d.path(), Kind::Note, "", "Prefer pnpm\nalways", vec![]).unwrap();
        assert!(t.id.ends_with("fix-login-bug"));
        assert_eq!(t.tags, vec!["repo:app"]);
        let items = list(d.path());
        assert_eq!(items.len(), 2);
        let got_t = items.iter().find(|i| i.id == t.id).unwrap();
        assert_eq!(got_t.title, "Fix login bug");
        assert_eq!(got_t.created / 1000, t.created / 1000);
        let got_n = items.iter().find(|i| i.id == n.id).unwrap();
        assert_eq!(got_n.body, "Prefer pnpm\nalways");
        assert_eq!(got_n.title, "");
    }

    #[test]
    fn duplicate_titles_get_unique_ids() {
        let d = tmp();
        let a = create(d.path(), Kind::Todo, "Same", "", vec![]).unwrap();
        let b = create(d.path(), Kind::Todo, "Same", "", vec![]).unwrap();
        assert_ne!(a.id, b.id);
        assert!(b.id.ends_with("-2"));
    }

    #[test]
    fn complete_reopen_and_history() {
        let d = tmp();
        let t = create(d.path(), Kind::Todo, "Ship it", "", vec![]).unwrap();
        assert_eq!(open_todo_count(d.path()), 1);
        let done = set_done(d.path(), &t.id, true).unwrap();
        assert!(done.done.is_some());
        assert_eq!(open_todo_count(d.path()), 0);
        set_done(d.path(), &t.id, false).unwrap();
        let actions: Vec<String> = history(d.path(), 10)
            .into_iter()
            .map(|e| e.action)
            .collect();
        assert_eq!(actions, vec!["reopened", "done", "created"]);
    }

    #[test]
    fn edits_are_logged_once_per_window() {
        let d = tmp();
        let n = create(d.path(), Kind::Note, "N", "a", vec![]).unwrap();
        for body in ["ab", "abc", "abcd"] {
            update(
                d.path(),
                Kind::Note,
                &n.id,
                Patch {
                    body: Some(body.into()),
                    ..Default::default()
                },
            )
            .unwrap();
        }
        let edits = history(d.path(), 10)
            .iter()
            .filter(|e| e.action == "edited")
            .count();
        assert_eq!(edits, 1);
        assert_eq!(get(d.path(), Kind::Note, &n.id).unwrap().body, "abcd");
    }

    #[test]
    fn delete_and_undelete() {
        let d = tmp();
        let n = create(d.path(), Kind::Note, "Gone", "", vec![]).unwrap();
        delete(d.path(), Kind::Note, &n.id).unwrap();
        assert!(list(d.path()).is_empty());
        let back = undelete(d.path(), Kind::Note, &n.id).unwrap();
        assert_eq!(back.title, "Gone");
        assert_eq!(list(d.path()).len(), 1);
    }

    #[test]
    fn rejects_path_traversal_ids() {
        let d = tmp();
        for bad in ["../x", "a/b", ".hidden", "", "a.b"] {
            assert!(get(d.path(), Kind::Note, bad).is_err(), "{bad}");
            assert!(delete(d.path(), Kind::Note, bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn agent_written_file_without_frontmatter_is_read() {
        let d = tmp();
        let dir = d.path().join("todos");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("20261110-from-agent.md"),
            "# Bump deps\n\nminor only\n",
        )
        .unwrap();
        std::fs::write(
            dir.join("20261110-with-front.md"),
            "---\ntitle: Review PR\nsource: agent:codex\n---\n",
        )
        .unwrap();
        std::fs::write(dir.join("notes.txt"), "ignored").unwrap();
        let items = list(d.path());
        assert_eq!(items.len(), 2);
        let a = items
            .iter()
            .find(|i| i.id == "20261110-from-agent")
            .unwrap();
        assert_eq!(
            (a.title.as_str(), a.body.as_str()),
            ("Bump deps", "minor only")
        );
        let b = items
            .iter()
            .find(|i| i.id == "20261110-with-front")
            .unwrap();
        assert_eq!(b.source.as_deref(), Some("agent:codex"));
        assert!(!b.shared);
    }

    #[test]
    fn index_lists_only_shared_open_items() {
        let d = tmp();
        let a = create(d.path(), Kind::Todo, "Shared todo", "", vec![]).unwrap();
        create(d.path(), Kind::Todo, "Private todo", "", vec![]).unwrap();
        let n = create(d.path(), Kind::Note, "Style", "", vec!["repo:app".into()]).unwrap();
        update(
            d.path(),
            Kind::Todo,
            &a.id,
            Patch {
                shared: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        update(
            d.path(),
            Kind::Note,
            &n.id,
            Patch {
                shared: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        let idx = std::fs::read_to_string(d.path().join("index.md")).unwrap();
        assert!(idx.contains("Shared todo"));
        assert!(idx.contains(&format!("todos/{}.md", a.id)));
        assert!(idx.contains("(global;"));
        assert!(idx.contains("(repo:app;"));
        assert!(!idx.contains("Private todo"));
        set_done(d.path(), &a.id, true).unwrap();
        let idx = std::fs::read_to_string(d.path().join("index.md")).unwrap();
        assert!(!idx.contains("Shared todo"));
    }

    #[test]
    fn file_format_is_readable_markdown() {
        let d = tmp();
        let t = create(
            d.path(),
            Kind::Todo,
            "Write docs",
            "details here",
            vec!["global".into()],
        )
        .unwrap();
        let text = std::fs::read_to_string(&t.path).unwrap();
        assert!(text.starts_with("---\ntitle: Write docs\n"));
        assert!(text.contains("tags:\n- global\n"));
        assert!(text.contains("shared: false\n"));
        assert!(text.ends_with("---\n\ndetails here\n"));
    }

    #[test]
    fn skill_mentions_index_path() {
        let s = skill_content(Path::new("/Users/x/.context-bar/kb"));
        assert!(s.starts_with("---\nname: context-bar\n"));
        assert!(s.contains("/Users/x/.context-bar/kb/index.md"));
    }
}
