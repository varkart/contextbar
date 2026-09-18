//! Cross-agent session handoff — when a session's source agent is out of
//! budget/rate limit and you need to switch to a different coding agent
//! mid-task. Has the *target* agent's own CLI condense the *source* agent's
//! transcript into a briefing (no model API key of this app's own needed),
//! falling back to the raw transcript when the target has no headless mode
//! or the condensing call fails.

use super::history::SessionDetail;
use super::sessions;
use std::path::{Path, PathBuf};

pub struct GeneratedHandoff {
    pub file_path: PathBuf,
    pub content: String,
    /// True when the target agent successfully condensed the transcript;
    /// false when `content` is the raw transcript instead.
    pub condensed: bool,
    pub caveat: Option<String>,
}

/// Plain-text render of a session's messages — the same "one block of text"
/// shape the existing "copy whole conversation" feature produces, built here
/// in Rust since generating a handoff runs a subprocess and can't happen in
/// the frontend.
fn format_transcript(detail: &SessionDetail) -> String {
    let mut out = String::new();
    for msg in &detail.messages {
        let who = if msg.role == "user" {
            "User"
        } else {
            "Assistant"
        };
        out.push_str("### ");
        out.push_str(who);
        out.push_str("\n\n");
        for block in &msg.content {
            match block.block_type.as_str() {
                "text" => {
                    if let Some(t) = &block.text {
                        out.push_str(t);
                        out.push_str("\n\n");
                    }
                }
                "tool_use" => {
                    let name = block.tool_name.as_deref().unwrap_or("tool");
                    out.push_str("[calls ");
                    out.push_str(name);
                    out.push(']');
                    if let Some(input) = &block.tool_input {
                        out.push(' ');
                        out.push_str(input);
                    }
                    out.push_str("\n\n");
                }
                "tool_result" => {
                    if let Some(r) = &block.tool_result {
                        let truncated: String = r.chars().take(2000).collect();
                        out.push_str("[result] ");
                        out.push_str(&truncated);
                        if truncated.len() < r.len() {
                            out.push('…');
                        }
                        out.push_str("\n\n");
                    }
                }
                _ => {}
            }
        }
    }
    out
}

fn condense_prompt(source_agent: &str, transcript: &str) -> String {
    format!(
        "You're receiving a coding session transcript from a different AI \
         coding agent ({source_agent}) so a developer can continue the same \
         work with you instead. Read the transcript below and write a \
         concise handoff briefing for yourself to read at the start of the \
         new session: the overall goal, key decisions already made and why, \
         current state (files/branch changed, what's done vs not), and the \
         immediate next step. Output only the briefing itself, in plain \
         markdown — no preamble, no questions back.\n\n---\n\n{transcript}"
    )
}

fn raw_fallback_content(source_agent: &str, transcript: &str) -> String {
    format!(
        "_Raw transcript from {source_agent} — automatic condensing wasn't \
         available for this handoff, so this is the full session instead. \
         Skim for the goal, what's already done, and the next step._\n\n---\n\n{transcript}"
    )
}

/// Minimal Gregorian calendar conversion (Howard Hinnant's `civil_from_days`)
/// so handoff filenames get a human timestamp without a date/time crate.
fn civil_from_unix_secs(secs: i64) -> (i64, u32, u32, u32, u32, u32) {
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (hour, minute, second) = (
        (rem / 3600) as u32,
        ((rem % 3600) / 60) as u32,
        (rem % 60) as u32,
    );
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d, hour, minute, second)
}

fn handoff_filename(source_agent: &str, target_agent: &str) -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let (y, mo, d, h, mi, s) = civil_from_unix_secs(secs);
    format!("handoff-{source_agent}-to-{target_agent}-{y:04}{mo:02}{d:02}-{h:02}{mi:02}{s:02}.md")
}

/// Runs `source_agent`'s session through `target_agent`'s headless mode to
/// produce a condensed handoff briefing (or falls back to the raw
/// transcript), writes it into `project`, and returns the result. Does not
/// launch a terminal — the `generate_handoff` Tauri command does that
/// afterward, since terminal launching is OS-integration code that lives in
/// lib.rs alongside `resume_in_terminal`.
pub fn generate(
    project: &Path,
    source_agent: &str,
    session_id: &str,
    target_agent: &str,
) -> Result<GeneratedHandoff, String> {
    let source = sessions::source_for(source_agent).ok_or("unknown source agent")?;
    let detail = source
        .get(session_id)
        .ok_or("session not found for handoff")?;
    let target = sessions::source_for(target_agent).ok_or("unknown target agent")?;

    let transcript = format_transcript(&detail);
    let caveat = target.handoff_caveat().map(str::to_string);

    let tmp_prompt = std::env::temp_dir().join(format!(
        "handoff-condense-request-{}-{}.md",
        std::process::id(),
        session_id.replace(['/', '\\'], "_")
    ));
    let condensed_text: Option<String> = (|| {
        std::fs::write(&tmp_prompt, condense_prompt(source_agent, &transcript)).ok()?;
        let cmd = target.headless_command(&tmp_prompt)?;
        let output = crate::doctor::shell_command("sh")
            .arg("-c")
            .arg(&cmd)
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        (!text.is_empty()).then_some(text)
    })();
    let _ = std::fs::remove_file(&tmp_prompt);

    let (content, condensed) = match condensed_text {
        Some(text) => (text, true),
        None => (raw_fallback_content(source_agent, &transcript), false),
    };

    let file_name = handoff_filename(source_agent, target_agent);
    let file_path = project.join(&file_name);
    std::fs::write(&file_path, &content)
        .map_err(|e| format!("failed to write {file_name}: {e}"))?;

    Ok(GeneratedHandoff {
        file_path,
        content,
        condensed,
        caveat,
    })
}

/// Agents that can be a handoff target: every registered session source
/// except `exclude` (the session's own source agent — handing off to
/// yourself isn't meaningful), annotated with their capabilities and caveat
/// text for the picker. Filtering to installed agents and ranking by usage
/// is the frontend's job — it already has both (the tools list, the session
/// list) without another round trip here.
pub struct HandoffCandidate {
    pub agent_id: &'static str,
    pub supports_condensing: bool,
    pub supports_seeding: bool,
    pub caveat: Option<&'static str>,
}

pub fn candidates(exclude: &str) -> Vec<HandoffCandidate> {
    sessions::sources()
        .into_iter()
        .filter(|s| s.agent_id() != exclude)
        .map(|s| {
            let probe = Path::new("/tmp/__handoff_probe__.md");
            HandoffCandidate {
                agent_id: s.agent_id(),
                supports_condensing: s.headless_command(probe).is_some(),
                supports_seeding: s.seed_interactive_command(probe).is_some(),
                caveat: s.handoff_caveat(),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::history::types::{ContentBlock, Message, TokenUsage};

    fn detail(messages: Vec<Message>) -> SessionDetail {
        SessionDetail {
            agent: "claude".into(),
            session_id: "s1".into(),
            messages,
            total_tokens: TokenUsage::default(),
            model: None,
            duration_ms: None,
            project: "/tmp/proj".into(),
            project_name: "proj".into(),
            timestamp: 0,
            title: None,
        }
    }

    #[test]
    fn civil_from_unix_secs_matches_known_reference() {
        // 2023-11-14 22:13:20 UTC, a commonly-cited reference timestamp.
        assert_eq!(
            civil_from_unix_secs(1_700_000_000),
            (2023, 11, 14, 22, 13, 20)
        );
    }

    #[test]
    fn civil_from_unix_secs_epoch_is_1970() {
        assert_eq!(civil_from_unix_secs(0), (1970, 1, 1, 0, 0, 0));
    }

    #[test]
    fn handoff_filename_has_expected_shape() {
        let name = handoff_filename("claude", "codex");
        assert!(name.starts_with("handoff-claude-to-codex-"));
        assert!(name.ends_with(".md"));
        // handoff-claude-to-codex-YYYYMMDD-HHMMSS.md
        let stamp = name
            .strip_prefix("handoff-claude-to-codex-")
            .unwrap()
            .strip_suffix(".md")
            .unwrap();
        assert_eq!(stamp.len(), "YYYYMMDD-HHMMSS".len());
    }

    #[test]
    fn format_transcript_renders_text_and_tool_blocks() {
        let d = detail(vec![
            Message {
                role: "user".into(),
                content: vec![ContentBlock {
                    block_type: "text".into(),
                    text: Some("fix the login bug".into()),
                    ..Default::default()
                }],
                ..Default::default()
            },
            Message {
                role: "assistant".into(),
                content: vec![
                    ContentBlock {
                        block_type: "tool_use".into(),
                        tool_name: Some("Edit".into()),
                        tool_input: Some("auth.py".into()),
                        ..Default::default()
                    },
                    ContentBlock {
                        block_type: "tool_result".into(),
                        tool_result: Some("applied".into()),
                        ..Default::default()
                    },
                    ContentBlock {
                        block_type: "text".into(),
                        text: Some("Fixed it.".into()),
                        ..Default::default()
                    },
                ],
                ..Default::default()
            },
        ]);
        let text = format_transcript(&d);
        assert!(text.contains("### User"));
        assert!(text.contains("fix the login bug"));
        assert!(text.contains("### Assistant"));
        assert!(text.contains("[calls Edit] auth.py"));
        assert!(text.contains("[result] applied"));
        assert!(text.contains("Fixed it."));
    }

    #[test]
    fn format_transcript_truncates_long_tool_results() {
        let long = "x".repeat(3000);
        let d = detail(vec![Message {
            role: "assistant".into(),
            content: vec![ContentBlock {
                block_type: "tool_result".into(),
                tool_result: Some(long),
                ..Default::default()
            }],
            ..Default::default()
        }]);
        let text = format_transcript(&d);
        assert!(text.contains('…'));
        assert!(text.len() < 2500);
    }

    #[test]
    fn raw_fallback_content_notes_it_is_unsummarized() {
        let content = raw_fallback_content("claude", "the transcript");
        assert!(content.contains("Raw transcript from claude"));
        assert!(content.contains("the transcript"));
    }

    #[test]
    fn candidates_excludes_the_source_agent() {
        let list = candidates("claude");
        assert!(!list.iter().any(|c| c.agent_id == "claude"));
        assert!(list.iter().any(|c| c.agent_id == "codex"));
    }

    #[test]
    fn codex_and_claude_and_agy_support_both_condensing_and_seeding() {
        let list = candidates("__none__");
        for id in ["claude", "codex", "agy"] {
            let c = list.iter().find(|c| c.agent_id == id).unwrap();
            assert!(c.supports_condensing, "{id} should support condensing");
            assert!(c.supports_seeding, "{id} should support seeding");
        }
    }

    #[test]
    fn opencode_supports_condensing_but_not_seeding() {
        let list = candidates("__none__");
        let oc = list.iter().find(|c| c.agent_id == "opencode").unwrap();
        assert!(oc.supports_condensing);
        assert!(!oc.supports_seeding);
        assert!(oc.caveat.is_some());
    }
}
