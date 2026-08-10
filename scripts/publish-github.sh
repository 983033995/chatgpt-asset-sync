#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="${1:-}"
VISIBILITY="${2:-}"

if [[ -z "$REPOSITORY" || -z "$VISIBILITY" ]]; then
  echo "Usage: $0 <owner/repo> <public|private>"
  echo "Example: $0 983033995/chatgpt-asset-sync public"
  exit 1
fi

if [[ "$VISIBILITY" != "public" && "$VISIBILITY" != "private" ]]; then
  echo "Visibility must be public or private."
  exit 1
fi

command -v gh >/dev/null || { echo "GitHub CLI (gh) is required."; exit 1; }

git init -b main 2>/dev/null || true
git add .
if ! git diff --cached --quiet; then
  git commit -m "feat: initialize ChatGPT Asset Sync"
fi

gh repo create "$REPOSITORY" "--$VISIBILITY" --source=. --remote=origin --push
