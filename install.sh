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

mkdir -p "$DEST/plugins"

# The `track` tool is now registered by the plugin, so only the plugin is linked.
# Drop a standalone tool symlink left by older versions, otherwise `track` would
# be registered twice. Never touch a non-symlink or a symlink we don't own.
if [ -L "$DEST/tool/track.ts" ] && [ "$(readlink -f "$DEST/tool/track.ts" 2>/dev/null)" = "$REPO_DIR/tool/track.ts" ]; then
  rm -f "$DEST/tool/track.ts"
fi

ln -sfn "$REPO_DIR/plugins/opencode-subagent-todo.ts" "$DEST/plugins/opencode-subagent-todo.ts"

echo "opencode-subagent-todo linked into:"
echo "  $DEST/plugins/opencode-subagent-todo.ts -> $REPO_DIR/plugins/opencode-subagent-todo.ts"
echo
echo "Restart opencode for the changes to take effect."
