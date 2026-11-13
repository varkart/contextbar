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

/// Fallback for hand- or agent-written headers that aren't valid YAML,
/// e.g. `title: Fix: crash`. Reads simple `key: value` lines.
fn lenient_front(fm: &str) -> Front {
    let mut f = Front::default();
    for line in fm.lines() {
        let Some((k, v)) = line.split_once(':') else {
            continue;
        };
        let v = v.trim();
        let unquoted = v
            .strip_prefix('"')
            .and_then(|x| x.strip_suffix('"'))
            .or_else(|| v.strip_prefix('\'').and_then(|x| x.strip_suffix('\'')))
            .unwrap_or(v)
            .to_string();
        match k.trim() {
            "title" => f.title = unquoted,
            "source" if !unquoted.is_empty() => f.source = Some(unquoted),
            "shared" => f.shared = unquoted == "true",
            "created" if !unquoted.is_empty() => f.created = Some(unquoted),
            "updated" if !unquoted.is_empty() => f.updated = Some(unquoted),
            "done" if !unquoted.is_empty() => f.done = Some(unquoted),
            "tags" => {
                f.tags = unquoted
                    .trim_matches(['[', ']'])
                    .split(',')
                    .map(|t| t.trim().trim_matches(['"', '\'']).to_string())
                    .filter(|t| !t.is_empty())
                    .collect()
            }
            _ => {}
        }
    }
    f
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
        .map(|f| serde_yaml::from_str(f).unwrap_or_else(|_| lenient_front(f)))
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
    let taken = |id: &str| {
        let f = format!("{id}.md");
        root.join(kind.dir()).join(&f).exists()
            || root.join(".trash").join(kind.dir()).join(&f).exists()
    };
    while taken(&id) {
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
    trim_history(root);
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

/// history.jsonl is read on every save; keep it bounded by dropping the
/// oldest half once it passes HISTORY_MAX_BYTES.
const HISTORY_MAX_BYTES: u64 = 2 * 1024 * 1024;

fn trim_history(root: &Path) {
    let path = root.join("history.jsonl");
    if std::fs::metadata(&path).map_or(true, |m| m.len() <= HISTORY_MAX_BYTES) {
        return;
    }
    let Ok(text) = std::fs::read_to_string(&path) else {
        return;
    };
    let lines: Vec<&str> = text.lines().collect();
    let keep = lines[lines.len() / 2..].join("\n") + "\n";
    let _ = write_atomic(&path, &keep);
}

fn display_title(item: &KbItem) -> String {
    if !item.title.trim().is_empty() {
        return item.title.trim().to_string();
    }
    item.body
        .lines()
        .map(str::trim)
        .map(|l| l.trim_start_matches('#').trim())
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

#[cfg(test)]
pub fn create(
    root: &Path,
    kind: Kind,
    title: &str,
    body: &str,
    tags: Vec<String>,
) -> Result<KbItem, String> {
    create_at(root, kind, title, body, tags, 0)
}

/// `tz_offset_min` (minutes east of UTC) dates the id by the user's local day.
pub fn create_at(
    root: &Path,
    kind: Kind,
    title: &str,
    body: &str,
    tags: Vec<String>,
    tz_offset_min: i64,
) -> Result<KbItem, String> {
    let title = title.trim();
    if title.is_empty() && body.trim().is_empty() && kind == Kind::Todo {
        return Err("todo text is empty".into());
    }
    let now = now_ms();
    let tz = tz_offset_min.clamp(-14 * 60, 14 * 60) * 60_000;
    let id = new_id(
        root,
        kind,
        if title.is_empty() { body } else { title },
        now + tz,
    );
    let mut item = KbItem {
        id,
        kind,
        title: title.to_string(),
        body: body.trim_end().to_string(),
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
    let content_changed = patch.title.as_ref().is_some_and(|t| t.trim() != item.title)
        || patch
            .body
            .as_ref()
            .is_some_and(|b| b.trim_end() != item.body);
    let share_changed = patch.shared.is_some_and(|s| s != item.shared);
    if let Some(t) = patch.title {
        item.title = t.trim().to_string();
    }
    if let Some(b) = patch.body {
        item.body = b.trim_start_matches(['\n', '\r']).trim_end().to_string();
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

#[derive(Debug, Clone, Deserialize)]
pub struct ItemRef {
    pub kind: Kind,
    pub id: String,
}

/// Shares (or unshares) many items at once, rewriting the index once.
/// Items that are missing or already in that state are skipped.
pub fn set_shared_many(root: &Path, refs: &[ItemRef], shared: bool) -> Vec<KbItem> {
    let now = now_ms();
    let mut out = Vec::new();
    for r in refs {
        let Ok(mut item) = get(root, r.kind, &r.id) else {
            continue;
        };
        if item.shared != shared {
            item.shared = shared;
            item.updated = now;
            if save(root, &item).is_err() {
                continue;
            }
            log_event(root, &item, if shared { "shared" } else { "unshared" });
        }
        out.push(item);
    }
    write_index(root);
    out
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
user, create a new file `{root}/todos/<yyyymmdd>-<short-slug>.md`. Use only
lowercase letters, digits and dashes in the name; other files are ignored.

```markdown
---
title: "<one line, in double quotes>"
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
    fn update_returns_what_a_reread_gives() {
        let d = tmp();
        let n = create(d.path(), Kind::Note, "", "x", vec![]).unwrap();
        let p = Patch {
            title: Some(" T ".into()),
            body: Some("milk \n\n".into()),
            ..Default::default()
        };
        let u = update(d.path(), Kind::Note, &n.id, p).unwrap();
        let again = get(d.path(), Kind::Note, &n.id).unwrap();
        assert_eq!((u.title.as_str(), u.body.as_str()), ("T", "milk"));
        assert_eq!((again.title, again.body), (u.title, u.body));
    }

    #[test]
    fn invalid_yaml_header_keeps_title_and_source() {
        let d = tmp();
        let dir = d.path().join("todos");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("20260101-fix.md"),
            "---\ntitle: Fix: crash on [start]\nsource: agent:codex\n---\n\ndetails\n",
        )
        .unwrap();
        let t = get(d.path(), Kind::Todo, "20260101-fix").unwrap();
        assert_eq!(t.title, "Fix: crash on [start]");
        assert_eq!(t.source.as_deref(), Some("agent:codex"));
        assert_eq!(t.body, "details");
    }

    #[test]
    fn history_is_trimmed_when_large() {
        let d = tmp();
        let line = format!("{}\n", "x".repeat(1023));
        let big = line.repeat((HISTORY_MAX_BYTES / 1024 + 10) as usize);
        std::fs::write(d.path().join("history.jsonl"), big).unwrap();
        create(d.path(), Kind::Todo, "After", "", vec![]).unwrap();
        let len = std::fs::metadata(d.path().join("history.jsonl"))
            .unwrap()
            .len();
        assert!(len < HISTORY_MAX_BYTES, "{len}");
        assert_eq!(history(d.path(), 1)[0].title, "After");
    }

    #[test]
    fn shares_many_and_indexes_once() {
        let d = tmp();
        let a = create(d.path(), Kind::Todo, "A", "", vec![]).unwrap();
        let n = create(d.path(), Kind::Note, "N", "x", vec![]).unwrap();
        let refs = vec![
            ItemRef {
                kind: Kind::Todo,
                id: a.id.clone(),
            },
            ItemRef {
                kind: Kind::Note,
                id: n.id.clone(),
            },
            ItemRef {
                kind: Kind::Note,
                id: "missing".into(),
            },
        ];
        let out = set_shared_many(d.path(), &refs, true);
        assert_eq!(out.len(), 2);
        assert!(out.iter().all(|i| i.shared));
        let index = std::fs::read_to_string(d.path().join("index.md")).unwrap();
        assert!(index.contains("[A]") && index.contains("[N]"));
        let shared = history(d.path(), 10)
            .iter()
            .filter(|e| e.action == "shared")
            .count();
        assert_eq!(shared, 2);
        set_shared_many(d.path(), &refs, true);
        let again = history(d.path(), 10)
            .iter()
            .filter(|e| e.action == "shared")
            .count();
        assert_eq!(again, 2, "already shared items are not logged again");
    }

    #[test]
    fn display_title_drops_heading_marks() {
        let d = tmp();
        let n = create(d.path(), Kind::Note, "", "## Setup\nuse pnpm", vec![]).unwrap();
        assert_eq!(display_title(&n), "Setup");
    }

    #[test]
    fn new_ids_skip_names_in_trash() {
        let d = tmp();
        let a = create(d.path(), Kind::Todo, "Same", "", vec![]).unwrap();
        delete(d.path(), Kind::Todo, &a.id).unwrap();
        let b = create(d.path(), Kind::Todo, "Same", "", vec![]).unwrap();
        assert_ne!(a.id, b.id);
    }

    #[test]
    fn ids_use_the_local_day() {
        let d = tmp();
        let local = now_ms() + 14 * 3_600_000;
        let (y, m, dd) = civil_from_days(local.div_euclid(86_400_000));
        let t = create_at(d.path(), Kind::Todo, "Late", "", vec![], 14 * 60).unwrap();
        assert!(
            t.id.starts_with(&format!("{y:04}{m:02}{dd:02}-")),
            "{}",
            t.id
        );
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

// ---------------------------------------------------------------------------
// IPC commands, tray badge and file watching
// ---------------------------------------------------------------------------

pub mod commands {
    use super::*;
    use tauri::{AppHandle, Emitter};

    pub const TRAY_ID: &str = "main";

    fn kb_root() -> Result<PathBuf, String> {
        root().ok_or_else(|| "cannot resolve home dir".to_string())
    }

    /// Open todo count next to the menu bar icon; hidden at zero.
    pub fn refresh_badge(app: &AppHandle) {
        let Some(root) = root() else { return };
        let n = open_todo_count(&root);
        if let Some(tray) = app.tray_by_id(TRAY_ID) {
            let title = (n > 0).then(|| n.to_string());
            let _ = tray.set_title(title.as_deref());
        }
    }

    fn changed(app: &AppHandle) {
        refresh_badge(app);
        let _ = app.emit("kb-changed", ());
    }

    #[tauri::command]
    pub async fn kb_list() -> Result<Vec<KbItem>, String> {
        let root = kb_root()?;
        tokio::task::spawn_blocking(move || list(&root))
            .await
            .map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub async fn kb_history(limit: Option<usize>) -> Result<Vec<HistoryEvent>, String> {
        let root = kb_root()?;
        tokio::task::spawn_blocking(move || history(&root, limit.unwrap_or(500)))
            .await
            .map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn kb_create(
        app: AppHandle,
        kind: Kind,
        title: String,
        body: Option<String>,
        tags: Option<Vec<String>>,
        tz_offset: Option<i64>,
    ) -> Result<KbItem, String> {
        let item = create_at(
            &kb_root()?,
            kind,
            &title,
            body.as_deref().unwrap_or(""),
            tags.unwrap_or_default(),
            tz_offset.unwrap_or(0),
        )?;
        changed(&app);
        Ok(item)
    }

    #[tauri::command]
    pub fn kb_update(
        app: AppHandle,
        kind: Kind,
        id: String,
        patch: Patch,
    ) -> Result<KbItem, String> {
        let item = update(&kb_root()?, kind, &id, patch)?;
        changed(&app);
        Ok(item)
    }

    #[tauri::command]
    pub fn kb_set_done(app: AppHandle, id: String, done: bool) -> Result<KbItem, String> {
        let item = set_done(&kb_root()?, &id, done)?;
        changed(&app);
        Ok(item)
    }

    #[tauri::command]
    pub fn kb_set_shared(
        app: AppHandle,
        items: Vec<ItemRef>,
        shared: bool,
    ) -> Result<Vec<KbItem>, String> {
        let out = set_shared_many(&kb_root()?, &items, shared);
        changed(&app);
        Ok(out)
    }

    #[tauri::command]
    pub fn kb_delete(app: AppHandle, kind: Kind, id: String) -> Result<(), String> {
        delete(&kb_root()?, kind, &id)?;
        changed(&app);
        Ok(())
    }

    #[tauri::command]
    pub fn kb_undelete(app: AppHandle, kind: Kind, id: String) -> Result<KbItem, String> {
        let item = undelete(&kb_root()?, kind, &id)?;
        changed(&app);
        Ok(item)
    }

    /// Writes the `context-bar` skill into each agent's skills folder.
    /// Overwrites only a previous copy of this same skill.
    #[tauri::command]
    pub fn kb_install_skill(app: AppHandle, agent_ids: Vec<String>) -> Result<Vec<String>, String> {
        let root = kb_root()?;
        std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        write_index(&root);
        let content = skill_content(&root);
        let mut paths = Vec::new();
        let mut errors = Vec::new();
        for agent_id in &agent_ids {
            let target = match crate::skill_dir_for(agent_id) {
                Ok(t) => t,
                Err(e) => {
                    errors.push(format!("{agent_id}: {e}"));
                    continue;
                }
            };
            let path = if target.flat_files {
                target.dir.join(format!("{SKILL_NAME}.md"))
            } else {
                target.dir.join(SKILL_NAME).join("SKILL.md")
            };
            if let Ok(existing) = std::fs::read_to_string(&path) {
                if !existing.contains(&format!("name: {SKILL_NAME}\n")) {
                    errors.push(format!(
                        "{agent_id}: a different '{SKILL_NAME}' skill already exists"
                    ));
                    continue;
                }
            }
            match write_atomic(&path, &content) {
                Ok(()) => paths.push(path.to_string_lossy().into_owned()),
                Err(e) => errors.push(format!("{agent_id}: {e}")),
            }
        }
        let _ = app.emit("agents-changed", ());
        if paths.is_empty() && !errors.is_empty() {
            return Err(errors.join("; "));
        }
        Ok(paths)
    }

    /// Watches the kb folder so edits made outside the app (an editor, or an
    /// agent adding a todo) refresh the UI, badge and index.
    pub fn watch(app: AppHandle) {
        use notify_debouncer_mini::{new_debouncer, notify::RecursiveMode};
        let Some(root) = root() else { return };
        for kind in [Kind::Todo, Kind::Note] {
            let _ = std::fs::create_dir_all(root.join(kind.dir()));
        }
        write_index(&root);
        refresh_badge(&app);
        std::thread::spawn(move || {
            let (tx, rx) = std::sync::mpsc::channel();
            let Ok(mut debouncer) = new_debouncer(std::time::Duration::from_millis(400), tx) else {
                return;
            };
            if debouncer
                .watcher()
                .watch(&root, RecursiveMode::Recursive)
                .is_err()
            {
                return;
            }
            let real_root = root.canonicalize().unwrap_or_else(|_| root.clone());
            // A watcher error (e.g. a burst of events overflowing) is
            // transient; keep listening rather than going deaf.
            while let Ok(res) = rx.recv() {
                let Ok(events) = res else { continue };
                let relevant = events.iter().any(|e| {
                    let rel = e
                        .path
                        .strip_prefix(&real_root)
                        .or_else(|_| e.path.strip_prefix(&root));
                    rel.is_ok_and(is_item_path)
                });
                if relevant {
                    write_index(&root);
                    changed(&app);
                }
            }
        });
    }

    /// `todos/x.md` or `notes/x.md`; not index, history, trash or temp files.
    pub(super) fn is_item_path(rel: &Path) -> bool {
        let mut parts = rel.components().map(|c| c.as_os_str().to_string_lossy());
        let (Some(dir), Some(file), None) = (parts.next(), parts.next(), parts.next()) else {
            return false;
        };
        (dir == "todos" || dir == "notes") && !file.starts_with('.') && file.ends_with(".md")
    }
}

#[cfg(test)]
mod watch_tests {
    use super::commands::is_item_path;
    use std::path::Path;

    #[test]
    fn only_item_files_trigger_refresh() {
        assert!(is_item_path(Path::new("todos/a.md")));
        assert!(is_item_path(Path::new("notes/b.md")));
        assert!(!is_item_path(Path::new("index.md")));
        assert!(!is_item_path(Path::new("history.jsonl")));
        assert!(!is_item_path(Path::new("todos/.a.md.tmp")));
        assert!(!is_item_path(Path::new(".trash/todos/a.md")));
        assert!(!is_item_path(Path::new("todos")));
    }
}
