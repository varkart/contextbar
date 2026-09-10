//! Antigravity (`agy`): planner/model steps, screaming-snake tool names.

use super::generic::{bucket_for_tool, classify_output_with};
use super::{OutBucket, TokenAttributor};
use crate::engine::history::types::ContentBlock;

pub struct AgyAttributor;

impl TokenAttributor for AgyAttributor {
    fn agent_id(&self) -> &'static str {
        "agy"
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
            "EDIT_FILE" | "REPLACE" | "WRITE_TO_FILE" => OutBucket::Edit,
            "CREATE_FILE" => OutBucket::Write,
            "RUN_COMMAND" => OutBucket::Shell,
            "GREP_SEARCH" | "VIEW_FILE" | "FIND" | "CODEBASE_SEARCH" | "LIST_DIR" => {
                OutBucket::Search
            }
            other => bucket_for_tool(other),
        })
    }
}
