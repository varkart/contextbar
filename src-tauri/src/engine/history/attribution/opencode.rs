//! OpenCode: reports input/output/cache tokens; lowercase tool names.

use super::generic::{bucket_for_tool, classify_output_with};
use super::{OutBucket, TokenAttributor};
use crate::engine::history::types::ContentBlock;

pub struct OpencodeAttributor;

impl TokenAttributor for OpencodeAttributor {
    fn agent_id(&self) -> &'static str {
        "opencode"
    }
    fn classify_output(
        &self,
        blocks: &[ContentBlock],
        reasoning_chars: u32,
    ) -> Vec<(OutBucket, u64)> {
        classify_output_with(blocks, reasoning_chars, |name| match name {
            "edit" | "patch" => OutBucket::Edit,
            "write" => OutBucket::Write,
            "bash" => OutBucket::Shell,
            "grep" | "glob" | "read" | "list" | "webfetch" => OutBucket::Search,
            other => bucket_for_tool(other),
        })
    }
}
