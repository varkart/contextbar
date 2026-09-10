//! Gemini CLI (Antigravity's sibling CLI): no cache accounting.

use super::generic::{bucket_for_tool, classify_output_with};
use super::{OutBucket, TokenAttributor};
use crate::engine::history::types::ContentBlock;

pub struct GeminiAttributor;

impl TokenAttributor for GeminiAttributor {
    fn agent_id(&self) -> &'static str {
        "gemini"
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
            "replace" | "edit" => OutBucket::Edit,
            "write_file" => OutBucket::Write,
            "run_shell_command" => OutBucket::Shell,
            "search_file_content" | "glob" | "read_file" | "read_many_files" | "list_directory" => {
                OutBucket::Search
            }
            other => bucket_for_tool(other),
        })
    }
}
