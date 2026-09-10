//! Kiro: session files carry no token usage, so attribution yields nothing;
//! the generic classifier is enough for the tool-shape it does record.

use super::generic::classify_output_with;
use super::{OutBucket, TokenAttributor};
use crate::engine::history::types::ContentBlock;

pub struct KiroAttributor;

impl TokenAttributor for KiroAttributor {
    fn agent_id(&self) -> &'static str {
        "kiro"
    }
    fn has_cache_semantics(&self) -> bool {
        false
    }
    fn classify_output(
        &self,
        blocks: &[ContentBlock],
        reasoning_chars: u32,
    ) -> Vec<(OutBucket, u64)> {
        classify_output_with(blocks, reasoning_chars, super::generic::bucket_for_tool)
    }
}
