//! OpenAI Codex CLI: no cache token accounting; `apply_patch` / `shell`.

use super::generic::{bucket_for_tool, classify_output_with};
use super::{OutBucket, TokenAttributor};
use crate::engine::history::types::ContentBlock;

pub struct CodexAttributor;

impl TokenAttributor for CodexAttributor {
    fn agent_id(&self) -> &'static str {
        "codex"
    }
    fn has_cache_semantics(&self) -> bool {
        false
    }
    fn classify_output(
        &self,
        blocks: &[ContentBlock],
        reasoning_chars: u32,
    ) -> Vec<(OutBucket, u64)> {
        classify_output_with(blocks, reasoning_chars, |name| match name {
            "apply_patch" | "applypatch" => OutBucket::Edit,
            "shell" | "exec_command" | "local_shell" => OutBucket::Shell,
            other => bucket_for_tool(other),
        })
    }
}
