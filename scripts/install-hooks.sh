#!/usr/bin/env bash
# Install git hooks for this repo.
# Run once after cloning: bash scripts/install-hooks.sh

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"
HOOK="$HOOKS_DIR/pre-commit"
SCRIPT="$REPO_ROOT/scripts/pre-commit-check.sh"

chmod +x "$SCRIPT"

if [ -f "$HOOK" ] && [ ! -L "$HOOK" ]; then
  echo "Existing pre-commit hook found. Backing up to $HOOK.bak"
  cp "$HOOK" "$HOOK.bak"
fi

ln -sf "$SCRIPT" "$HOOK"
echo "Installed: $HOOK → $SCRIPT"
echo "Pre-commit checks will warn on manifest issues (non-blocking)."
