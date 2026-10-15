#!/usr/bin/env bash
# Symlink the track tool and the accompanying plugin into an opencode global directory.
#
# opencode scans {tool,tools}/*.{ts,js}, {plugin,plugins}/*.{ts,js} and
# {agent,agents}/**/*.md inside each config directory. Two per-user config
# directories are scanned: ~/.config/opencode and ~/.opencode. Override the
# destination with OPENCODE_DOTDIR (e.g. OPENCODE_DOTDIR=~/.config/opencode).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${OPENCODE_DOTDIR:-$HOME/.opencode}"

mkdir -p "$DEST/tool" "$DEST/plugins"
ln -sfn "$REPO_DIR/tool/track.ts" "$DEST/tool/track.ts"
ln -sfn "$REPO_DIR/plugins/opencode-todo.ts" "$DEST/plugins/opencode-todo.ts"

echo "opencode-todo linked into:"
echo "  $DEST/tool/track.ts -> $REPO_DIR/tool/track.ts"
echo "  $DEST/plugins/opencode-todo.ts -> $REPO_DIR/plugins/opencode-todo.ts"
echo
echo "Restart opencode for the changes to take effect."
