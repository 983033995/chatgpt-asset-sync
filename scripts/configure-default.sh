#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="${1:-}"
BRANCH="${2:-main}"
BASE_PATH="${3:-projects}"

if [[ -z "$REPOSITORY" ]]; then
  echo "Usage: $0 <owner/repo-or-github-url> [branch] [basePath]"
  exit 1
fi

cat > .env <<ENV
PORT=8787
GITHUB_TOKEN=${GITHUB_TOKEN:-}
ASSET_REPOSITORY=$REPOSITORY
ASSET_BRANCH=$BRANCH
ASSET_BASE_PATH=$BASE_PATH
CONFIG_STORE_PATH=./data/configs.json
ENV

echo "Configured default asset repository: $REPOSITORY ($BRANCH/$BASE_PATH)"
