//! Claude Code: full cache accounting, rich tool vocabulary, thinking blocks
//! captured as `reasoning_chars`.

use super::generic::{bucket_for_tool, classify_output_with};
use super::{OutBucket, TokenAttributor};
use crate::engine::history::types::ContentBlock;

pub struct ClaudeAttributor;

impl TokenAttributor for ClaudeAttributor {
    fn agent_id(&self) -> &'static str {
        "claude"
    }

    fn classify_output(
        &self,
        blocks: &[ContentBlock],
        reasoning_chars: u32,
    ) -> Vec<(OutBucket, u64)> {
        classify_output_with(blocks, reasoning_chars, |name| match name {
            "Edit" | "MultiEdit" | "NotebookEdit" => OutBucket::Edit,
            "Write" => OutBucket::Write,
            "Bash" | "BashOutput" | "KillShell" => OutBucket::Shell,
            "Grep" | "Glob" | "Read" | "NotebookRead" | "WebFetch" | "WebSearch" => {
                OutBucket::Search
            }
            "Skill" | "Task" | "TodoWrite" | "ExitPlanMode" => OutBucket::ToolOther,
            other => bucket_for_tool(other),
        })
    }
}
