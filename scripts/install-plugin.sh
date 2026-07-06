#!/usr/bin/env bash
# Install Philosophi into an Obsidian vault's plugins folder.
# Usage: ./scripts/install-plugin.sh /path/to/your/vault

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VAULT="${1:-}"

if [[ -z "$VAULT" ]]; then
  echo "Usage: $0 /path/to/obsidian/vault"
  echo ""
  echo "Example:"
  echo "  $0 ~/Documents/MyVault"
  exit 1
fi

if [[ ! -d "$VAULT" ]]; then
  echo "Error: vault path does not exist: $VAULT"
  exit 1
fi

PLUGIN_DIR="$VAULT/.obsidian/plugins/philosophi"
mkdir -p "$PLUGIN_DIR"

echo "Building Philosophi..."
(cd "$ROOT" && npm run build)

echo "Installing to $PLUGIN_DIR"
cp "$ROOT/manifest.json" "$ROOT/main.js" "$ROOT/styles.css" "$PLUGIN_DIR/"

echo ""
echo "Done. In Obsidian:"
echo "  1. Settings → Community plugins → Turn on community plugins"
echo "  2. Reload plugins (or restart Obsidian)"
echo "  3. Enable Philosophi"
echo "  4. Click the grid ribbon icon → Create a writing project"
