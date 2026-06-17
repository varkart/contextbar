#!/usr/bin/env bash
# Warn-only pre-commit check for LLM manifest files.
# Exits 0 always — warnings are informational, not blocking.
# Install: bash scripts/install-hooks.sh

set -euo pipefail

STAGED_MANIFESTS=$(git diff --cached --name-only | grep "src-tauri/src/engine/manifests/.*\.toml$" || true)
STAGED_MOD=$(git diff --cached --name-only | grep "src-tauri/src/engine/mod\.rs$" || true)
NEW_MANIFESTS=$(git diff --cached --name-status | grep "^A" | awk '{print $2}' | grep "src-tauri/src/engine/manifests/.*\.toml$" || true)

# Nothing manifest-related staged — skip all checks
if [ -z "$STAGED_MANIFESTS" ]; then
  exit 0
fi

WARNINGS=0

warn() {
  echo "  ⚠  $1" >&2
  WARNINGS=$((WARNINGS + 1))
}

echo "[onboard-check] Validating staged manifest(s)..." >&2

# 1. cargo check
source "$HOME/.cargo/env" 2>/dev/null || true
if command -v cargo &>/dev/null; then
  if ! cargo check --manifest-path src-tauri/Cargo.toml -q 2>/dev/null; then
    warn "cargo check failed — fix compile errors before merging"
  fi
else
  warn "cargo not found — skipping compile check"
fi

# 2. Per-manifest checks
for MANIFEST in $STAGED_MANIFESTS; do
  [ -f "$MANIFEST" ] || continue
  FILENAME=$(basename "$MANIFEST" .toml)

  # id must match filename
  MANIFEST_ID=$(grep "^id = " "$MANIFEST" 2>/dev/null | head -1 | sed 's/^id = "\(.*\)"/\1/' || true)
  if [ -z "$MANIFEST_ID" ]; then
    warn "$MANIFEST: missing 'id' field"
  elif [ "$MANIFEST_ID" != "$FILENAME" ]; then
    warn "$MANIFEST: id=\"$MANIFEST_ID\" does not match filename \"$FILENAME\""
  fi

  # schema_version required
  if ! grep -q "^schema_version" "$MANIFEST" 2>/dev/null; then
    warn "$MANIFEST: missing schema_version"
  fi

  # at least one detection spec
  if ! grep -q "^\[\[detection\]\]" "$MANIFEST" 2>/dev/null; then
    warn "$MANIFEST: no [[detection]] entries — tool will never be detected as installed"
  fi

  # version detection recommended
  if ! grep -q "^\[version\]" "$MANIFEST" 2>/dev/null; then
    warn "$MANIFEST: no [version] section — installed version will show as unknown"
  fi

  # must be registered in mod.rs
  if ! grep -q "\"$FILENAME\"" src-tauri/src/engine/mod.rs 2>/dev/null; then
    warn "$MANIFEST: not registered in src-tauri/src/engine/mod.rs — will never run"
  fi
done

# 3. New manifest added but mod.rs not staged
if [ -n "$NEW_MANIFESTS" ] && [ -z "$STAGED_MOD" ]; then
  warn "New manifest(s) added but src-tauri/src/engine/mod.rs not staged — did you register the tool in all_manifest_strs()?"
fi

# 4. New manifest added but .claude/llm-repos.md not updated
if [ -n "$NEW_MANIFESTS" ]; then
  REPOS_STAGED=$(git diff --cached --name-only | grep "\.claude/llm-repos\.md$" || true)
  if [ -z "$REPOS_STAGED" ]; then
    warn "New manifest added — update .claude/llm-repos.md with the GitHub/changelog URL for version monitoring"
  fi
fi

# 5. cargo test (quick — only if check passed)
if [ "$WARNINGS" -eq 0 ] && command -v cargo &>/dev/null; then
  if ! cargo test --manifest-path src-tauri/Cargo.toml -q 2>/dev/null; then
    warn "cargo test failed — all_manifests_parse_without_error or all_manifests_have_correct_id may be failing"
  fi
fi

# Summary
if [ "$WARNINGS" -gt 0 ]; then
  echo "[onboard-check] $WARNINGS warning(s) found. Commit proceeding (warn-only). Run /onboard-llm to address gaps." >&2
else
  echo "[onboard-check] All checks passed." >&2
fi

exit 0
